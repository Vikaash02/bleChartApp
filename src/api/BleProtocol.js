/**
 * @file BleProtocol.js
 * @brief Medical Sensor Protocol Translation Layer (RumaH Protocol).
 * @version 1.1.0
 * @date 2023-10-27
 * 
 * @section arch_sec Architecture Overview
 * This file acts as the **Translation Layer** between the mobile application logic and the raw Bluetooth LE hardware.
 * It is responsible for two main tasks:
 * 1.  **Serialization:** Converting high-level application intent (e.g., "Start Scanning") into specific Byte Arrays needed by the sensor firmware.
 * 2.  **Deserialization:** Converting raw Base64-encoded byte streams received from the sensor into structured JavaScript Objects (PPG/ECG data).
 * 
 * @section flow_sec Process Flow
 * - **Outgoing:** UI -> `useSensorLogic` -> calls `build...Cmd` -> returns Base64 String -> `react-native-ble-plx` write.
 * - **Incoming:** Sensor -> `react-native-ble-plx` notification -> Base64 String -> `parseNotification` -> returns Data Objects -> UI Chart.
 * 
 * @section byte_sec Data Endianness
 * All multi-byte values in this protocol are **Big Endian (MSB First)**.
 * Example: The value 1000 (0x03E8) is transmitted as `[0x03, 0xE8]`.
 */

import { Buffer } from 'buffer';

/**
 * @defgroup UUIDs Bluetooth UUID Configuration
 * @brief Unique Identifiers for the hardware services and characteristics.
 * @{
 */

/**
 * @brief Configuration object containing target UUIDs.
 * @warning **CRITICAL HARDWARE CONFIGURATION:** These UUIDs are specific to the firmware version.
 * If the device connects but fails to read/write, verify these against the physical device using a BLE Scanner app (e.g., nRF Connect).
 */
export const SENSOR_UUIDS = {
  /** 
   * @brief The Primary Service UUID. 
   * Groups all medical measurement characteristics.
   */
  SERVICE: "0000180D-0000-1000-8000-00805F9B34FB", 

  /** 
   * @brief The Write Characteristic UUID.
   * Used to send commands (0x01, 0x08, 0x18, etc.) to the sensor.
   * Property: WRITE / WRITE_NO_RESPONSE.
   */
  WRITE_CHAR: "00002A37-0000-1000-8000-00805F9B34FB",

  /** 
   * @brief The Notification Characteristic UUID.
   * Used to receive the 0x8E Unsolicited Data packets.
   * Property: NOTIFY.
   */
  NOTIFY_CHAR: "00002A38-0000-1000-8000-00805F9B34FB",
};
/** @} */ // End of UUIDs group

/**
 * @enum {number}
 * @brief Command Byte Codes defined in the RumaH Protocol Specification.
 */
export const COMMANDS = {
  /** Verifies system connection. Payload: None. */
  CMD_SYS_PARAM_READ: 0x01,     
  /** Configures raw/result modes. Payload: Mode (U8) + Freq (U8). */
  CMD_SYS_SETTING_SET: 0x08,    
  /** Commands the sensor to begin streaming data packets. */
  CMD_SCAN_START: 0x18,         
  /** Commands the sensor to halt streaming. */
  CMD_SCAN_STOP: 0x1F,          
  /** 
   * Header byte for incoming streaming data. 
   * Indicates the packet contains raw waveform data.
   */
  RES_SYS_UNSOLICITED: 0x8E     
};

/**
 * @brief Configuration constants for the Sensor Mode.
 * Used as the first parameter in `CMD_SYS_SETTING_SET`.
 */
export const SYS_MODES = {
  RESULT_ONLY: 0x31, /**< ASCII '1'. Sensor calculates HR on-board. */
  RAW_ONLY: 0x32,    /**< ASCII '2'. Sensor sends raw waveform (Used in this App). */
  BOTH: 0x33         /**< ASCII '3'. Sensor sends both. */
};

/**
 * @brief Factory function to build the System Setting Command (0x08).
 * 
 * @details Constructs a 3-byte packet:
 * `[ 0x08 | MODE | FREQ ]`
 * 
 * @param {number} mode - The operation mode (Use `SYS_MODES` constants).
 * @param {number} freq - The sampling frequency (e.g., 200). Currently reserved/no-effect in firmware v1.0.
 * @return {string} A **Base64 encoded string** ready for `react-native-ble-plx` write operations.
 */
