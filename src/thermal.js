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

// Un tono por severidad en todas las zonas: fucsia/morado, naranja y rojo.
const heatPalettes = {
  1: { edge: [117, 25, 139], core: [225, 27, 173] },
  2: { edge: [207, 75, 8], core: [255, 150, 22] },
  3: { edge: [105, 0, 38], core: [220, 12, 50] },
};
const heatOpacity = .94;
const lightResponse = .35;
const heatStrength = .82;
const heatFalloff = 1.2;
const severeWarmTint = [105, 25, 130];
// La rampa del filtro original aporta sombras índigo, medios morados y luz cálida.
const thermalStops = [
  [0, [5, 3, 8]], [.16, [11, 6, 46]], [.34, [45, 9, 87]],
  [.51, [107, 11, 70]], [.67, [201, 26, 27]], [.80, [247, 84, 9]],
  [.92, [255, 184, 28]], [1, [255, 235, 176]],
];
const thermalColor = temperature => {
  const next = thermalStops.findIndex(([stop]) => temperature <= stop);
  const end = Math.max(1, next);
  const [startAt, startColor] = thermalStops[end - 1];
  const [endAt, endColor] = thermalStops[end];
  const amount = Math.max(0, Math.min(1, (temperature - startAt) / (endAt - startAt)));
  return startColor.map((channel, index) => channel + (endColor[index] - channel) * amount);
};
function createThermalGrade(blackLevel, whiteLevel, severity) {
  const grade = new Uint8Array(256 * 6);
  const exposureSpan = Math.max(.35, whiteLevel - blackLevel);
  for (let luminance = 0; luminance < 256; luminance++) {
    const normalized = Math.max(0, Math.min(1, (luminance / 255 - blackLevel) / exposureSpan));
    const tone = Math.log1p(2 * normalized) / Math.log(3);
    const baseTemperature = .10 + .39 * Math.pow(tone, 1.12);
    const background = thermalColor(baseTemperature);
    const subjectTemperature = baseTemperature + .16;
    const subject = thermalColor(subjectTemperature);
    // Solo atenuar los tonos cálidos del cuerpo severo; las sombras y el fondo conservan su color.
    const cooling = severity === 3 ? .34 * smoothstep(.38, .66, subjectTemperature) : 0;
    if (cooling) {
      for (let channel = 0; channel < 3; channel++) {
        subject[channel] += (severeWarmTint[channel] - subject[channel]) * cooling;
      }
    }
    for (let channel = 0; channel < 3; channel++) {
      grade[luminance * 6 + channel] = background[channel];
      grade[luminance * 6 + 3 + channel] = subject[channel];
    }
  }
  return grade;
}

