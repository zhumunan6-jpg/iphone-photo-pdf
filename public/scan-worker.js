'use strict';
importScripts('./scan.js?v=1.2.0');
self.onmessage = ({ data }) => {
  try {
    const pixels = new Uint8ClampedArray(data.buffer);
    self.PhotoScan.enhance(pixels, data.width, data.height, data.strength);
    self.postMessage({ buffer: pixels.buffer }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message || '扫描处理失败' });
  }
};
