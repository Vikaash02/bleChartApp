/**
 * @file useSensorLogic.js
 * @brief Business Logic Layer (ViewModel) for Medical Sensor interaction.
 * @version 1.1.0
 * 
 * @section arch_sec Architecture
 * This hook acts as the **Controller/ViewModel**. It manages:
 * 1.  **Connection State Machine:** (Disconnected -> Connecting -> Configuring -> Streaming).
 * 2.  **Protocol Handshake:** Orchestrates the sequence of commands defined in `BleProtocol.js`.
 * 3.  **Data Pipeline:** Decouples high-frequency BLE interrupts from low-frequency UI updates using a circular buffer.
 * 
 * @section handshake_sec Connection Handshake Sequence
 * When `connectAndStart` is called, the following synchronous sequence occurs:
 * 1.  **Connect** to device.
 * 2.  **Discover** Services/Characteristics.
 * 3.  **Write** `CMD_SYS_SETTING_SET` (0x08) -> Configures Raw Mode.
 * 4.  **Write** `CMD_SYS_PARAM_READ` (0x01) -> Verifies configuration.
 * 5.  **Subscribe** to Notification Characteristic.
 * 6.  **Write** `CMD_SCAN_START` (0x18) -> Triggers data stream.
 * 
 * @section perf_sec Performance Strategy
 * The sensor sends data every ~5ms (200Hz). Updating React State (`useState`) at 200Hz 
 * would freeze the UI.
 * 
 * **Solution:**
 * - Incoming data is pushed immediately to a `useRef` array (Synchronous, Non-Blocking, No Re-render).
 * - A `setInterval` timer runs every 25ms (40Hz).
 * - The timer flushes the `useRef` buffer into the React State (`useState`).
 * - Result: Smooth UI updates at 40fps while capturing 200fps data.
 */

import { useState, useRef, useEffect } from 'react';
import { BleManager, Device } from 'react-native-ble-plx';
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
 * - `ecgData` {Array<number>}: Array of ECG values for visualization.
 * - `bleManager` {BleManager}: The raw manager instance (for scanning).
 * - `connectAndStart` {Function}: Trigger connection sequence.
 * - `stopAndDisconnect` {Function}: Trigger cleanup sequence.
 */
