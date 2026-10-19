import { analyzePhoto } from './pose.js';

// El color es una ilustración, no una medición de temperatura.
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const visible = point => point && (point.visibility ?? 1) > .3 && (point.presence ?? 1) > .3;
const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

function trackedSpots(landmarks, image, zone) {
  const width = image.width;
  const height = image.height;
  const point = index => landmarks[index];
  const size = (a, b) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  const spots = { cara: [], pecho: [], extremidades: [], abdomen: [] };
  const add = (group, center, radiusX, radiusY, strength) => {
    spots[group].push([center.x, center.y, radiusX / width, radiusY / height, strength]);
  };

  const leftShoulder = point(11), rightShoulder = point(12);
  const leftHip = point(23), rightHip = point(24);
  const shouldersReady = visible(leftShoulder) && visible(rightShoulder);
  const hipsReady = visible(leftHip) && visible(rightHip);
  const shoulderWidth = shouldersReady ? size(leftShoulder, rightShoulder) : 0;
  const bodyWidth = shoulderWidth || (hipsReady ? size(leftHip, rightHip) : 0);

  if ([2, 5, 7, 8, 9, 10].every(index => visible(point(index)))) {
    const eyes = midpoint(point(2), point(5));
    const mouth = midpoint(point(9), point(10));
    const ears = midpoint(point(7), point(8));
    const faceWidth = Math.max(size(point(7), point(8)), shoulderWidth * .32);
    const faceHeight = Math.max(size(eyes, mouth) * 2.5, faceWidth * .8);
    add('cara', { x: eyes.x, y: eyes.y - faceHeight * .18 / height }, faceWidth * .25, faceHeight * .16, .88);
    const cheeks = along(eyes, mouth, .55);
    add('cara', { x: cheeks.x - faceWidth * .22 / width, y: cheeks.y }, faceWidth * .19, faceHeight * .18, .76);
    add('cara', { x: cheeks.x + faceWidth * .22 / width, y: cheeks.y }, faceWidth * .19, faceHeight * .18, .76);
    if (shouldersReady) {
      const shoulderCenter = midpoint(leftShoulder, rightShoulder);
      add('cara', along(mouth, shoulderCenter, .42), faceWidth * .22, faceHeight * .20, .68);
    } else {
      add('cara', along(mouth, ears, -.35), faceWidth * .20, faceHeight * .16, .64);
    }
  }

  if (shouldersReady) {
    const shoulderCenter = midpoint(leftShoulder, rightShoulder);
    const elbowsReady = visible(point(13)) && visible(point(14));
    const nose = point(0);
    const torsoGuide = hipsReady ? midpoint(leftHip, rightHip)
      : elbowsReady ? midpoint(point(13), point(14))
      : visible(nose) ? { x: shoulderCenter.x + (shoulderCenter.x - nose.x) * 1.5, y: shoulderCenter.y + (shoulderCenter.y - nose.y) * 1.5 }
      : null;
    if (torsoGuide) {
      const torsoHeight = size(shoulderCenter, torsoGuide);
      add('pecho', along(shoulderCenter, torsoGuide, hipsReady ? .27 : .48), shoulderWidth * .34, Math.max(torsoHeight * .18, shoulderWidth * .12), .80);
      if (hipsReady) add('abdomen', along(shoulderCenter, torsoGuide, .68), shoulderWidth * .31, torsoHeight * .20, .58);
    }
  }

  const limb = (startIndex, middleIndex, endIndex, radius) => {
    const start = point(startIndex), middle = point(middleIndex), end = point(endIndex);
    if (visible(start) && visible(middle)) {
      add('extremidades', along(start, middle, .47), radius, radius * 1.12, .76);
    }
    if (visible(middle) && visible(end)) {
      add('extremidades', along(middle, end, .52), radius * .86, radius, .72);
    }
  };
  const limbRadius = bodyWidth * .11;
  if (limbRadius) {
    limb(11, 13, 15, limbRadius);
    limb(12, 14, 16, limbRadius);
    limb(23, 25, 27, limbRadius * 1.25);
    limb(24, 26, 28, limbRadius * 1.25);
  }

  if (zone === 'cuerpo') return [...spots.cara, ...spots.pecho, ...spots.abdomen, ...spots.extremidades];
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

export async function renderThermal(photo, zones, canvas, size) {
  const { image, landmarks, mask } = await analyzePhoto(photo);
  if (!canvas.isConnected && !size) return;
  const rect = canvas.getBoundingClientRect();
  const aspect = size ? size.width / size.height : rect.width && rect.height ? rect.width / rect.height : image.width / image.height;
  const width = size?.width ?? Math.min(720, Math.max(1, Math.round(rect.width)));
  const height = size?.height ?? Math.max(1, Math.round(width / aspect));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const scale = Math.max(width / image.width, height / image.height);
  const offsetX = (width - image.width * scale) / 2;
  const offsetY = (height - image.height * scale) / 2;
  context.drawImage(image, offsetX, offsetY, image.width * scale, image.height * scale);

  const zone = typeof zones === 'string' ? zones : [...zones][0];
  const spots = trackedSpots(landmarks, image, zone);
  if (!spots.length) throw new Error('No pudimos ubicar la zona elegida. Repite la foto mostrando esa parte del cuerpo.');

  const frame = context.getImageData(0, 0, width, height);
  const pixels = frame.data;
  for (const [cx, cy, rx, ry, strength] of spots) {
    const centerX = offsetX + cx * image.width * scale;
    const centerY = offsetY + cy * image.height * scale;
    const radiusX = rx * image.width * scale;
    const radiusY = ry * image.height * scale;
    const left = Math.max(0, Math.floor(centerX - radiusX * 1.7));
    const right = Math.min(width, Math.ceil(centerX + radiusX * 1.7));
    const top = Math.max(0, Math.floor(centerY - radiusY * 1.7));
    const bottom = Math.min(height, Math.ceil(centerY + radiusY * 1.7));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const distance = ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2;
        if (distance > 2.9) continue;
        const glow = Math.exp(-2.4 * distance) * strength;
        if (glow < .012) continue;
        const sourceX = (x - offsetX) / (image.width * scale);
        const sourceY = (y - offsetY) / (image.height * scale);
        if (sourceX < 0 || sourceX > 1 || sourceY < 0 || sourceY > 1) continue;
        const person = smoothstep(.18, .72, maskConfidence(mask, sourceX, sourceY));
        const alpha = Math.min(.88, glow) * person;
        if (alpha < .004) continue;
        const index = (y * width + x) * 4;
        const warmth = Math.max(0, 1 - distance / 1.4);
        const green = 176 + 49 * warmth;
        const blue = 8 + 22 * warmth;
        pixels[index] = pixels[index] * (1 - alpha) + 255 * alpha;
        pixels[index + 1] = pixels[index + 1] * (1 - alpha) + green * alpha;
        pixels[index + 2] = pixels[index + 2] * (1 - alpha) + blue * alpha;
      }
    }
  }
  context.putImageData(frame, 0, 0);
}
