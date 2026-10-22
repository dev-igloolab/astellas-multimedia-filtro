// Precalcula la interpolación de la máscara para reutilizarla en el filtro y el calor.
export function sampleMask(
  mask,
  width,
  height,
  sourceWidth,
  sourceHeight,
  offsetX,
  offsetY,
) {
  const left = new Uint32Array(width);
  const right = new Uint32Array(width);
  const blendX = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const px = Math.max(
      0,
      Math.min(
        mask.width - 1,
        ((x - offsetX) / sourceWidth) * (mask.width - 1),
      ),
    );
    left[x] = Math.floor(px);
    right[x] = Math.min(mask.width - 1, left[x] + 1);
    blendX[x] = px - left[x];
  }
  const confidence = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const py = Math.max(
      0,
      Math.min(
        mask.height - 1,
        ((y - offsetY) / sourceHeight) * (mask.height - 1),
      ),
    );
    const y0 = Math.floor(py);
    const topRow = y0 * mask.width;
    const bottomRow = Math.min(mask.height - 1, y0 + 1) * mask.width;
    const blendY = py - y0;
    for (let x = 0; x < width; x++) {
      const dx = blendX[x];
      const top =
        mask.values[topRow + left[x]] * (1 - dx) +
        mask.values[topRow + right[x]] * dx;
      const bottom =
        mask.values[bottomRow + left[x]] * (1 - dx) +
        mask.values[bottomRow + right[x]] * dx;
      confidence[y * width + x] = top * (1 - blendY) + bottom * blendY;
    }
  }
  return confidence;
}
