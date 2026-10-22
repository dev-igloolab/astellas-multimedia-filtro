import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleMask } from '../src/lib/vision/mask-sampler.js';

// Referencia de la interpolación original, antes de precalcular las coordenadas.
function originalConfidence(mask, x, y) {
  const px = Math.max(0, Math.min(mask.width - 1, x * (mask.width - 1)));
  const py = Math.max(0, Math.min(mask.height - 1, y * (mask.height - 1)));
  const x0 = Math.floor(px),
    y0 = Math.floor(py);
  const x1 = Math.min(mask.width - 1, x0 + 1);
  const y1 = Math.min(mask.height - 1, y0 + 1);
  const dx = px - x0,
    dy = py - y0;
  const top =
    mask.values[y0 * mask.width + x0] * (1 - dx) +
    mask.values[y0 * mask.width + x1] * dx;
  const bottom =
    mask.values[y1 * mask.width + x0] * (1 - dx) +
    mask.values[y1 * mask.width + x1] * dx;
  return top * (1 - dy) + bottom * dy;
}

test('La máscara optimizada conserva exactamente el recorte y los bordes originales', () => {
  const mask = {
    width: 7,
    height: 5,
    values: Float32Array.from({ length: 35 }, (_, i) => ((i * 13) % 31) / 31),
  };
  for (const [sourceWidth, sourceHeight, offsetX, offsetY] of [
    [31, 49, 0, 0],
    [70.5, 49, -19.75, 0],
    [31, 80.3, 0, -15.65],
    [20, 30, 5, 8],
  ]) {
    const sampled = sampleMask(
      mask,
      31,
      49,
      sourceWidth,
      sourceHeight,
      offsetX,
      offsetY,
    );
    for (let y = 0; y < 49; y++) {
      for (let x = 0; x < 31; x++) {
        assert.equal(
          sampled[y * 31 + x],
          originalConfidence(
            mask,
            (x - offsetX) / sourceWidth,
            (y - offsetY) / sourceHeight,
          ),
        );
      }
    }
  }
});

test('Una máscara de un solo píxel se interpola sin salir de sus límites', () => {
  const sampled = sampleMask(
    { width: 1, height: 1, values: [0.75] },
    10,
    20,
    10,
    20,
    0,
    0,
  );
  assert.ok(sampled.every((value) => value === 0.75));
});
