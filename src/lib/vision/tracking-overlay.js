import { trackedSpots } from './thermal.js';

const zones = ['cara', 'pecho', 'brazos'];
function drawGuide(context, left, top, right, bottom) {
  const arm = 10;
  context.beginPath();
  for (const horizontal of [-1, 1]) {
    for (const vertical of [-1, 1]) {
      const edgeX = horizontal < 0 ? left : right;
      const edgeY = vertical < 0 ? top : bottom;
      context.moveTo(edgeX - horizontal * arm, edgeY);
      context.lineTo(edgeX, edgeY);
      context.lineTo(edgeX, edgeY - vertical * arm);
    }
  }
  context.strokeStyle = '#431d15';
  context.lineWidth = 8;
  context.stroke();
  context.strokeStyle = '#ffb755';
  context.lineWidth = 4.5;
  context.stroke();
}

function drawZoneGuide(context, zone, visibleSpots) {
  if (!visibleSpots.length) return;
  if (zone === 'cara') {
    const radiusX = Math.max(28, visibleSpots[1]?.radiusX ?? 0);
    const radiusY = Math.max(20, visibleSpots[3]?.radiusY ?? 0);
    drawGuide(
      context,
      Math.min(...visibleSpots.map((spot) => spot.x)) - radiusX * 1.35,
      Math.min(...visibleSpots.map((spot) => spot.y)) - radiusY * 0.55,
      Math.max(...visibleSpots.map((spot) => spot.x)) + radiusX * 1.35,
      Math.max(...visibleSpots.map((spot) => spot.y)) + radiusY * 0.65,
    );
    return;
  }
  if (zone === 'pecho') {
    const spot = visibleSpots[0];
    const halfWidth = Math.max(80, spot.radiusX * 1.9);
    const halfHeight = Math.max(30, spot.radiusY * 0.85);
    drawGuide(
      context,
      spot.x - halfWidth,
      spot.y - halfHeight,
      spot.x + halfWidth,
      spot.y + halfHeight,
    );
    return;
  }
  for (const spot of visibleSpots)
    drawGuide(context, spot.x - 22, spot.y - 22, spot.x + 22, spot.y + 22);
}

export function projectSpot([x, y], frame, viewport) {
  const imageHeight = viewport.imageHeight ?? viewport.height;
  const scale = Math.max(
    viewport.width / frame.videoWidth,
    imageHeight / frame.videoHeight,
  );
  const left = (viewport.width - frame.videoWidth * scale) / 2;
  const top = (imageHeight - frame.videoHeight * scale) / 2;
  return {
    x: viewport.width - (left + (frame.cropLeft + x * frame.cropWidth) * scale),
    y: top + (frame.cropTop + y * frame.cropHeight) * scale,
  };
}

export function drawTrackingOverlay(canvas, landmarks, frame) {
  const width = Math.round(canvas.clientWidth);
  const height = Math.round(canvas.clientHeight);
  if (!width || !height) return [];
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  if (landmarks.length < 33) return [];

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const detected = [];
  const imageHeight = (width * 16) / 9;
  const scale = Math.max(
    width / frame.videoWidth,
    imageHeight / frame.videoHeight,
  );
  const bodySpots = trackedSpots(
    landmarks,
    { width: frame.cropWidth, height: frame.cropHeight },
    'cuerpo',
  );
  for (const zone of zones) {
    const spots = bodySpots
      .filter((spot) => spot[6] === zone)
      .map((spot) => ({
        ...projectSpot(spot, frame, { width, height, imageHeight }),
        radiusX: spot[2] * frame.cropWidth * scale,
        radiusY: spot[3] * frame.cropHeight * scale,
      }));
    const visibleSpots = spots.filter(
      (spot) =>
        spot.x >= 0 && spot.x <= width && spot.y >= 0 && spot.y <= height,
    );
    if (visibleSpots.length) detected.push(zone);
    drawZoneGuide(context, zone, visibleSpots);
  }
  context.restore();
  return detected;
}