export const buildSysSettingCmd = (mode, freq) => {
  const buffer = Buffer.alloc(3);
  buffer.writeUInt8(COMMANDS.CMD_SYS_SETTING_SET, 0); // Byte 0: Command ID
  buffer.writeUInt8(mode, 1);                         // Byte 1: Result Mode
  buffer.writeUInt8(freq, 2);                         // Byte 2: Frequency
  return buffer.toString('base64');
};

/**
 * @brief Factory function to build simple, single-byte commands.
 * 
 * @details Used for commands like START (0x18), STOP (0x1F), and READ_PARAM (0x01).
 * Packet structure: `[ CMD_ID ]`
 * 
 * @param {number} cmdId - The hex code from `COMMANDS`.
 * @return {string} A **Base64 encoded string** ready for transmission.
 */
export const buildSimpleCmd = (cmdId) => {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(cmdId, 0);
  return buffer.toString('base64');
};

/**
 * @brief Deserializes a raw BLE notification packet into structured medical data.
 * 
 * @details 
 * **Packet Structure (Unsolicited 0x8E):**
 * The firmware sends packets containing TWO sets of measurements at once to optimize throughput.
 * 
 * | Byte Offset | Content | Type | Description |
 * | :--- | :--- | :--- | :--- |
 * | 0 | 0x8E | U8 | Header (Unsolicited Response) |
 * | 1 | Length | U8 | (Optional/Firmware dependent - skipped in logic) |
 * | 2-3 | PPG_IR_1 | U16 | Sample 1: InfraRed |
 * | 4-5 | PPG_RED_1 | U16 | Sample 1: Red Light |
 * | 6-7 | ECG_1 | U16 | Sample 1: Electrocardiogram |
 * | 8-9 | PPG_IR_2 | U16 | Sample 2: InfraRed |
 * | 10-11 | PPG_RED_2 | U16 | Sample 2: Red Light |
 * | 12-13 | ECG_2 | U16 | Sample 2: Electrocardiogram |
 * 
 * @note Uses `readUInt16BE` because the protocol is Big Endian.
 * 
 * @param {string} base64Data - The raw payload received from the BLE characteristic.
 * @return {Array<Object>|null} 
 * - Returns `null` if the packet is too short or malformed.
 * - Returns an `Array` containing 2 objects, each with `{ ppgIr, ppgRed, ecg }`.
 */
export const parseNotification = (base64Data) => {
  const buffer = Buffer.from(base64Data, 'base64');

  // Step 1: Protocol Alignment
  // We need to find where the actual data starts.
  // Standard protocol has 0x8E at index 0.
  let offset = 0;
  
  // Check for RumaH Unsolicited Header
  if (buffer[0] === COMMANDS.RES_SYS_UNSOLICITED) {
    offset = 2; // Skip Header (Byte 0) and Length/Type (Byte 1)
  }

  // Step 2: Validation
  // We expect 2 sets of 3 values (16-bit each). 
  // 2 sets * 3 channels * 2 bytes = 12 bytes of data.
  // We need at least 'offset + 12' bytes in the buffer.
  if (buffer.length < offset + 12) {
    console.warn("BleProtocol: Packet too short", buffer.length);
    return null;
  }

  const dataPoints = [];

  // Step 3: Parsing Set 1 (Time T)
  dataPoints.push({
    ppgIr:  buffer.readUInt16BE(offset),      // Bytes 2-3
    ppgRed: buffer.readUInt16BE(offset + 2),  // Bytes 4-5
    ecg:    buffer.readUInt16BE(offset + 4),  // Bytes 6-7
  });

  // Step 4: Parsing Set 2 (Time T + 5ms)
  dataPoints.push({
    ppgIr:  buffer.readUInt16BE(offset + 6),  // Bytes 8-9
    ppgRed: buffer.readUInt16BE(offset + 8),  // Bytes 10-11
    ecg:    buffer.readUInt16BE(offset + 10), // Bytes 12-13
  });

  return dataPoints;
};