export function trackedSpots(landmarks, image, zone) {
  const width = image.width;
  const height = image.height;
  const point = index => landmarks[index];
  const size = (a, b) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  const spots = { cara: [], pecho: [], brazos: [] };
  const add = (group, center, radiusX, radiusY, angle = 0) => {
    spots[group].push([center.x, center.y, radiusX / width, radiusY / height, heatStrength, angle, group]);
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
    const cheeks = along(eyes, mouth, .44);
    add('cara', { x: eyes.x, y: eyes.y - Math.min(faceHeight * .40, faceWidth * .38) / height }, faceWidth * .30, Math.min(faceHeight * .14, faceWidth * .14));
    add('cara', { x: cheeks.x - faceWidth * .32 / width, y: cheeks.y }, faceWidth * .19, Math.min(faceHeight * .14, faceWidth * .14), -.18);
    add('cara', { x: cheeks.x + faceWidth * .32 / width, y: cheeks.y }, faceWidth * .19, Math.min(faceHeight * .14, faceWidth * .14), .18);
    if (shouldersReady) {
      const shoulderCenter = midpoint(leftShoulder, rightShoulder);
      add('cara', along(mouth, shoulderCenter, .50), faceWidth * .23, Math.min(faceHeight * .32, faceWidth * .40));
    } else {
      add('cara', along(mouth, ears, -.38), faceWidth * .23, Math.min(faceHeight * .27, faceWidth * .38));
    }
  }

  if (shouldersReady) {
    const shoulderCenter = midpoint(leftShoulder, rightShoulder);
    add('pecho', { x: shoulderCenter.x, y: shoulderCenter.y + shoulderWidth * .32 / height }, shoulderWidth * .31, shoulderWidth * .20);
  }

  const limb = (group, startIndex, middleIndex, endIndex, radius) => {
    const start = point(startIndex), middle = point(middleIndex), end = point(endIndex);
    const segment = (a, b, thickness) => {
      const dx = (b.x - a.x) * width;
      const dy = (b.y - a.y) * height;
      const length = Math.hypot(dx, dy);
      if (length < radius * .5) return;
      add(group, midpoint(a, b), thickness, length * .28, Math.atan2(-dx, dy));
    };
    if (visible(start) && visible(middle)) segment(start, middle, radius);
    if (visible(middle) && visible(end)) segment(middle, end, radius * .80);
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
  const zone = typeof zones === 'string' ? zones : [...zones][0];
  const showHeat = Boolean(zone) && severity !== 0;
  // El contraste de la foto alimenta la escala térmica; la toma original queda intacta.
  context.filter = showHeat ? 'contrast(1.12) brightness(.97)' : 'none';
  context.drawImage(image, offsetX, offsetY, image.width * scale, image.height * scale);
  context.filter = 'none';

  if (!showHeat) return;
  const palette = heatPalettes[severity] ?? heatPalettes[1];
  const spots = trackedSpots(landmarks, image, zone);
  if (!spots.length) throw new Error('No pudimos ubicar la zona elegida. Repite la foto mostrando esa parte del cuerpo.');

  const exposureCanvas = document.createElement('canvas');
  exposureCanvas.width = exposureCanvas.height = 24;
  const exposureContext = exposureCanvas.getContext('2d', { willReadFrequently: true });
  exposureContext.drawImage(canvas, 0, 0, 24, 24);
  const exposurePixels = exposureContext.getImageData(0, 0, 24, 24).data;
  const luminances = [];
  for (let index = 0; index < exposurePixels.length; index += 4) {
    luminances.push((exposurePixels[index] * .2126 + exposurePixels[index + 1] * .7152 + exposurePixels[index + 2] * .0722) / 255);
  }
  luminances.sort((a, b) => a - b);
  const thermalGrade = createThermalGrade(Math.min(.10, luminances[28]), Math.max(.60, luminances[547]), severity);

  const frame = context.getImageData(0, 0, width, height);
  const pixels = frame.data;
  const blurRadius = Math.max(3, Math.min(7, Math.round(width / 120)));
  const blurredCanvas = document.createElement('canvas');
  blurredCanvas.width = width;
  blurredCanvas.height = height;
  const blurredContext = blurredCanvas.getContext('2d', { willReadFrequently: true });
  blurredContext.filter = `blur(${blurRadius}px)`;
  blurredContext.drawImage(canvas, 0, 0);
  const blurredPixels = blurredContext.getImageData(0, 0, width, height).data;
  // Toda la foto usa la misma escala térmica: la máscara solo suma calor base a la persona.
  for (let y = 0; y < height; y++) {
    const sourceY = (y - offsetY) / (image.height * scale);
    for (let x = 0; x < width; x++) {
      const sourceX = (x - offsetX) / (image.width * scale);
      const confidence = maskConfidence(mask, sourceX, sourceY);
      const foreground = smoothstep(.16, .66, confidence);
      const bodyWarmth = smoothstep(.28, .72, confidence);
      const edge = smoothstep(0, blurRadius * 2, Math.min(x, y, width - 1 - x, height - 1 - y));
      const blur = .78 * (1 - foreground) * edge;
      const index = (y * width + x) * 4;
      const imageLuma = pixels[index] * .2126 + pixels[index + 1] * .7152 + pixels[index + 2] * .0722;
      const broadLuma = blurredPixels[index] * .2126 + blurredPixels[index + 1] * .7152 + blurredPixels[index + 2] * .0722;
      const surfaceDetail = Math.max(-24, Math.min(24, imageLuma - broadLuma));
      const toneLuma = imageLuma * (1 - blur) + broadLuma * blur + surfaceDetail * .22;
      const gradeIndex = Math.max(0, Math.min(255, Math.round(toneLuma))) * 6;
      for (let channel = 0; channel < 3; channel++) {
        const cool = thermalGrade[gradeIndex + channel];
        const warm = thermalGrade[gradeIndex + 3 + channel];
        pixels[index + channel] = cool + (warm - cool) * bodyWarmth + surfaceDetail * .22;
      }
    }
  }
  const heat = new Float32Array(width * height);
  const luma = ([red, green, blue]) => red * .2126 + green * .7152 + blue * .0722;
  const edgeLuma = luma(palette.edge), coreLuma = luma(palette.core);
  for (const [spotIndex, [cx, cy, rx, ry, strength, angle = 0]] of spots.entries()) {
    const seed = spotIndex * 2.4;
    const centerX = offsetX + cx * image.width * scale;
    const centerY = offsetY + cy * image.height * scale;
    const radiusX = rx * image.width * scale;
    const radiusY = ry * image.height * scale;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const reachX = Math.hypot(radiusX * cosine, radiusY * sine) * 2.3;
    const reachY = Math.hypot(radiusX * sine, radiusY * cosine) * 2.3;
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
        if (distance > 5.29) continue;
        // Ondulaciones amplias y una aureola tenue rompen el óvalo uniforme sin crear bordes duros.
        const contour = 1 + .14 * Math.sin(localX * 2.3 + localY * 1.2 + seed)
          + .10 * Math.sin(localY * 3.4 - localX * 1.1 - seed * 1.3);
        const shapedDistance = distance * contour;
        const texture = 1 + .08 * Math.sin(localX * 4.1 + localY * 5.3 + seed * 1.7)
          + .05 * Math.sin(localX * 9.2 - localY * 7.1 + seed * 2.3);
        const glow = strength * texture * (.72 * Math.exp(-heatFalloff * shapedDistance)
          + .28 * Math.exp(-heatFalloff * .48 * shapedDistance));
        const index = y * width + x;
        heat[index] = 1 - (1 - heat[index]) * (1 - glow);
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const warmth = heat[y * width + x];
      if (warmth < .003) continue;
      const sourceX = (x - offsetX) / (image.width * scale);
      const sourceY = (y - offsetY) / (image.height * scale);
      if (sourceX < 0 || sourceX > 1 || sourceY < 0 || sourceY > 1) continue;
      const person = smoothstep(.20, .60, maskConfidence(mask, sourceX, sourceY));
      const index = (y * width + x) * 4;
      const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
      const luminance = red * .2126 + green * .7152 + blue * .0722;
      // La misma veladura se aplica en piel y ropa; solo se atenúan las zonas muy oscuras.
      const surface = smoothstep(15, 58, luminance);
      const brightSurface = smoothstep(115, 205, luminance);
      const alpha = Math.min(.96, Math.min(heatOpacity, heatOpacity * 1.06 * (1 - Math.exp(-3.8 * warmth)))
        * smoothstep(.003, .11, warmth) * person * surface * (1 + .32 * brightSurface));
      if (alpha < .004) continue;
      const core = smoothstep(.12, .85, warmth);
      const tintLuma = edgeLuma + (coreLuma - edgeLuma) * core;
      const broadLuma = blurredPixels[index] * .2126 + blurredPixels[index + 1] * .7152 + blurredPixels[index + 2] * .0722;
      const detail = Math.max(-18, Math.min(18, (luminance - broadLuma) * .55));
      const toneShift = Math.max(-16, Math.min(16, (luminance - tintLuma) * lightResponse));
      for (let channel = 0; channel < 3; channel++) {
        const color = palette.edge[channel] + (palette.core[channel] - palette.edge[channel]) * core;
        const tint = color + toneShift + detail;
        pixels[index + channel] = pixels[index + channel] * (1 - alpha) + tint * alpha;
      }
    }
  }
  context.putImageData(frame, 0, 0);
}
