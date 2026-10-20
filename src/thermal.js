import { analyzePhoto } from './pose.js';
import { coverPhoto } from './photo-frame.js';

// El color es una ilustración, no una medición de temperatura.
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const visible = point => point && (point.visibility ?? 1) > .3 && (point.presence ?? 1) > .3;
const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

// Un tono por severidad en todas las zonas: amarillo, morado y magenta.
const heatPalettes = {
  1: { edge: [242, 151, 20], core: [255, 205, 16], opacity: .76 },
  2: { edge: [115, 35, 166], core: [177, 11, 207], opacity: .80 },
  3: { edge: [184, 23, 110], core: [237, 5, 133], opacity: .82 },
};

export function trackedSpots(landmarks, image, zone) {
  const width = image.width;
  const height = image.height;
  const point = index => landmarks[index];
  const size = (a, b) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  const spots = { cara: [], pecho: [], brazos: [] };
  const add = (group, center, radiusX, radiusY, strength, angle = 0) => {
    spots[group].push([center.x, center.y, radiusX / width, radiusY / height, strength, angle, group]);
  };

  const leftShoulder = point(11), rightShoulder = point(12);
  const shouldersReady = visible(leftShoulder) && visible(rightShoulder);
  const shoulderWidth = shouldersReady ? size(leftShoulder, rightShoulder) : 0;

  if ([2, 5, 7, 8, 9, 10].every(index => visible(point(index)))) {
    const eyes = midpoint(point(2), point(5));
    const mouth = midpoint(point(9), point(10));
    const ears = midpoint(point(7), point(8));
    const faceWidth = Math.max(size(point(7), point(8)), shoulderWidth * .32);
    const faceHeight = Math.max(size(eyes, mouth) * 2.5, faceWidth * .8);
    const cheeks = along(eyes, mouth, .48);
    add('cara', { x: eyes.x, y: eyes.y - Math.min(faceHeight * .40, faceWidth * .36) / height }, faceWidth * .25, Math.min(faceHeight * .12, faceWidth * .12), .68);
    add('cara', { x: cheeks.x - faceWidth * .32 / width, y: cheeks.y }, faceWidth * .16, Math.min(faceHeight * .13, faceWidth * .12), .67, -.18);
    add('cara', { x: cheeks.x + faceWidth * .32 / width, y: cheeks.y }, faceWidth * .16, Math.min(faceHeight * .13, faceWidth * .12), .67, .18);
    if (shouldersReady) {
      const shoulderCenter = midpoint(leftShoulder, rightShoulder);
      add('cara', along(mouth, shoulderCenter, .58), faceWidth * .23, Math.min(faceHeight * .32, faceWidth * .40), .62);
    } else {
      add('cara', along(mouth, ears, -.32), faceWidth * .23, Math.min(faceHeight * .27, faceWidth * .38), .58);
    }
  }

  if (shouldersReady) {
    const shoulderCenter = midpoint(leftShoulder, rightShoulder);
    add('pecho', { x: shoulderCenter.x, y: shoulderCenter.y + shoulderWidth * .32 / height }, shoulderWidth * .31, shoulderWidth * .20, .70);
  }

  const limb = (group, startIndex, middleIndex, endIndex, radius) => {
    const start = point(startIndex), middle = point(middleIndex), end = point(endIndex);
    const segment = (a, b, strength, thickness) => {
      const dx = (b.x - a.x) * width;
      const dy = (b.y - a.y) * height;
      const length = Math.hypot(dx, dy);
      if (length < radius * .5) return;
      add(group, midpoint(a, b), thickness, length * .28, strength, Math.atan2(-dx, dy));
    };
    if (visible(start) && visible(middle)) segment(start, middle, .72, radius);
    if (visible(middle) && visible(end)) segment(middle, end, .60, radius * .80);
  };
  const limbRadius = shoulderWidth * .13;
  if (limbRadius) {
    limb('brazos', 11, 13, 15, limbRadius);
    limb('brazos', 12, 14, 16, limbRadius);
  }

  if (zone === 'cuerpo') return [...spots.cara, ...spots.pecho, ...spots.brazos];
  if (zone === 'extremidades') return spots.brazos;
  return spots[zone] ?? [];
}

function maskConfidence(mask, x, y) {
  const px = Math.max(0, Math.min(mask.width - 1, x * (mask.width - 1)));
  const py = Math.max(0, Math.min(mask.height - 1, y * (mask.height - 1)));
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = Math.min(mask.width - 1, x0 + 1);
  const y1 = Math.min(mask.height - 1, y0 + 1);
  const dx = px - x0, dy = py - y0;
  const top = mask.values[y0 * mask.width + x0] * (1 - dx) + mask.values[y0 * mask.width + x1] * dx;
  const bottom = mask.values[y1 * mask.width + x0] * (1 - dx) + mask.values[y1 * mask.width + x1] * dx;
  return top * (1 - dy) + bottom * dy;
}

