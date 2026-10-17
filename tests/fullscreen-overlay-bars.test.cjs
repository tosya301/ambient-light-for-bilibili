const test = require('node:test');
const assert = require('node:assert/strict');
const { detect, detectFullscreenBars } = require('../extension/bars.js');

const ZERO = { top: 0, bottom: 0, left: 0, right: 0 };
const LETTERBOX = { ...ZERO, top: 0.1, bottom: 0.1 };

function frame({ width = 320, height = 180, top = 18, bottom = 18, colors = {}, flat = null } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const side = y < top ? 'top' : y >= height - bottom ? 'bottom' : null;
    const color = side ? colors[side] || [0, 0, 0] : flat ||
      [60 + (x * 17 + y * 3) % 180, 45 + (x * 3 + y * 11) % 180, 65 + (x * 7 + y * 5) % 170];
    data.set([...color, 255], (y * width + x) * 4);
  }
  return { data, width, height };
}

function pixel(image, x, y, color = [240, 240, 240]) {
  image.data.set([...color, 255], (y * image.width + x) * 4);
}

test('fullscreen-only protection accepts a sparse right-hand watermark without weakening crop detection', () => {
  const input = frame();
  // The watermark spans the right quarter; white strokes occupy 12.5% of
  // each affected row and 5.56% of the complete upper black band.
  for (let y = 8; y < 16; y++) for (let x = 240; x < 320; x += 2) pixel(input, x, y);
  assert.equal(detect(input), null, 'automatic cropping must preserve text in an encoded bar');
  assert.deepEqual(detectFullscreenBars(input), LETTERBOX);
});

test('fullscreen-only protection tolerates sparse centered subtitles in the source black band', () => {
  const input = frame();
  // A centered 60%-width text region has 15% bright pixels per affected row
  // and 5% over the full lower band. A middle-half probe sees 25% bright
  // pixels, so fullscreen confirmation must assess the complete row.
  for (let y = 166; y < 172; y++) for (let x = 64; x < 256; x += 4) pixel(input, x, y);
  assert.equal(detect(input), null);
  assert.deepEqual(detectFullscreenBars(input), LETTERBOX);
});

test('fullscreen protection accepts simultaneous sparse top watermark and bottom subtitle overlays', () => {
  const input = frame();
  for (let y = 8; y < 16; y++) for (let x = 240; x < 320; x += 2) pixel(input, x, y);
  for (let y = 166; y < 172; y++) for (let x = 64; x < 256; x += 4) pixel(input, x, y);
  assert.deepEqual(detectFullscreenBars(input), LETTERBOX);
});

test('downscaled watermark antialiasing does not terminate the black band early', () => {
  const input = frame({ top: 16, bottom: 15 });
  // The reported screenshot's 320px source sample has this per-row overlay
  // footprint: 20.3125% at the densest row, 8.1640625% over the upper band.
  // Use synthetic pixels instead of storing the user's screenshot.
  const counts = [6, 10, 10, 46, 55, 62, 65, 64, 63, 37];
  for (let row = 0; row < counts.length; row++) for (let n = 0; n < counts[row]; n++) {
    pixel(input, input.width - 1 - n, row + 6, n % 4 === 0 ? [24, 24, 24] : [240, 240, 240]);
  }
  assert.equal(detect(input), null);
  assert.deepEqual(detectFullscreenBars(input), { ...ZERO, top: 16 / 180, bottom: 15 / 180 });
});

test('each source band has its own total overlay budget', () => {
  const input = frame();
  // Only the upper band is noisy. Averaging both bands would incorrectly
  // reduce this 15% upper-band contamination to an acceptable 7.5%.
  for (let y = 0; y < 18; y++) for (let x = 64; x < 256; x += 4) pixel(input, x, y);
  assert.equal(detectFullscreenBars(input), null);
});

test('a single dense overlay row is inconclusive even with a small overall band footprint', () => {
  const input = frame();
  for (let x = 0; x < 81; x++) pixel(input, x, 9);
  assert.equal(detectFullscreenBars(input), null, '81/320 exceeds the 25% row budget');
});

