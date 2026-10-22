import { state } from '../lib/experience-state.js';
import { renderThermal } from '../lib/vision/thermal.js';
import { warmAsset } from '../lib/assets.js';
import QRCode from 'qrcode';
const photoDisclaimer =
  'Campaña educativa de orientación general. No sustituye la consulta médica ni sirve para tratar condiciones de salud. Ante síntomas o dudas, consulte a su médico.';
// El marco se aplica solo al archivo exportado; la vista previa ocupa toda la pantalla.
const exportFrame = { x: 58, y: 158, width: 964, height: 1648 };
export function showDownload() {
  if (state.resultIndex === 0)
    document
      .querySelector('#app')
      .querySelector('#download-preview')
      .setAttribute('aria-label', 'Tu fotografía');
  const qr = document.querySelector('#photo-qr');
  qr.hidden = true;
  document.querySelector('.download-label').innerHTML =
    'PREPARANDO TU<br />FOTO';
  setStatus('Preparando y subiendo tu foto...');
  const photoReady =
    state.photo &&
    renderThermal(
      state.photo,
      state.zones,
      document.querySelector('#download-preview'),
      undefined,
      state.resultIndex,
    );
  photoReady
    .then(() => uploadPhoto())
    .catch((error) => {
      console.error(error);
      const label = document.querySelector('.download-label');
      if (label) label.innerHTML = 'DESCARGA TU<br />FOTO';
      setStatus(
        'No se pudo subir la foto. Puedes descargarla aquí o reintentar.',
      );
      document
        .querySelector('[data-action="retry-upload"]')
        ?.removeAttribute('hidden');
    });
  return photoReady.catch(() => {});
}
let preparedPhoto;
let preparedKey;
let uploadedUrl;
let uploadBusy;
let uploadBusyKey;

function setStatus(message) {
  const status = document.querySelector('.download-status');
  if (status) status.textContent = message;
}

function preparePhoto() {
  const key = `${state.sessionId}|${state.photo}|${[...state.zones].join(',')}|${state.resultIndex}`;
  if (preparedPhoto && preparedKey === key) return preparedPhoto;
  preparedKey = key;
  uploadedUrl = null;
  preparedPhoto = (async () => {
    await document.fonts.ready;
    const filteredPhoto = document.createElement('canvas');
    await renderThermal(
      state.photo,
      state.zones,
      filteredPhoto,
      { width: exportFrame.width, height: exportFrame.height },
      state.resultIndex,
    );
    const brand = await warmAsset('logo');
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ee1c3d';
    ctx.fillRect(0, 0, 1080, 1920);
    const logoHeight = (300 * brand.height) / brand.width;
    ctx.drawImage(brand, 390, (160 - logoHeight) / 2, 300, logoHeight);
    ctx.fillStyle = '#000';
    ctx.fillRect(
      exportFrame.x,
      exportFrame.y,
      exportFrame.width,
      exportFrame.height,
    );
    ctx.drawImage(
      filteredPhoto,
      exportFrame.x,
      exportFrame.y,
      exportFrame.width,
      exportFrame.height,
    );
    const shadeTop = 1470;
    const photoBottom = exportFrame.y + exportFrame.height;
    const legalShade = ctx.createLinearGradient(0, shadeTop, 0, photoBottom);
    legalShade.addColorStop(0, '#0000');
    legalShade.addColorStop(1, '#000d');
    ctx.fillStyle = legalShade;
    ctx.fillRect(
      exportFrame.x,
      shadeTop,
      exportFrame.width,
      photoBottom - shadeTop,
    );
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '400 21px "Myriad Variable Concept"';
    const lines = [];
    let line = '';
    for (const word of photoDisclaimer.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width > 700 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    lines.forEach((text, index) => ctx.fillText(text, 540, 1702 + index * 31));
    ctx.font = '400 46px Anton';
    ctx.fillText('#TomaElControlDeTuMenopausia', 540, 1884);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.94),
    );
    if (!blob || blob.type !== 'image/webp')
      throw new Error('No se pudo optimizar la imagen');
    return blob;
  })().catch((error) => {
    preparedPhoto = null;
    throw error;
  });
  return preparedPhoto;
}

async function uploadPhoto() {
  const photoPromise = preparePhoto();
  const key = preparedKey;
  const blob = await photoPromise;
  if (key !== preparedKey) return;
  if (uploadedUrl) return showQr(uploadedUrl);
  if (uploadBusy && uploadBusyKey === key) return uploadBusy;
  uploadBusyKey = key;
  uploadBusy = (async () => {
    const response = await fetch('/api/fotos/', {
      method: 'POST',
      headers: { 'Content-Type': 'image/webp' },
      body: blob,
    });
    if (!response.ok)
      throw new Error(`Error al subir la foto: ${response.status}`);
    const { url } = await response.json();
    if (key !== preparedKey) return;
    uploadedUrl = new URL(url, window.location.origin).href;
    await showQr(uploadedUrl);
  })().finally(() => {
    if (uploadBusyKey === key) uploadBusy = null;
  });
  return uploadBusy;
}

async function showQr(url) {
  const qr = document.querySelector('#photo-qr');
  if (!qr) return;
  await QRCode.toCanvas(qr, url, {
    width: 256,
    margin: 0,
    color: { dark: '#431d15', light: '#ffb755' },
    errorCorrectionLevel: 'M',
  });
  qr.hidden = false;
  qr.setAttribute(
    'aria-label',
    'QR para abrir y descargar tu fotografía desde otro dispositivo',
  );
  document.querySelector('.download-label').innerHTML =
    'ESCANEA ESTE QR Y<br />DESCARGA TU FOTO';
  document
    .querySelector('[data-action="retry-upload"]')
    ?.setAttribute('hidden', '');
  setStatus('Tu foto está lista. El QR estará disponible durante 2 días.');
}

export async function retryPhotoUpload() {
  setStatus('Subiendo tu foto...');
  return uploadPhoto().catch((error) => {
    console.error(error);
    setStatus('No se pudo subir la foto. Intenta de nuevo.');
  });
}

let downloadBusy = false;
export async function downloadPhoto() {
  if (downloadBusy || !state.photo) return;
  downloadBusy = true;
  try {
    const blob = await preparePhoto();
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'Astellas-TomaElControl.webp';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error(error);
    setStatus('No se pudo descargar la foto. Intenta de nuevo.');
  } finally {
    downloadBusy = false;
  }
}
