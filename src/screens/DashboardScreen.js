/**
 * @file DashboardScreen.js
 * @brief Main View Controller for the BLE Medical Sensor Application.
 * @version 1.4.0 (Multi-Channel Support)
 * 
 * @section arch_sec Architecture
 * This component acts as the **View Layer**. It interacts with the **ViewModel** (`useSensorLogic`)
 * to drive the UI state.
 * 
 * **Updates in v1.4.0:**
 * - **Dynamic Visualization:** Replaced the single ECG chart with a dynamic list of charts.
 * - **Scrollable Layout:** Added `ScrollView` to handle multi-channel sensors (like CQ11 which sends 6 streams).
 * 
 * @section flow_sec UX Flow
 * - **Init:** Checks Android Permissions.
 * - **Scan:** User presses "Scan" -> List populates.
 * - **Connect:** User selects device -> Handshake triggers.
 * - **Stream:** UI swaps List for a **Scrollable View of Charts** corresponding to available data channels.
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
    Platform,
    ScrollView
} from 'react-native';
import useSensorLogic from '../hooks/useSensorLogic';
import SensorChart from '../components/SensorChart';

/**
 * @brief The Root Screen Component.
 */
export default function DashboardScreen() {
  /**
   * @brief Destructure state and logic from the Custom Hook (ViewModel).
   * @note `channelData` is a dictionary { 0: [...], 1: [...] } containing raw data for each channel.
   * @see useSensorLogic.js
   */
  const { 
    device, 
    status, 
    channelData, // Updated from 'ecgData' to generic 'channelData'
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
   */
  const startScan = async () => {
    await requestPermissions();
    setScannedDevices([]);
    setIsScanning(true);
    
    bleManager.startDeviceScan(null, null, (error, scannedDevice) => {
      if (error) {
        return;
      }
      
      if (scannedDevice) {
        setScannedDevices(prev => {
            if (!prev.some(d => d.id === scannedDevice.id)) {
                return [...prev, scannedDevice];
            }
            return prev;
        });
      }
    });

    setTimeout(() => {
        bleManager.stopDeviceScan();
        setIsScanning(false);
    }, 10000);
  };

  /**
   * @brief Interaction Handler: User taps a device in the list.
   */
  const onDevicePress = (item) => {
    bleManager.stopDeviceScan();
    setIsScanning(false);
    connectAndStart(item);
  };

  /**
   * @brief Helper to render the dynamic list of charts.
   * @details Iterates over the keys of `channelData` (e.g., "0", "1", "2") and renders a chart for each.
   */
  const renderCharts = () => {
    const channels = Object.keys(channelData);
    
    if (channels.length === 0) {
      return (
        <View style={styles.waitingContainer}>
           <Text style={styles.waitingText}>Waiting for Data Stream...</Text>
        </View>
      );
    }

    return channels.map((channelIndex) => (
      <View key={channelIndex} style={styles.singleChartWrapper}>
        <SensorChart 
          data={channelData[channelIndex]} 
          title={`Raw Data - Channel ${channelIndex}`} 
        />
      </View>
    ));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.statusText}>Status: {status}</Text>
        {device && (
             <Button title="Disconnect" onPress={stopAndDisconnect} color="red" />
        )}
      </View>

      {/* Main Content */}
      {device ? (
        <ScrollView style={styles.scrollContainer} contentContainerStyle={{ paddingBottom: 20 }}>
           {renderCharts()}
        </ScrollView>
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
  scrollContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  singleChartWrapper: { marginBottom: 15, alignItems: 'center' },
  waitingContainer: { padding: 20, alignItems: 'center' },
  waitingText: { color: '#666', fontStyle: 'italic' },
  listContainer: { padding: 20, flex: 1 },
  deviceItem: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#f9f9f9', marginBottom: 5 },
  deviceName: { fontSize: 16, fontWeight: 'bold' },
  deviceId: { fontSize: 12, color: 'gray' },
  rssi: { fontSize: 10, color: 'blue', marginTop: 2 }
});