test('fullscreen overlay budgets include their exact 25% row and 10% band limits', () => {
  const rowLimit = frame();
  for (let x = 0; x < 80; x++) pixel(rowLimit, x, 9);
  assert.deepEqual(detectFullscreenBars(rowLimit), LETTERBOX);
  const bandLimit = frame();
  for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) pixel(bandLimit, x, y);
  assert.deepEqual(detectFullscreenBars(bandLimit), LETTERBOX);
  for (let y = 0; y < 18; y++) pixel(bandLimit, 32, y);
  assert.equal(detectFullscreenBars(bandLimit), null, '33/320 exceeds the 10% band budget');
});

test('clean source bars and textured unbarred frames retain their confident results', () => {
  assert.deepEqual(detectFullscreenBars(frame()), LETTERBOX);
  assert.deepEqual(detectFullscreenBars(frame({ top: 0, bottom: 0 })), ZERO);
  assert.deepEqual(detectFullscreenBars(frame({ top: 2, bottom: 2 })), { ...ZERO, top: 2 / 180, bottom: 2 / 180 });
  assert.deepEqual(detectFullscreenBars(frame({ top: 45, bottom: 45 })), { ...ZERO, top: 0.25, bottom: 0.25 });
});

test('colored bars never trigger fullscreen black-band protection', () => {
  const input = frame({ colors: { top: [180, 30, 90], bottom: [40, 180, 100] } });
  assert.deepEqual(detectFullscreenBars(input), ZERO);
  assert.deepEqual(detect(input, { colored: true }), LETTERBOX, 'existing colored crop opt-in remains available');
});

test('one-sided, off-center and overlarge dark regions remain inconclusive', () => {
  assert.equal(detectFullscreenBars(frame({ top: 18, bottom: 0 })), null);
  assert.equal(detectFullscreenBars(frame({ top: 18, bottom: 26 })), null);
  assert.equal(detectFullscreenBars(frame({ top: 46, bottom: 46 })), null);
  assert.deepEqual(detectFullscreenBars(frame({ top: 1, bottom: 1 })), ZERO);
});

test('flat pictures and black or nearly flat dark scenes cannot confirm source bars', () => {
  assert.equal(detectFullscreenBars(frame({ top: 0, bottom: 0, flat: [0, 0, 0] })), null);
  assert.equal(detectFullscreenBars(frame({ top: 0, bottom: 0, flat: [180, 50, 100] })), null);
  assert.equal(detectFullscreenBars(frame({ flat: [255, 255, 255] })), null);
  const dark = frame({ top: 0, bottom: 0, flat: [8, 8, 8] });
  for (let i = 0; i < dark.data.length; i += 4) dark.data[i] += i % 7;
  assert.equal(detectFullscreenBars(dark), null);
});

test('gradual dark borders and low-contrast transitions do not count as black bands', () => {
  const gradient = frame({ top: 0, bottom: 0 });
  for (let y = 0; y < gradient.height; y++) for (let x = 0; x < gradient.width; x++) {
    const value = Math.round(255 * Math.min(y, gradient.height - 1 - y) / (gradient.height / 2));
    pixel(gradient, x, y, [value, value, value]);
  }
  assert.equal(detectFullscreenBars(gradient), null);
  const near = frame();
  for (let x = 0; x < near.width; x++) for (let d = 0; d < 3; d++) {
    pixel(near, x, 18 + d, [20, 20, 20]);
    pixel(near, x, 161 - d, [20, 20, 20]);
  }
  assert.equal(detectFullscreenBars(near), null);
});

test('invalid raster input is safely inconclusive for fullscreen observation', () => {
  for (const input of [null, {}, { width: 320, height: 180, data: [] }, frame({ width: 8 })]) {
    assert.equal(detectFullscreenBars(input), null);
  }
});

test('fullscreen detection never alters source pixels or raster dimensions', () => {
  const input = frame();
  for (let y = 8; y < 16; y++) for (let x = 240; x < 320; x += 2) pixel(input, x, y);
  const before = new Uint8ClampedArray(input.data);
  assert.deepEqual(detectFullscreenBars(input), LETTERBOX);
  assert.deepEqual(input.data, before);
  assert.equal(input.width, 320);
  assert.equal(input.height, 180);
});
