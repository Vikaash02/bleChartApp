/**
 * @file DataBuffer.js
 * @brief Utility for managing high-frequency data streams using a Rolling Window (Circular Buffer concept).
 * @version 1.0.0
 * 
 * @section theory_sec Theory of Operation
 * When plotting real-time data, we cannot keep appending points infinitely, or the application
 * will run out of RAM (OOM Crash). 
 * This utility ensures the array size never exceeds `maxSize` by discarding the oldest data points (FIFO).
 */

/**
 * @brief Appends new data to an array while enforcing a maximum size constraint.
 * 
 * @details
 * This function performs a "Rolling Window" operation.
 * If `currentBuffer.length + newData.length > maxSize`, the array is sliced 
 * to keep only the most recent `maxSize` elements.
 * 
 * @param {Array} currentBuffer - The existing state array.
 * @param {Array} newData - The new batch of data points arriving from the sensor.
 * @param {number} maxSize - The capacity of the buffer (Default: 100).
 * 
 * @return {Array} A new array instance containing the merged and trimmed data.
 */
export const appendBuffer = (currentBuffer, newData, maxSize = 100) => {
  // Concatenate arrays (ES6 Spread)
  const updated = [...currentBuffer, ...newData];
  
  // Slice if capacity exceeded
  if (updated.length > maxSize) {
    // Keep the last 'maxSize' elements
    return updated.slice(updated.length - maxSize);
  }
  
  return updated;
};