/**
 * @file DataBuffer.js
 * @brief A simple utility to manage high-frequency data streams.
 */

/**
 * @brief Appends new data to an array and maintains a maximum length.
 * @param {Array} currentBuffer - The existing data array.
 * @param {Array} newData - The new items to add.
 * @param {number} maxSize - The max size of the buffer (to prevent memory leaks).
 * @return {Array} The updated buffer.
 */
export const appendBuffer = (currentBuffer, newData, maxSize = 100) => {
  const updated = [...currentBuffer, ...newData];
  if (updated.length > maxSize) {
    return updated.slice(updated.length - maxSize);
  }
  return updated;
};