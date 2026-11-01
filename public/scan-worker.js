'use strict';
importScripts('./scan.js');
self.onmessage = ({ data }) => {
  try {
    const pixels = new Uint8ClampedArray(data.buffer);
    self.PhotoScan.enhance(pixels, data.width, data.height, data.strength);
    self.postMessage({ buffer: pixels.buffer }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message || '扫描处理失败' });
  }
};