export async function validateTrackedZone(photo, zones) {
  const { image, landmarks, mask } = await analyzePhoto(photo);
  const zone = typeof zones === 'string' ? zones : [...zones][0];
  const spots = trackedSpots(landmarks, image, zone);
  if (!spots.some(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1 && maskConfidence(mask, x, y) > .25)) {
    throw new Error('No pudimos ubicar la zona elegida. Repite la foto mostrando esa parte del cuerpo.');
  }
}

export async function renderThermal(photo, zones, canvas, size, severity = 1) {
  const { image, landmarks, mask } = await analyzePhoto(photo);
  if (!canvas.isConnected && !size) return;
  const rect = canvas.getBoundingClientRect();
  const aspect = size ? size.width / size.height : rect.width && rect.height ? rect.width / rect.height : image.width / image.height;
  const width = size?.width ?? Math.min(720, Math.max(1, Math.round(rect.width)));
  const height = size?.height ?? Math.max(1, Math.round(width / aspect));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const { scale, x: offsetX, y: offsetY } = coverPhoto(image.width, image.height, width, height);
  context.drawImage(image, offsetX, offsetY, image.width * scale, image.height * scale);

  const zone = typeof zones === 'string' ? zones : [...zones][0];
  if (!zone || severity === 0) return;
  const palette = heatPalettes[severity] ?? heatPalettes[1];
  const spots = trackedSpots(landmarks, image, zone);
  if (!spots.length) throw new Error('No pudimos ubicar la zona elegida. Repite la foto mostrando esa parte del cuerpo.');

  const frame = context.getImageData(0, 0, width, height);
  const pixels = frame.data;
  const heat = new Float32Array(width * height);
  for (const [cx, cy, rx, ry, strength, angle = 0, group] of spots) {
    const falloff = group === 'pecho' ? 1.2 : group === 'cara' ? 1.2 : 1.5;
    const centerX = offsetX + cx * image.width * scale;
    const centerY = offsetY + cy * image.height * scale;
    const radiusX = rx * image.width * scale;
    const radiusY = ry * image.height * scale;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const reachX = Math.hypot(radiusX * cosine, radiusY * sine) * 2;
    const reachY = Math.hypot(radiusX * sine, radiusY * cosine) * 2;
    const left = Math.max(0, Math.floor(centerX - reachX));
    const right = Math.min(width, Math.ceil(centerX + reachX));
    const top = Math.max(0, Math.floor(centerY - reachY));
    const bottom = Math.min(height, Math.ceil(centerY + reachY));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const dx = x - centerX, dy = y - centerY;
        const localX = (dx * cosine + dy * sine) / radiusX;
        const localY = (-dx * sine + dy * cosine) / radiusY;
        const distance = localX * localX + localY * localY;
        if (distance > 4) continue;
        const glow = Math.exp(-falloff * distance) * strength;
        const index = y * width + x;
        heat[index] = 1 - (1 - heat[index]) * (1 - glow);
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const warmth = heat[y * width + x];
      if (warmth < .025) continue;
      const sourceX = (x - offsetX) / (image.width * scale);
      const sourceY = (y - offsetY) / (image.height * scale);
      if (sourceX < 0 || sourceX > 1 || sourceY < 0 || sourceY > 1) continue;
      const person = smoothstep(.22, .76, maskConfidence(mask, sourceX, sourceY));
      // Centro saturado, bordes difusos y relieve de la foto visible bajo el color.
      const alpha = palette.opacity * (1 - Math.exp(-3 * warmth))
        * smoothstep(.015, .12, warmth) * person;
      if (alpha < .004) continue;
      const core = smoothstep(.08, .80, warmth);
      const index = (y * width + x) * 4;
      const luminance = pixels[index] * .2126 + pixels[index + 1] * .7152 + pixels[index + 2] * .0722;
      const shade = Math.max(.88, Math.min(1.12, .95 + (luminance - 135) * .0012));
      for (let channel = 0; channel < 3; channel++) {
        const color = (palette.edge[channel] + (palette.core[channel] - palette.edge[channel]) * core) * shade;
        pixels[index + channel] = pixels[index + channel] * (1 - alpha) + color * alpha;
      }
    }
  }
  context.putImageData(frame, 0, 0);
}
