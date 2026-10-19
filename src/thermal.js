// Offline false-colour preview. The selected zones add heat to the photograph;
// this is an illustration, not a temperature measurement.
export async function renderThermal(photo, zones, canvas) {
  const image = new Image();
  image.src = photo;
  await image.decode();
  const width = 450;
  const height = 600;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  const cropWidth = sourceRatio > targetRatio ? image.height * targetRatio : image.width;
  const cropHeight = sourceRatio > targetRatio ? image.height : image.width / targetRatio;
  context.drawImage(image, (image.width - cropWidth) / 2, (image.height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, width, height);
  const frame = context.getImageData(0, 0, width, height);
  const selected = [...zones];
  const points = {
    cara: [[.5,.22,.25,.16,.65]],
    pecho: [[.5,.48,.37,.21,.64]],
    cuerpo: [[.5,.53,.46,.42,.45]],
    extremidades: [[.18,.56,.22,.38,.54],[.82,.56,.22,.38,.54]],
  };
  const heat = selected.flatMap(zone => points[zone] || []);
  const palette = [[31,20,74],[67,38,135],[157,39,134],[238,56,66],[255,143,28],[255,226,66],[255,249,181]];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const luminance = (frame.data[offset] * .2126 + frame.data[offset+1] * .7152 + frame.data[offset+2] * .0722) / 255;
    let temperature = .13 + luminance * .52;
    for (const [px,py,rx,ry,intensity] of heat) {
      const dx = (x / width - px) / rx;
      const dy = (y / height - py) / ry;
      temperature += intensity * Math.exp(-2.6 * (dx*dx + dy*dy));
    }
    const position = Math.min(palette.length - 1.001, Math.max(0, temperature * (palette.length - 1)));
    const index = Math.floor(position);
    const fraction = position - index;
    for (let channel = 0; channel < 3; channel++) frame.data[offset+channel] = palette[index][channel] * (1-fraction) + palette[index+1][channel] * fraction;
  }
  context.putImageData(frame, 0, 0);
}
