/**
 * @file BleProtocol.js
 * @brief Contains BLE Protocol definitions, Command IDs, and Packet Parsing logic.
 */

import { Buffer } from 'buffer';

/**
 * @brief UUIDs for the Medical Sensor.
 * @note These must be replaced with the actual UUIDs found during scanning or provided by the vendor.
 */
export const SENSOR_UUIDS = {
  SERVICE: "0000180D-0000-1000-8000-00805F9B34FB", // Replace with actual Service UUID
  WRITE_CHAR: "00002A37-0000-1000-8000-00805F9B34FB", // Replace with Write Char UUID
  NOTIFY_CHAR: "00002A38-0000-1000-8000-00805F9B34FB", // Replace with Notify Char UUID
};

/**
 * @enum {number}
 * @brief Command Hex Codes based on the RumaH Protocol.
 */
export const COMMANDS = {
  CMD_SYS_PARAM_READ: 0x01,     /**< Read System Parameters */
  CMD_SYS_SETTING_SET: 0x08,    /**< Set System Settings */
  CMD_SCAN_START: 0x18,         /**< Start Sensor Scanning */
  CMD_SCAN_STOP: 0x1F,          /**< Stop Sensor Scanning */
  RES_SYS_UNSOLICITED: 0x8E     /**< Unsolicited Data Header */
};

/**
 * @brief Modes for CMD_SYS_SETTING_SET
 */
export const SYS_MODES = {
  RESULT_ONLY: 0x31,
  RAW_ONLY: 0x32,
  BOTH: 0x33
};

/**
 * @brief Constructs the payload for CMD_SYS_SETTING_SET.
 * @param {number} mode - The result mode (e.g., 0x32).
 * @param {number} freq - The transmit frequency (e.g., 200).
 * @return {string} Base64 encoded string for BLE transmission.
 */
export const buildSysSettingCmd = (mode, freq) => {
  const buffer = Buffer.alloc(3);
  buffer.writeUInt8(COMMANDS.CMD_SYS_SETTING_SET, 0);
  buffer.writeUInt8(mode, 1);
  buffer.writeUInt8(freq, 2);
  return buffer.toString('base64');
};

/**
 * @brief Constructs a simple 1-byte command.
 * @param {number} cmdId - The command ID.
 * @return {string} Base64 encoded string.
 */
export const buildSimpleCmd = (cmdId) => {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(cmdId, 0);
  return buffer.toString('base64');
};

/**
 * @brief Parses the raw notification packet from the sensor.
 * @details Extracts 2 sets of (PPG IR, PPG RED, ECG). 
 *          Data format: MSB First (Big Endian), 16-bit values.
 * @param {string} base64Data - The raw Base64 data from BLE.
 * @return {Array<Object>|null} Array of 2 data points or null if invalid.
 */
export const parseNotification = (base64Data) => {
  const buffer = Buffer.from(base64Data, 'base64');

  // Basic validation: Check if it's the right unsolicited packet or raw data stream
  // Note: Depending on firmware, the 0x8E header might be present or stripped.
  // We assume here the payload contains the 0x8E header byte followed by data.
  // Total size for 2 sets of 3x16-bit values = 12 bytes + header (approx 2 bytes)
  
  let offset = 0;
  
  // If the first byte is the Unsolicited Response Code (0x8E)
  if (buffer[0] === COMMANDS.RES_SYS_UNSOLICITED) {
    offset = 2; // Skip Command (1) and potentially Type/Length (1) - adjust based on actual dump
  }

  // Ensure we have enough bytes for 2 sets of (3 * 2 bytes) = 12 bytes
  if (buffer.length < offset + 12) return null;

  const dataPoints = [];

  // Parse Set 1
  dataPoints.push({
    ppgIr: buffer.readUInt16BE(offset),
    ppgRed: buffer.readUInt16BE(offset + 2),
    ecg: buffer.readUInt16BE(offset + 4),
  });

  // Parse Set 2
  dataPoints.push({
    ppgIr: buffer.readUInt16BE(offset + 6),
    ppgRed: buffer.readUInt16BE(offset + 8),
    ecg: buffer.readUInt16BE(offset + 10),
  });

  return dataPoints;
};