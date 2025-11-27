/**
 * @file SensorChart.js
 * @brief Reusable Chart component for visualizing sensor data.
 */

import React from 'react';
import { Dimensions, View, Text } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

/**
 * @brief Chart Configuration for ChartKit
 */
const chartConfig = {
  backgroundColor: '#000000',
  backgroundGradientFrom: '#1E2923',
  backgroundGradientTo: '#08130D',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(26, 255, 146, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
};

export default function SensorChart({ data, title }) {
  // Guard clause for empty data
  if (!data || data.length < 5) {
    return (
        <View style={{height: 220, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ddd'}}>
            <Text>Waiting for Signal...</Text>
        </View>
    );
  }

  // Downsample if data is too large for UI thread to handle smoothly
  const displayData = data; 

  return (
    <View>
      <Text style={{ textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>{title}</Text>
      <LineChart
        data={{
          datasets: [{ data: displayData }]
        }}
        width={screenWidth - 20}
        height={220}
        withDots={false}       // Performance optimization
        withInnerLines={false} // Performance optimization
        chartConfig={chartConfig}
        bezier
        style={{
          marginVertical: 8,
          borderRadius: 16
        }}
      />
    </View>
  );
}