export default function useSensorLogic() {
  /** 
   * @brief Singleton BleManager instance.
   * Instantiated once via useRef to persist across re-renders without recreation.
   */
  const bleManager = useRef(new BleManager()).current;

  /** @brief The currently connected peripheral. Null if disconnected. */
  const [device, setDevice] = useState(null);

  /** @brief Human-readable status string for the Dashboard UI. */
  const [status, setStatus] = useState('Disconnected');

  /** 
   * @brief Visualization State.
   * This is the "Truth" for the UI Chart. It is updated at 40Hz.
   */
  const [ecgData, setEcgData] = useState([]); 
  
  /**
   * @brief High-Speed Intermediate Buffer.
   * @details Stores raw data points arriving from the BLE stack.
   * We use `useRef` because modifying this does NOT trigger a React component re-render.
   */
  const dataBufferRef = useRef([]);

  /**
   * @brief Executes the RumaH Protocol Connection Handshake.
   * 
   * @details This function performs the 4-step initialization sequence required by the firmware.
   * If any step fails, the `catch` block is triggered and the connection is aborted.
   * 
   * @param {Object} scannedDevice - The native device object returned by the Scanner.
   * @see BleProtocol.js for command definitions.
   */
  const connectAndStart = async (scannedDevice) => {
    try {
      setStatus('Connecting...');
      
      // Step 1: Low-level BLE Connection
      const connectedDevice = await bleManager.connectToDevice(scannedDevice.id);
      setDevice(connectedDevice);
      
      setStatus('Discovering Services...');
      // Crucial: Android requires service discovery before characteristics can be accessed.
      await connectedDevice.discoverAllServicesAndCharacteristics();

      // Step 2: Configure System Settings (Command 0x08)
      // We request RAW_ONLY mode to get waveform data.
      setStatus('Configuring Settings...');
      const settingsPayload = buildSysSettingCmd(SYS_MODES.RAW_ONLY, 200);
      await connectedDevice.writeCharacteristicWithResponseForService(
        SENSOR_UUIDS.SERVICE,
        SENSOR_UUIDS.WRITE_CHAR,
        settingsPayload
      );

      // Step 3: Verify Parameters (Command 0x01)
      // Good practice to ensure the settings stuck, though we ignore the response payload in this MVP.
      setStatus('Verifying Parameters...');
      const readPayload = buildSimpleCmd(COMMANDS.CMD_SYS_PARAM_READ);
      await connectedDevice.writeCharacteristicWithResponseForService(
        SENSOR_UUIDS.SERVICE,
        SENSOR_UUIDS.WRITE_CHAR,
        readPayload
      );

      // Step 4: Subscribe to Data Stream
      // We must subscribe BEFORE sending the Start command to ensure we don't miss the first packets.
      setStatus('Subscribing to Stream...');
      connectedDevice.monitorCharacteristicForService(
        SENSOR_UUIDS.SERVICE,
        SENSOR_UUIDS.NOTIFY_CHAR,
        (error, characteristic) => {
          if (error) {
            console.error('Notification Error:', error);
            // Note: In production, consider triggering a disconnect here.
            return;
          }
          // Delegate data processing to a separate function to keep this logic clean.
          handleIncomingData(characteristic.value);
        }
      );

      // Step 5: Start Scanning (Command 0x18)
      // This tells the firmware to actually begin pushing 0x8E packets.
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
      // Optional: Auto-disconnect on failure to reset state
      if (scannedDevice) {
          // scannedDevice.cancelConnection(); // Uncomment if desired
      }
    }
  };

  /**
   * @brief Handles raw Base64 payloads from the BLE callback.
   * 
   * @details 
   * 1. Decodes Base64 using `BleProtocol.parseNotification`.
   * 2. Extracts specifically the ECG channel (can be modified to store PPG).
   * 3. Pushes data to `dataBufferRef` (Non-blocking).
   * 
   * @param {string} base64Value - The raw string from `react-native-ble-plx`.
   */
  const handleIncomingData = (base64Value) => {
    const parsedPoints = parseNotification(base64Value);
    
    if (parsedPoints) {
      // Map the array of objects to a flat array of ECG values
      const newEcgPoints = parsedPoints.map(p => p.ecg);
      
      // Mutate the Ref array directly (High performance)
      dataBufferRef.current.push(...newEcgPoints);
    }
  };

  /**
   * @brief Gracefully terminates the session.
   * 
   * @details 
   * 1. Attempts to send `CMD_SCAN_STOP` (0x1F) to put the firmware in IDLE mode.
   * 2. Cancels the native BLE connection.
   * 3. Resets local state.
   */
  const stopAndDisconnect = async () => {
    if (device) {
      // Best-effort attempt to tell the device to stop. 
      // Wrapped in try/catch because if the link is already broken, this will throw.
      try {
        const stopPayload = buildSimpleCmd(COMMANDS.CMD_SCAN_STOP);
        await device.writeCharacteristicWithResponseForService(
            SENSOR_UUIDS.SERVICE, 
            SENSOR_UUIDS.WRITE_CHAR, 
            stopPayload
        );
      } catch (ignored) {
          console.warn("Could not send STOP command, force disconnecting.");
      }

      await device.cancelConnection();
      setDevice(null);
      setStatus('Disconnected');
      // Note: we do not clear ecgData here so the user can see the last chart state.
    }
  };

  /**
   * @brief The "Game Loop" / UI Refresh Timer.
   * 
   * @details 
   * Runs every 25ms.
   * Checks if `dataBufferRef` has accumulated any new points.
   * If yes, moves them to React State (`setEcgData`) and clears the buffer.
   * Maintains a rolling window of the last 100 points to keep the Chart component lightweight.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      if (dataBufferRef.current.length > 0) {
        setEcgData(prev => {
          // Combine previous state + new buffered data
          const updated = [...prev, ...dataBufferRef.current];
          // Optimization: Only keep the last 100 points. 
          // Rendering 1000s of points on a mobile chart causes frame drops.
          return updated.slice(-100);
        });
        
        // Reset the high-speed buffer
        dataBufferRef.current = [];
      }
    }, 25); // 25ms = 40 Updates per second

    // Cleanup: Stop the timer when the component unmounts
    return () => clearInterval(interval);
  }, []);

  return {
    device,
    status,
    ecgData,
    bleManager, 
    connectAndStart,
    stopAndDisconnect
  };
}