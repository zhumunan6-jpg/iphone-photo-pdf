// Synthetic, non-personal paper: warm light, gradual shadow, sensor noise,
// one-pixel pencil lines, a diagonal, small dots, and dark printed strokes.
export function scanFixture(width = 1200, height = 1600) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const start = Math.round(width * .15), end = Math.round(width * .85);
  const lines = [4, 9, 18, 160].map((contrast, i) => ({ y: Math.round(height * (.20 + i * .08)), contrast, start, end }));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const noise = ((x * 17 + y * 13) % 3) - 1;
      const paper = 221 + 17 * x / width + 7 * y / height - 20 * Math.exp(-Math.pow((x / width - .3) / .2, 2));
      let ink = lines.find((line) => line.y === y && x >= start && x < end)?.contrast || 0;
      const diagonal = Math.round(height * .6 + (x - start) * .25);
      if (x >= start && x < end && y === diagonal) ink = 7;
      if (y >= Math.round(height * .85) && y < Math.round(height * .85) + 2 && x >= start && x < start + 2) ink = 8;
      const p = (y * width + x) * 4;
      pixels[p] = Math.round(paper + 8 + noise - ink);
      pixels[p + 1] = Math.round(paper + 2 + noise - ink);
      pixels[p + 2] = Math.round(paper - 8 + noise - ink);
      pixels[p + 3] = 255;
    }
  }
  return { pixels, width, height, lines };
}
