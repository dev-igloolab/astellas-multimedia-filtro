import { state } from '../lib/experience-state.js';
import { sound } from '../lib/ui/feedback.js';
import {
  analyzePhoto,
  clearPhotoAnalysis,
  startLiveTracking,
} from '../lib/vision/pose.js';
import { drawTrackingOverlay } from '../lib/vision/tracking-overlay.js';
import { visibleCaptureFrame } from '../lib/vision/capture-frame.js';
import { animateCount } from '../lib/ui/screen-motion.js';
let app;
let stopTracking = () => {};
let cameraSession = 0;
let captureTimer = null;
function cancelCaptureCountdown() {
  if (captureTimer !== null) clearInterval(captureTimer);
  captureTimer = null;
}
function resetCaptureCountdown() {
  cancelCaptureCountdown();
  const button = document.querySelector('.camera .shutter');
  if (button) {
    button.disabled = false;
    button.classList.remove('is-counting');
    button.querySelector('span').textContent = 'TOMAR';
  }
}
function stopCamera() {
  cancelCaptureCountdown();
  cameraSession++;
  stopTracking();
  stopTracking = () => {};
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError('La cámara no está disponible en este navegador.');
    return;
  }
  const session = ++cameraSession;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 } },
      audio: false,
    });
    if (state.page !== 'camera' || state.photo || session !== cameraSession) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    state.stream = stream;
    const video = document.querySelector('#video');
    video.addEventListener('loadeddata', () => video.classList.add('is-live'), {
      once: true,
    });
    video.srcObject = stream;
    document.querySelector('#thumbnail-video').srcObject = stream;
    const overlay = document.querySelector('#tracking-overlay');
    const status = document.querySelector('#tracking-status');
    const indicators = [...app.querySelectorAll('[data-detection-zone]')];
    stopTracking = startLiveTracking(
      video,
      (landmarks, frame) => {
        if (session !== cameraSession || !overlay?.isConnected) return;
        const detected = drawTrackingOverlay(overlay, landmarks, frame);
        const message = detected.length
          ? 'ZONAS DETECTADAS'
          : 'UBÍCATE FRENTE A LA CÁMARA';
        if (status.textContent !== message) status.textContent = message;
        const hasDetection = String(detected.length > 0);
        if (status.dataset.active !== hasDetection)
          status.dataset.active = hasDetection;
        const activeZones = new Set(detected);
        for (const item of indicators) {
          const active = activeZones.has(item.dataset.detectionZone);
          if (item.dataset.detected === String(active)) continue;
          item.dataset.detected = String(active);
          item.setAttribute(
            'aria-label',
            `${item.textContent.trim()}: ${active ? 'detectada' : 'sin detectar'}`,
          );
        }
      },
      (error) => {
        console.error('No se pudo mostrar el seguimiento en vivo.', error);
        cameraError(
          'No se pudo mostrar el seguimiento en vivo. Puedes repetir la foto.',
        );
      },
    );
  } catch {
    if (session === cameraSession)
      cameraError(
        'Activa el permiso de cámara y pulsa repetir para continuar.',
      );
  }
}
function cameraError(text) {
  const el = document.querySelector('#camera-error');
  if (el) el.textContent = text;
}
function startCaptureCountdown() {
  if (state.page !== 'camera' || state.photo || captureTimer !== null) return;
  const video = document.querySelector('#video');
  if (!video?.videoWidth || !state.stream?.active) {
    cameraError('Espera a que la cámara esté lista.');
    return;
  }
  const button = document.querySelector('.shutter');
  const label = button?.querySelector('span');
  if (!button || !label) return;
  const session = cameraSession;
  const deadline = performance.now() + 5000;
  let remaining = 5;
  button.disabled = true;
  button.classList.add('is-counting');
  animateCount(label, remaining);
  sound.play('tick', { gesture: true });
  captureTimer = setInterval(() => {
    if (state.page !== 'camera' || state.photo || session !== cameraSession) {
      cancelCaptureCountdown();
      return;
    }
    if (!state.stream?.active || !video.isConnected || !video.videoWidth) {
      resetCaptureCountdown();
      cameraError(
        'La cámara se desconectó. Pulsa repetir para intentar de nuevo.',
      );
      return;
    }
    const next = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    if (next === remaining) return;
    remaining = next;
    if (next > 0) {
      animateCount(label, next);
      sound.play('tick', { final: next === 1 });
      return;
    }
    cancelCaptureCountdown();
    capture();
  }, 100);
}

