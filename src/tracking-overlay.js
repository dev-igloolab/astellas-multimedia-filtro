import { trackedSpots } from './thermal.js';

const zones = ['cara', 'pecho', 'brazos'];
function drawMarker(context, x, y) {
  const reach = 22;
  const arm = 10;
  context.beginPath();
  for (const horizontal of [-1, 1]) {
    for (const vertical of [-1, 1]) {
      const edgeX = x + horizontal * reach;
      const edgeY = y + vertical * reach;
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

export function projectSpot([x, y], frame, viewport) {
  const imageHeight = viewport.imageHeight ?? viewport.height;
  const scale = Math.max(viewport.width / frame.videoWidth, imageHeight / frame.videoHeight);
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
  const imageHeight = width * 16 / 9;
  for (const zone of zones) {
    const spots = trackedSpots(landmarks, { width: frame.cropWidth, height: frame.cropHeight }, zone)
      .map(spot => projectSpot(spot, frame, { width, height, imageHeight }));
    if (spots.some(spot => spot.x >= 0 && spot.x <= width && spot.y >= 0 && spot.y <= height)) detected.push(zone);
    for (const spot of spots) {
      if (spot.x < 0 || spot.x > width || spot.y < 0 || spot.y > height) continue;
      drawMarker(context, spot.x, spot.y);
    }
  }
  context.restore();
  return detected;
}
