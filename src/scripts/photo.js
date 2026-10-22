import { state } from '../lib/experience-state.js';
import { renderThermal } from '../lib/vision/thermal.js';
import { warmAsset } from '../lib/assets.js';
import QRCode from 'qrcode';
const photoDisclaimer =
  'Campaña educativa de orientación general. No sustituye la consulta médica ni sirve para tratar condiciones de salud. Ante síntomas o dudas, consulte a su médico.';
export function showDownload() {
  if (state.resultIndex === 0)
    document
      .querySelector('#app')
      .querySelector('#download-preview')
      .setAttribute('aria-label', 'Tu fotografía');
  const qrReady = QRCode.toCanvas(
    document.querySelector('#photo-qr'),
    window.location.href,
    {
      width: 256,
      margin: 0,
      color: { dark: '#431d15', light: '#ffb755' },
      errorCorrectionLevel: 'M',
    },
  ).catch(console.error);
  const photoReady =
    state.photo &&
    renderThermal(
      state.photo,
      state.zones,
      document.querySelector('#download-preview'),
      undefined,
      state.resultIndex,
    ).catch(console.error);
  return Promise.all([qrReady, photoReady]);
}
let downloadBusy = false;
export async function downloadPhoto() {
  if (downloadBusy || !state.photo) return;
  downloadBusy = true;
  try {
    await document.fonts.ready;
    const filteredPhoto = document.createElement('canvas');
    await renderThermal(
      state.photo,
      state.zones,
      filteredPhoto,
      { width: 936, height: 1590 },
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
    ctx.fillRect(72, 168, 936, 1590);
    ctx.drawImage(filteredPhoto, 72, 168, 936, 1590);
    const legalShade = ctx.createLinearGradient(0, 1460, 0, 1758);
    legalShade.addColorStop(0, '#0000');
    legalShade.addColorStop(1, '#000d');
    ctx.fillStyle = legalShade;
    ctx.fillRect(72, 1460, 936, 298);
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
    lines.forEach((text, index) => ctx.fillText(text, 540, 1660 + index * 25));
    ctx.font = '400 46px Anton';
    ctx.fillText('#TomaElControlDeTuMenopausia', 540, 1840);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) throw new Error('No se pudo generar la imagen');
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'Astellas-TomaElControl.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error(error);
    const status = document.querySelector('.download-status');
    if (status)
      status.textContent = 'No se pudo descargar la foto. Intenta de nuevo.';
  } finally {
    downloadBusy = false;
  }
}
