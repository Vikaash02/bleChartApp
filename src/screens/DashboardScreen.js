/**
 * @file DashboardScreen.js
 * @brief Main View Controller for the BLE Medical Sensor Application.
 * @version 1.2.0
 * 
 * @section arch_sec Architecture
 * This component acts as the **View Layer**. It interacts with the **ViewModel** (`useSensorLogic`)
 * to drive the UI state. It handles two distinct UI modes:
 * 1.  **Discovery Mode:** Lists available BLE peripherals.
 * 2.  **Visualization Mode:** Displays the real-time ECG chart when connected.
 * 
 * @section flow_sec UX Flow
 * - **Init:** Checks Android Permissions (Location/Bluetooth).
 * - **Scan:** User presses "Scan" -> `bleManager` searches -> List populates.
 * - **Connect:** User selects device -> `connectAndStart` (in Hook) triggers handshake.
 * - **Stream:** UI swaps List for `SensorChart` -> Data flows from Hook to Chart.
 * 
 * @section perm_sec Permissions
 * Android 12+ (API 31+) requires `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`.
 * Older Android versions require `ACCESS_FINE_LOCATION`.
 */

import React, { useEffect, useState } from 'react';
import { 
    SafeAreaView, 
    View, 
    Text, 
    Button, 
    FlatList, 
    TouchableOpacity, 
    StyleSheet, 
    PermissionsAndroid,
    Platform
} from 'react-native';
import useSensorLogic from '../hooks/useSensorLogic';
import SensorChart from '../components/SensorChart';

/**
 * @brief The Root Screen Component.
 */
export default function DashboardScreen() {
  /**
   * @brief Destructure state and logic from the Custom Hook (ViewModel).
   * @see useSensorLogic.js
   */
  const { 
    device, 
    status, 
    ecgData, 
    bleManager, 
    connectAndStart, 
    stopAndDisconnect 
  } = useSensorLogic();

  /** @brief Local state for the list of discovered peripherals. */
  const [scannedDevices, setScannedDevices] = useState([]);
  
  /** @brief UI state to disable the Scan button while operation is in progress. */
  const [isScanning, setIsScanning] = useState(false);

  /**
   * @brief Requests necessary runtime permissions based on Android API level.
   * @note This is a prerequisite for scanning. If denied, scanning will silently fail.
   */
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    }
  };

  /**
   * @brief Executes a 10-second BLE Scan.
   * 
   * @details 
   * 1. Clears previous results.
   * 2. Starts the `bleManager` scanner.
   * 3. Filters duplicates (by Device ID).
   * 4. Auto-stops after 10,000ms to conserve battery.
   */
  const startScan = async () => {
    await requestPermissions();
    setScannedDevices([]);
    setIsScanning(true);
    
    bleManager.startDeviceScan(null, null, (error, scannedDevice) => {
      if (error) {
        console.warn("Scan Error:", error);
        return;
      }
      
      // Filter logic: Only add if the device object exists
      if (scannedDevice) {
        setScannedDevices(prev => {
            // Duplication check: Prevent adding the same MAC address twice
            if (!prev.some(d => d.id === scannedDevice.id)) {
                return [...prev, scannedDevice];
            }
            return prev;
        });
      }
    });

    // Timer to stop scanning automatically
    setTimeout(() => {
        bleManager.stopDeviceScan();
        setIsScanning(false);
    }, 10000);
  };

  /**
   * @brief Interaction Handler: User taps a device in the list.
   * @param {Object} item - The `Device` object provided by react-native-ble-plx.
   */
  const onDevicePress = (item) => {
    // Always stop scanning before connecting to ensure radio stability
    bleManager.stopDeviceScan();
    setIsScanning(false);
    
    // Trigger the handshake sequence in the hook
    connectAndStart(item);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 
        Header Section:
        Displays current connection status (e.g., "Streaming", "Connecting")
        and the Disconnect button when active.
      */}
      <View style={styles.header}>
        <Text style={styles.statusText}>Status: {status}</Text>
        {device && (
             <Button title="Disconnect" onPress={stopAndDisconnect} color="red" />
        )}
      </View>

      {/* 
        Conditional Content Rendering:
        - IF connected: Show the Real-time Chart.
        - ELSE: Show the Scan Button and Device List.
      */}
      {device ? (
        <View style={styles.chartContainer}>
           <SensorChart data={ecgData} title="ECG Signal (Real-time)" />
        </View>
      ) : (
        <View style={styles.listContainer}>
            <Button 
                title={isScanning ? "Scanning..." : "Scan for Sensor"} 
                onPress={startScan} 
                disabled={isScanning} 
            />
            <FlatList
                data={scannedDevices}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.deviceItem} onPress={() => onDevicePress(item)}>
                        {/* Fallback to "Unknown" if the device doesn't advertise a local name */}
                        <Text style={styles.deviceName}>{item.name || "Unknown Device"}</Text>
                        <Text style={styles.deviceId}>{item.id}</Text>
                        <Text style={styles.rssi}>RSSI: {item.rssi}</Text>
                    </TouchableOpacity>
                )}
            />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { padding: 20, borderBottomWidth: 1, borderColor: '#EEE', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusText: { fontSize: 16, fontWeight: 'bold' },
  chartContainer: { padding: 10, flex: 1, justifyContent: 'center' },
  listContainer: { padding: 20, flex: 1 },
  deviceItem: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#f9f9f9', marginBottom: 5 },
  deviceName: { fontSize: 16, fontWeight: 'bold' },
  deviceId: { fontSize: 12, color: 'gray' },
  rssi: { fontSize: 10, color: 'blue', marginTop: 2 }
});