function faceThumbnail(source, landmarks) {
  const width = source.width;
  const height = source.height;
  const nose = landmarks?.[0];
  const leftEar = landmarks?.[7];
  const rightEar = landmarks?.[8];
  const faceWidth =
    leftEar && rightEar ? Math.abs(leftEar.x - rightEar.x) * width : 0;
  const side = Math.min(width, Math.max(width * 0.68, faceWidth * 2.3));
  const centerX = (nose?.x ?? 0.5) * width;
  const centerY = (nose?.y ?? 0.18) * height;
  const x = Math.max(0, Math.min(width - side, centerX - side / 2));
  const y = Math.max(0, Math.min(height - side, centerY - side / 2));
  const thumbnail = document.createElement('canvas');
  thumbnail.width = thumbnail.height = 320;
  thumbnail
    .getContext('2d')
    .drawImage(source, x, y, side, side, 0, 0, 320, 320);
  return thumbnail.toDataURL('image/webp', 0.88);
}
async function capture() {
  const video = document.querySelector('#video');
  if (!video?.videoWidth) {
    cameraError('Espera a que la cámara esté lista.');
    return;
  }
  const frame = visibleCaptureFrame(
    video.videoWidth,
    video.videoHeight,
    video.clientWidth,
    video.clientHeight,
    video.parentElement.clientHeight,
  );
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = Math.round((900 * frame.height) / frame.width);
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(
    video,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const photo = canvas.toDataURL('image/webp', 0.9);
  sound.play('shutter');
  state.photo = photo;
  state.thumbnail = faceThumbnail(canvas);
  state.photoReady = false;
  state.analyzing = true;
  state.trackingError = '';
  stopCamera();
  updateCamera();
  if (state.photo !== photo || state.page !== 'camera') return;
  try {
    const { image, landmarks } = await analyzePhoto(photo);
    if (state.photo === photo) {
      state.thumbnail = faceThumbnail(image, landmarks);
      state.photoReady = true;
    }
  } catch (error) {
    if (state.photo === photo)
      state.trackingError =
        error.message || 'No pudimos analizar la foto. Repítela con buena luz.';
  } finally {
    if (state.photo === photo) {
      state.analyzing = false;
      const thumbnail = app.querySelector('.thumbnail img');
      if (thumbnail) thumbnail.src = state.thumbnail;
      const nextButton = app.querySelector('.camera-info .cta');
      if (nextButton) {
        nextButton.disabled = !state.photoReady;
        nextButton.textContent = 'SIGUIENTE';
      }
      cameraError(state.trackingError);
    }
  }
}
export function clearPhoto() {
  state.photo = '';
  state.thumbnail = '';
  state.photoReady = false;
  state.analyzing = false;
  state.trackingError = '';
  clearPhotoAnalysis();
}
function retakePhoto() {
  stopCamera();
  clearPhoto();
  updateCamera();
  startCamera();
}

function updateCamera() {
  const feed = app.querySelector('.camera-feed');
  feed.querySelector('img')?.remove();
  const thumbnail = app.querySelector('.thumbnail');
  thumbnail.querySelector('img')?.remove();
  for (const element of app.querySelectorAll(
    '.tracking-overlay, .tracking-status, .detection-rail, #video, #thumbnail-video',
  ))
    element.hidden = !!state.photo;
  if (state.photo) {
    const image = new Image();
    image.src = state.photo;
    image.alt = 'Foto capturada';
    feed.append(image);
    const thumb = new Image();
    thumb.src = state.thumbnail || state.photo;
    thumb.alt = 'Miniatura de la foto';
    thumbnail.append(thumb);
  }
  const next = app.querySelector('.camera-info .cta');
  next.textContent = state.analyzing ? 'ANALIZANDO...' : 'SIGUIENTE';
  next.disabled = !state.photoReady;
  cameraError(
    state.trackingError ||
      (state.analyzing ? 'Ubicando tu cuerpo en la foto...' : ''),
  );
  resetCaptureCountdown();
}
export function mountCamera(element) {
  app = element;
  updateCamera();
  if (!state.photo) startCamera();
  const visibility = () => {
    if (document.hidden && captureTimer !== null) resetCaptureCountdown();
  };
  document.addEventListener('visibilitychange', visibility);
  return () => {
    stopCamera();
    document.removeEventListener('visibilitychange', visibility);
  };
}
export function takePhoto() {
  if (state.photo) retakePhoto();
  else startCaptureCountdown();
}
export { retakePhoto };
