/**
 * @file useSensorLogic.js
 * @brief Business Logic Layer (ViewModel) for Medical Sensor interaction.
 * @version 1.4.0 (Multi-Channel Support)
 * @date 2023-11-28
 * 
 * @section arch_sec Architecture
 * This hook acts as the **Controller/ViewModel**. It manages:
 * 1.  **Connection State Machine:** (Disconnected -> Connecting -> Configuring -> Streaming).
 * 2.  **Protocol Handshake:** Orchestrates the sequence of commands defined in `BleProtocol.js`.
 * 3.  **Generic Data Pipeline:** Decouples high-frequency BLE interrupts from low-frequency UI updates using multiple circular buffers.
 * 
 * @section perf_sec Performance Strategy (Multi-Channel)
 * The sensor sends data packets containing multiple 16-bit values at ~200Hz. 
 * Rendering 6+ charts at 200Hz is impossible on mobile.
 * 
 * **Solution:**
 * - The hook maintains a `dataBuffersRef` object, where keys correspond to the data index in the packet (0, 1, 2...).
 * - Incoming data is split and pushed to these buffers synchronously (Non-Blocking).
 * - A 40Hz timer flushes all active buffers into the React State (`channelData`).
 * - This allows the UI to render N distinct charts smoothly, regardless of the sensor's data format.
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
 * @brief Custom hook encapsulating all Medical Sensor Logic.
 * 
 * @return {Object} An object containing:
 * - `device` {Device}: The connected BLE device instance.
 * - `status` {string}: Current user-facing status message.
 * - `channelData` {Object}: Dictionary of data arrays, keyed by channel index (e.g., { '0': [...], '1': [...] }).
 * - `bleManager` {BleManager}: The raw manager instance (for scanning).
 * - `connectAndStart` {Function}: Trigger connection sequence.
 * - `stopAndDisconnect` {Function}: Trigger cleanup sequence.
 */
export default function useSensorLogic() {
  /** 
   * @brief Singleton BleManager instance.
   */
  const bleManager = useRef(new BleManager()).current;

  /** @brief The currently connected peripheral. */
  const [device, setDevice] = useState(null);

  /** @brief Human-readable status string. */
  const [status, setStatus] = useState('Disconnected');

  /** 
   * @brief Visualization State (Generic).
   * Stores arrays of data for each channel detected in the packet.
   * Structure: { 0: [100, 102...], 1: [500, 501...], ... }
   */
  const [channelData, setChannelData] = useState({}); 
  
  /**
   * @brief High-Speed Intermediate Buffers.
   * Mirrors the structure of channelData but handles high-frequency pushes.
   */
  const dataBuffersRef = useRef({});

  /**
   * @brief Executes the RumaH Protocol Connection Handshake.
   * @param {Object} scannedDevice - The native device object returned by the Scanner.
   */
  const connectAndStart = async (scannedDevice) => {
    try {
      setStatus('Connecting...');
      
      const connectedDevice = await bleManager.connectToDevice(scannedDevice.id);
      setDevice(connectedDevice);
      
      setStatus('Discovering Services...');
      await connectedDevice.discoverAllServicesAndCharacteristics();

      // Step 2: Configure System Settings (Command 0x08)
      // -- Modified: Uses defaults: Mode=RAW, Rate="200", Sim=False
      setStatus('Configuring Settings...');
      // Mode: RAW_ONLY, Rate: "200" (default), Simulated: TRUE
      const settingsPayload = buildSysSettingCmd(SYS_MODES.RAW_ONLY, "200", true);;
      await connectedDevice.writeCharacteristicWithResponseForService(
        SENSOR_UUIDS.SERVICE,
        SENSOR_UUIDS.WRITE_CHAR,
        settingsPayload
      );

      // Step 3: Verify Parameters (Command 0x01)
      setStatus('Verifying Parameters...');
      const readPayload = buildSimpleCmd(COMMANDS.CMD_SYS_PARAM_READ);
      await connectedDevice.writeCharacteristicWithResponseForService(
        SENSOR_UUIDS.SERVICE,
        SENSOR_UUIDS.WRITE_CHAR,
        readPayload
      );

      // Step 4: Subscribe to Data Stream
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

      // Step 5: Start Scanning (Command 0x18)
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
   * @brief Handles incoming packets and de-interleaves CQ11 data.
   * 
   * @details 
   * CQ11 sends: [IR1, Red1, ECG1, IR2, Red2, ECG2]
   * We want to map:
   * - IR1 and IR2 -> Channel 0
   * - Red1 and Red2 -> Channel 1
   * - ECG1 and ECG2 -> Channel 2
   */
  const handleIncomingData = (base64Value) => {
    const values = parseNotification(base64Value);
    
    // Check if this looks like a standard CQ11 packet (6 values)
    if (values && values.length === 6) {
      const channelCount = 3; // We really only have 3 sensors

      // Set 1 (Time T)
      pushToBuffer(0, values[0]); // IR
      pushToBuffer(1, values[1]); // Red
      pushToBuffer(2, values[2]); // ECG

      // Set 2 (Time T+5ms)
      pushToBuffer(0, values[3]); // IR
      pushToBuffer(1, values[4]); // Red
      pushToBuffer(2, values[5]); // ECG
    } 
    // Fallback for non-standard packets (Generic mode)
    else if (values && values.length > 0) {
       values.forEach((val, index) => {
          pushToBuffer(index, val);
       });
    }
  };

  // Helper to push to the ref safely
  const pushToBuffer = (channelIndex, value) => {
    if (!dataBuffersRef.current[channelIndex]) {
      dataBuffersRef.current[channelIndex] = [];
    }
    dataBuffersRef.current[channelIndex].push(value);
  };

  /**
   * @brief Gracefully terminates the session.
   */
  const stopAndDisconnect = async () => {
    if (device) {
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
      // Clear data on disconnect to reset views
      setChannelData({});
      dataBuffersRef.current = {};
    }
  };

  /**
   * @brief The "Game Loop" / UI Refresh Timer.
   * 
   * @details 
   * Runs every 25ms (40Hz).
   * Iterates through ALL active channel buffers.
   * If a buffer has data, updates the React State for that channel.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      const keys = Object.keys(dataBuffersRef.current);
      
      if (keys.length > 0) {
        setChannelData(prev => {
          const newState = { ...prev };
          let hasChanges = false;

          keys.forEach(key => {
            const newPoints = dataBuffersRef.current[key];
            
            if (newPoints && newPoints.length > 0) {
              const prevPoints = newState[key] || [];
              // Append and slice to keep last 100 points
              newState[key] = [...prevPoints, ...newPoints].slice(-100);
              
              // Clear the high-speed buffer for this key
              dataBuffersRef.current[key] = [];
              hasChanges = true;
            }
          });

          return hasChanges ? newState : prev;
        });
      }
    }, 25); 

    return () => clearInterval(interval);
  }, []);

  return {
    device,
    status,
    channelData, // Exposing the generic dictionary
    bleManager, 
    connectAndStart,
    stopAndDisconnect
  };
}