/**
 * @file DashboardScreen.js
 * @brief Main UI orchestrating scanning and visualization.
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

export default function DashboardScreen() {
  const { 
    device, 
    status, 
    ecgData, 
    bleManager, 
    connectAndStart, 
    stopAndDisconnect 
  } = useSensorLogic();

  const [scannedDevices, setScannedDevices] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  /**
   * @brief Requests Android Permissions.
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
   * @brief Starts BLE Scanning.
   */
  const startScan = async () => {
    await requestPermissions();
    setScannedDevices([]);
    setIsScanning(true);
    
    bleManager.startDeviceScan(null, null, (error, scannedDevice) => {
      if (error) {
        console.warn(error);
        return;
      }
      if (scannedDevice && scannedDevice.name) {
        setScannedDevices(prev => {
            if (!prev.some(d => d.id === scannedDevice.id)) {
                return [...prev, scannedDevice];
            }
            return prev;
        });
      }
    });

    // Auto-stop scan after 10 seconds
    setTimeout(() => {
        bleManager.stopDeviceScan();
        setIsScanning(false);
    }, 10000);
  };

  /**
   * @brief Handles device selection from list.
   * @param {Object} item - The BLE device.
   */
  const onDevicePress = (item) => {
    bleManager.stopDeviceScan();
    setIsScanning(false);
    connectAndStart(item);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.statusText}>Status: {status}</Text>
        {device && (
             <Button title="Disconnect" onPress={stopAndDisconnect} color="red" />
        )}
      </View>

      {/* Main Content: Chart or Scan List */}
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
                        <Text style={styles.deviceName}>{item.name}</Text>
                        <Text style={styles.deviceId}>{item.id}</Text>
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
  deviceId: { fontSize: 12, color: 'gray' }
});