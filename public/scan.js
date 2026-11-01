/* White-paper enhancement. No OCR, stroke removal, or lossy encoding. */
(function (root) {
  'use strict';

  // A sliding histogram estimates paper from a robust local percentile. Bright
  // JPEG halos around text must not become the paper reference: a maximum
  // filter would amplify them into gray rectangular patches.
  function paperPercentile(source, target, width, height, radius, vertical) {
    const length = vertical ? height : width;
    const lines = vertical ? width : height;
    const stride = vertical ? width : 1;
    const histogram = new Int32Array(256);
    for (let line = 0; line < lines; line++) {
      const base = vertical ? line : line * width;
      histogram.fill(0);
      let count = 0, next = 0, median = 0, below = 0;
      for (let position = 0; position < length; position++) {
        const end = Math.min(length - 1, position + radius);
        while (next <= end) {
          const value = source[base + next++ * stride];
          histogram[value]++; count++;
          if (value < median) below++;
        }
        const removed = position - radius - 1;
        if (removed >= 0) {
          const value = source[base + removed * stride];
          histogram[value]--; count--;
          if (value < median) below--;
        }
        const rank = Math.floor((count - 1) * .5);
        while (below > rank) below -= histogram[--median];
        while (below + histogram[median] <= rank) below += histogram[median++];
        target[base + position * stride] = median;
      }
    }
  }

  function enhance(rgba, width, height, strength = 55) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) throw new Error('扫描图像尺寸无效');
    strength = Math.max(0, Math.min(100, Number(strength) || 0)) / 100;
    const size = width * height;
    const gray = new Uint8Array(size);
    const first = new Uint8Array(size);
    const second = new Uint8Array(size);
    for (let i = 0, p = 0; i < size; i++, p += 4) gray[i] = (77 * rgba[p] + 150 * rgba[p + 1] + 29 * rgba[p + 2] + 128) >> 8;

    // Only the background estimate is filtered; source ink is never blurred.
    const radius = Math.max(6, Math.min(48, Math.round(Math.min(width, height) / 40)));
    paperPercentile(gray, first, width, height, radius, false);
    paperPercentile(first, second, width, height, radius, true);

    // A real white plateau prevents a gray paper veil. The continuous ink curve
    // preserves faint strokes instead of making a black/white cutoff decision.
    const whiteFloor = Math.max(2, 4.5 - 4 * strength);
    const inkScale = 15 - 7 * strength;
    const tone = new Uint8Array(4097);
    for (let i = 0; i < tone.length; i++) tone[i] = Math.round(255 * Math.exp(-Math.max(0, i / 16 - whiteFloor) / inkScale));
    for (let i = 0, p = 0; i < size; i++, p += 4) {
      const darkness = Math.max(0, second[i] - gray[i]) * 255 / Math.max(32, second[i]);
      const value = tone[Math.min(4096, Math.round(darkness * 16))];
      rgba[p] = rgba[p + 1] = rgba[p + 2] = value;
      rgba[p + 3] = 255;
    }
    return rgba;
  }

  root.PhotoScan = { enhance };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PhotoScan;
})(typeof self !== 'undefined' ? self : globalThis);
