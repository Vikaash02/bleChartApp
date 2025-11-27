/**
 * @file useSensorLogic.js
 * @brief core business logic for the Medical Sensor interaction.
 */

import { useState, useRef, useEffect } from 'react';
import { BleManager } from 'react-native-ble-plx';
import { 
  SENSOR_UUIDS, 
  COMMANDS, 
  SYS_MODES, 
  buildSysSettingCmd, 
  buildSimpleCmd, 
  parseNotification 
} from '../api/BleProtocol';

/**
 * @brief Custom hook to manage Sensor state and logic.
 * @return {Object} State and functions for the UI.
 */
export default function useSensorLogic() {
  const bleManager = useRef(new BleManager()).current;
  const [device, setDevice] = useState(null);
  const [status, setStatus] = useState('Disconnected');
  const [ecgData, setEcgData] = useState([]); // Only storing ECG for chart clarity
  
  // Refs for high-performance buffering
  const dataBufferRef = useRef([]);

  /**
   * @brief Initializes the connection sequence.
   * @param {Object} scannedDevice - The BLE device object found during scan.
   */
  const connectAndStart = async (scannedDevice) => {
    try {
      setStatus('Connecting...');
      const connectedDevice = await bleManager.connectToDevice(scannedDevice.id);
      setDevice(connectedDevice);
      
      setStatus('Discovering Services...');
      await connectedDevice.discoverAllServicesAndCharacteristics();

      // 1. Send CMD_SYS_SETTING_SET (Raw Only, Freq 200)
      setStatus('Configuring Settings...');
      const settingsPayload = buildSysSettingCmd(SYS_MODES.RAW_ONLY, 200);
      await connectedDevice.writeCharacteristicWithResponseForService(
        SENSOR_UUIDS.SERVICE,
        SENSOR_UUIDS.WRITE_CHAR,
        settingsPayload
      );

      // 2. Send CMD_SYS_PARAM_READ (Check RAW_CHANNEL - Optional logic here)
      setStatus('Verifying Parameters...');
      const readPayload = buildSimpleCmd(COMMANDS.CMD_SYS_PARAM_READ);
      await connectedDevice.writeCharacteristicWithResponseForService(
        SENSOR_UUIDS.SERVICE,
        SENSOR_UUIDS.WRITE_CHAR,
        readPayload
      );

      // 3. Setup Notification Listener BEFORE starting scan
      setStatus('Subscribing to Stream...');
      connectedDevice.monitorCharacteristicForService(
        SENSOR_UUIDS.SERVICE,
        SENSOR_UUIDS.NOTIFY_CHAR,
        (error, characteristic) => {
          if (error) {
            console.error('Notification Error:', error);
            return;
          }
          handleIncomingData(characteristic.value);
        }
      );

      // 4. Send CMD_SCAN_START
      setStatus('Starting Scan...');
      const startPayload = buildSimpleCmd(COMMANDS.CMD_SCAN_START);
      await connectedDevice.writeCharacteristicWithResponseForService(
        SENSOR_UUIDS.SERVICE,
        SENSOR_UUIDS.WRITE_CHAR,
        startPayload
      );

      setStatus('Streaming');

    } catch (error) {
      console.error('Connection Sequence Failed:', error);
      setStatus('Error');
    }
  };

  /**
   * @brief Processes raw Base64 data from BLE.
   * @param {string} base64Value 
   */
  const handleIncomingData = (base64Value) => {
    const parsedPoints = parseNotification(base64Value);
    
    if (parsedPoints) {
      // Extract only ECG for this example (or extend to store IR/Red)
      const newEcgPoints = parsedPoints.map(p => p.ecg);
      
      // Push to ref buffer (non-blocking)
      dataBufferRef.current.push(...newEcgPoints);
    }
  };

  /**
   * @brief Disconnects and cleans up.
   */
  const stopAndDisconnect = async () => {
    if (device) {
      // Try to send Stop command
      try {
        const stopPayload = buildSimpleCmd(COMMANDS.CMD_SCAN_STOP);
        await device.writeCharacteristicWithResponseForService(
            SENSOR_UUIDS.SERVICE, 
            SENSOR_UUIDS.WRITE_CHAR, 
            stopPayload
        );
      } catch (ignored) {}

      await device.cancelConnection();
      setDevice(null);
      setStatus('Disconnected');
    }
  };

  /**
   * @brief Timer loop to update Chart UI every 25ms.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      if (dataBufferRef.current.length > 0) {
        // Move data from Ref to State
        setEcgData(prev => {
          const updated = [...prev, ...dataBufferRef.current];
          // Keep only last 100 points for chart performance
          return updated.slice(-100);
        });
        // Clear buffer
        dataBufferRef.current = [];
      }
    }, 25); // 25ms Update Rate

    return () => clearInterval(interval);
  }, []);

  return {
    device,
    status,
    ecgData,
    bleManager, // Exposed for scanning in the UI
    connectAndStart,
    stopAndDisconnect
  };
}