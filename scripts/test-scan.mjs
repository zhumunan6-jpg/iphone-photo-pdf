import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { scanFixture } from './scan-fixture.mjs';
const require = createRequire(import.meta.url);
const { enhance } = require('../public/scan.js');
const fixture = scanFixture();
const { width, height, lines } = fixture;
const result = enhance(fixture.pixels.slice(), width, height, 55);
let white = 0, paper = 0;
for (let y = 40; y < height * .55; y++) {
  if (lines.some((line) => Math.abs(y - line.y) < 3)) continue;
  for (let x = 40; x < width - 40; x++) {
    paper++;
    if (result[(y * width + x) * 4] === 255) white++;
  }
}
assert.ok(white / paper > .995, `White paper coverage: ${white / paper}`);
const retention = lines.map(({ y, start, end }) => {
  let visible = 0, gray = 0, total = 0;
  for (let x = start; x < end; x++) {
    const p = (y * width + x) * 4;
    if (result[p] < 250) visible++;
    if (result[p] > 0 && result[p] < 250) gray++;
    assert.equal(result[p], result[p + 1]);
    assert.equal(result[p], result[p + 2]);
    assert.equal(result[p + 3], 255);
    total += result[p];
  }
  assert.ok(visible / (end - start) > .98, `Fine stroke retention: ${visible / (end - start)}`);
  return { visible: visible / (end - start), gray: gray / (end - start), mean: total / (end - start) };
});
assert.ok(retention[0].gray > .98, 'Faint pencil must retain gray levels');
assert.ok(retention[3].mean < 2, 'Dark print must remain black');
let diagonalVisible = 0;
for (let x = lines[0].start; x < lines[0].end; x++) {
  const y = Math.round(height * .6 + (x - lines[0].start) * .25);
  if (result[(y * width + x) * 4] < 250) diagonalVisible++;
}
assert.ok(diagonalVisible / (lines[0].end - lines[0].start) > .98);
assert.ok(result[(Math.round(height * .85) * width + lines[0].start) * 4] < 240, 'Small pencil dot must survive');
const stronger = enhance(fixture.pixels.slice(), width, height, 100);
const weaker = enhance(fixture.pixels.slice(), width, height, 0);
let strongWhite = 0;
for (let y = 40; y < height * .55; y++) {
  if (lines.some((line) => Math.abs(y - line.y) < 3)) continue;
  for (let x = 40; x < width - 40; x++) if (stronger[(y * width + x) * 4] === 255) strongWhite++;
}
assert.ok(strongWhite / paper > .99, 'Maximum detail must still keep synthetic paper white');
const index = (lines[0].y * width + Math.round(width * .5)) * 4;
assert.ok(stronger[index] < result[index] && result[index] < weaker[index], 'The strength control must increase faint-ink visibility');
// Bright compression halos must not raise the whole paper estimate. This
// specifically catches the gray-block failure a local maximum would create.
const haloWidth = 240, haloHeight = 320;
const halo = new Uint8ClampedArray(haloWidth * haloHeight * 4);
for (let y = 0; y < haloHeight; y++) {
  for (let x = 0; x < haloWidth; x++) {
    const p = (y * haloWidth + x) * 4;
    const value = x % 9 === 0 && y % 9 === 0 ? 245 : 220;
    halo[p] = halo[p + 1] = halo[p + 2] = value; halo[p + 3] = 255;
  }
}
assert.ok(enhance(halo, haloWidth, haloHeight).every((value) => value === 255), 'Bright halos must not create a gray paper veil');
for (const [w, h] of [[1, 1], [1, 9], [9, 1], [3, 5]]) {
  const image = new Uint8ClampedArray(w * h * 4).fill(220);
  const enhanced = enhance(image, w, h);
  assert.ok(enhanced.every((value) => value === 255), 'Uniform paper and very small images must become white');
}
// A noisy notebook must not inherit the ultra-sensitive clean-paper cutoff.
// The dark continuous pencil and separated dashes must keep their geometry.
const nw = 640, nh = 800;
const notebook = new Uint8ClampedArray(nw * nh * 4);
for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
  const grain = ((x * 1237 + y * 1811 + (x * y) % 131) % 13) - 6;
  const ghost = x > 300 && x < 500 && y > 100 && y < 300 && (x % 24 < 3 || y % 32 < 3) ? 6 : 0;
  const solid = y === 420 && x >= 80 && x < 560;
  const dash = y === 490 && x >= 80 && x < 560 && (x - 80) % 32 < 18;
  const value = 220 + grain - ghost - (solid || dash ? 60 : 0);
  const p = (y * nw + x) * 4;
  notebook[p] = notebook[p + 1] = notebook[p + 2] = value; notebook[p + 3] = 255;
}
const cleaned = enhance(notebook, nw, nh);
let notebookPaper = 0, notebookWhite = 0;
for (let y = 30; y < nh - 30; y++) for (let x = 30; x < nw - 30; x++) {
  if (y === 420 || y === 490) continue;
  notebookPaper++; if (cleaned[(y * nw + x) * 4] === 255) notebookWhite++;
}
assert.ok(notebookWhite / notebookPaper > .995, 'Paper grain and weak reverse writing must be suppressed');
for (let x = 80; x < 560; x++) {
  assert.ok(cleaned[(420 * nw + x) * 4] < 128, 'The solid line must not break');
  const value = cleaned[(490 * nw + x) * 4];
  if ((x - 80) % 32 < 18) assert.ok(value < 128, 'Every dash must survive');
  else assert.equal(value, 255, 'Dash gaps must stay white and must not be bridged');
}
console.log('PASS: noisy paper and reverse writing suppressed; solid line continuous; all dash segments and exact gaps preserved');
console.log(`PASS: scan algorithm; ${(100 * white / paper).toFixed(2)}% white paper; one-pixel line retention ${retention.map((line) => `${(line.visible * 100).toFixed(1)}%`).join('/')}; diagonal, tiny dot, gray pencil, dark ink, strength, small images`);
