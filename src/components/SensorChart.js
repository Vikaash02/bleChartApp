/**
 * @file SensorChart.js
 * @brief Reusable, high-performance Line Chart component.
 * @version 1.1.0 (Generic)
 * 
 * @section perf_opt Performance Optimizations
 * Rendering real-time data (40fps) on React Native JS thread is expensive. 
 * Strategies used:
 * 1.  **`withDots={false}`**: Disables rendering individual data points (circles).
 * 2.  **`withInnerLines={false}`**: Removes grid lines.
 * 3.  **Memoization**: (Implicit usage via parent state slicing).
 */

import React from 'react';
import { Dimensions, View, Text } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

/** @brief Capture screen width once to avoid layout thrashing. */
const screenWidth = Dimensions.get('window').width;

/**
 * @brief Visual configuration object for `react-native-chart-kit`.
 */
const chartConfig = {
  backgroundColor: '#000000',
  backgroundGradientFrom: '#1E2923',
  backgroundGradientTo: '#08130D',
  decimalPlaces: 0, // Integers only for raw ADC values
  color: (opacity = 1) => `rgba(26, 255, 146, ${opacity})`, // Sensor Green
  labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
  propsForDots: { r: "0" }
};

/**
 * @brief Renders a generic waveform chart.
 * 
 * @param {Object} props
 * @param {Array<number>} props.data - Array of raw numerical values (last N points).
 * @param {string} props.title - The chart header title.
 */
export default function SensorChart({ data, title }) {
  // Guard clause: Prevent charting crashes if buffer is empty
  if (!data || data.length < 5) {
    return (
        <View style={{height: 220, width: screenWidth - 20, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 16, marginTop: 10}}>
            <Text style={{textAlign: 'center', fontWeight: 'bold', marginBottom: 5}}>{title}</Text>
            <Text style={{color: '#666'}}>Buffering...</Text>
        </View>
    );
  }

  // NOTE: In advanced versions, apply Decimation/Downsampling here
  // e.g., const displayData = data.filter((_, i) => i % 2 === 0);
  const displayData = data; 

  return (
    <View>
      <Text style={{ textAlign: 'center', fontSize: 14, fontWeight: 'bold', marginBottom: 5, marginTop: 10 }}>{title}</Text>
      <LineChart
        data={{
          datasets: [{ data: displayData }]
        }}
        width={screenWidth - 20} // Full width minus padding
        height={220}
        withDots={false}       // Critical for performance
        withInnerLines={false} // Cleaner look, less rendering
        withOuterLines={true}
        yAxisInterval={10}     // Reduce Y-axis label calculation
        chartConfig={chartConfig}
        bezier                 // Smooths the line
        style={{
          marginVertical: 4,
          borderRadius: 16
        }}
      />
    </View>
  );
}