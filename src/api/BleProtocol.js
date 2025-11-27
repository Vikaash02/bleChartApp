/**
 * @file BleProtocol.js
 * @brief Medical Sensor Protocol Translation Layer (RumaH Protocol).
 * @version 1.4.0 (CQ11 Support & Generic Parsing)
 * @date 2023-11-28
 * 
 * @section arch_sec Architecture Overview
 * This file acts as the **Translation Layer** between the mobile application logic and the raw Bluetooth LE hardware.
 * 
 * **Updates in v1.4.0:**
 * - **CQ11 Support:** Handshake logic updated to support ASCII transmission rates and simulation flags.
 * - **Generic Parsing:** The deserializer is now channel-agnostic. It parses the payload as a continuous stream of 16-bit integers.
 * 
 * @section flow_sec Process Flow
 * - **Outgoing:** UI -> `useSensorLogic` -> calls `build...Cmd` -> returns Base64 String -> `react-native-ble-plx` write.
 * - **Incoming:** Sensor -> `react-native-ble-plx` notification -> Base64 String -> `parseNotification` -> returns Array of Integers -> UI Chart.
 * 
 * @section byte_sec Data Endianness
 * All multi-byte values in this protocol are **Big Endian (MSB First)**.
 */

import { Buffer } from 'buffer';

/**
 * @defgroup UUIDs Bluetooth UUID Configuration
 * @brief Unique Identifiers for the hardware services and characteristics.
 * @{
 */

/**
 * @brief Configuration object containing target UUIDs.
 * @note Currently configured for **CQ11 Sensor**.
 */
export const SENSOR_UUIDS = {
  /** 
   * @brief The Primary Service UUID. 
   */
  SERVICE: "0000BEEB-5555-8888-2299-ba0987654321", 

  /** 
   * @brief The Write Characteristic UUID.
   * Used to send commands (0x01, 0x08, 0x18, etc.) to the sensor.
   * Property: WRITE / WRITE_NO_RESPONSE.
   */
  WRITE_CHAR: "0000CCCC-5555-8888-2299-ba0987654321",

  /** 
   * @brief The Notification Characteristic UUID.
   * Used to receive the 0x8E Unsolicited Data packets.
   * Property: NOTIFY.
   */
  NOTIFY_CHAR: "00002902-5555-8888-2299-ba0987654321",
};
/** @} */ // End of UUIDs group

/**
 * @enum {number}
 * @brief Command Byte Codes defined in the RumaH Protocol Specification.
 */
export const COMMANDS = {
  /** Verifies system connection. Payload: None. */
  CMD_SYS_PARAM_READ: 0x01,     
  /** Configures raw/result modes. Payload: Variable (See `buildSysSettingCmd`). */
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
 * @brief Configuration constants for the Sensor Mode (ASCII Values).
 * Used as the first parameter in `CMD_SYS_SETTING_SET`.
 */
export const SYS_MODES = {
  RESULT_ONLY: 0x31, /**< ASCII '1'. Results only. */
  RAW_ONLY: 0x32,    /**< ASCII '2'. Raw waveform only. */
  BOTH: 0x33         /**< ASCII '3'. Both Results and Raw. */
};

/**
 * @brief Factory function to build the System Setting Command (0x08).
 * 
 * @details 
 * **CQ11 Protocol Specifics:**
 * Constructs a 6-byte packet:
 * `[ 0x08 | MODE | '2' | '0' | '0' | SIM ]`
 * 
 * - **Mode:** 1 Byte (ASCII '1', '2', or '3').
 * - **Rate:** 3 Bytes (Fixed to ASCII string "200").
 * - **Sim:**  1 Byte (ASCII '0' = Real, '1' = Simulated).
 * 
 * @param {number} mode - The operation mode (Use `SYS_MODES` constants).
 * @param {string} freq - (Unused in current logic, defaults to "200" internally).
 * @param {boolean} isSimulated - If true, sends ASCII '1', else ASCII '0'.
 * @return {string} A **Base64 encoded string** ready for BLE transmission.
 */
export const buildSysSettingCmd = (mode, freq = "200", isSimulated = false) => {
  // Packet size: Command(1) + Mode(1) + Freq(3) + Sim(1) = 6 bytes
  const buffer = Buffer.alloc(6);

  buffer.writeUInt8(COMMANDS.CMD_SYS_SETTING_SET, 0); // Byte 0: Command
  buffer.writeUInt8(mode, 1);                         // Byte 1: Mode

  // Bytes 2-4: Transmission Rate "200" (ASCII: 0x32, 0x30, 0x30)
  buffer.write("200", 2, 3, 'ascii');

  // Byte 5: Simulation Flag ('0' or '1')
  const simByte = isSimulated ? 0x31 : 0x30; // 0x31='1', 0x30='0'
  buffer.writeUInt8(simByte, 5);

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
 * @brief GENERIC Deserializer for RumaH notification packets.
 * 
 * @details 
 * **Dynamic Parsing Logic:**
 * Instead of hardcoding specific offsets for ECG or PPG, this function parses the 
 * payload as a continuous stream of **16-bit Big Endian Integers**.
 * 
 * - If the sensor sends [Temp, Humidity], it returns an array of length 2.
 * - If the sensor sends CQ11 data (2 sets of 3 channels), it returns an array of length 6.
 * 
 * **Packet Structure handled:**
 * `[Header 0x8E] [Optional Length] [Data 1 (MSB)] [Data 1 (LSB)] [Data 2 (MSB)] ...`
 * 
 * @param {string} base64Data - The raw payload received from the BLE characteristic.
 * @return {Array<number>} 
 * - Returns an Array of integers found in the packet.
 * - Returns empty array `[]` if packet is too short or malformed.
 */
export const parseNotification = (base64Data) => {
  const buffer = Buffer.from(base64Data, 'base64');
  const values = [];

  // Step 1: Protocol Alignment
  let offset = 0;
  
  // Check for RumaH Unsolicited Header (0x8E)
  if (buffer.length > 0 && buffer[0] === COMMANDS.RES_SYS_UNSOLICITED) {
    // RumaH usually has Header (1 byte) + Length/Type (1 byte) = 2 bytes overhead
    offset = 2; 
  }

  // Step 2: Dynamic Loop
  // Read 2 bytes at a time (16-bit) until we reach the end of the buffer
  while (offset + 1 < buffer.length) {
    // Read 16-bit Big Endian integer
    const val = buffer.readUInt16BE(offset);
    values.push(val);
    offset += 2;
  }

  return values;
};