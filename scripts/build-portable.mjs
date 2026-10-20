import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { Script } from 'node:vm';
import { staticAssets, visionAssets } from '../src/asset-manifest.js';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const output = resolve(root, 'portable', 'index.html');
const mime = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.js': 'text/javascript', '.wasm': 'application/wasm', '.task': 'application/octet-stream',
};

function fileFor(url) {
  const parsed = new URL(url, 'https://portable.invalid/');
  if (parsed.origin !== 'https://portable.invalid') return null;
  const file = resolve(dist, decodeURIComponent(parsed.pathname).replace(/^\/+/, ''));
  if (file !== dist && !file.startsWith(`${dist}${sep}`)) {
    throw new Error(`Recurso fuera de dist: ${url}`);
  }
  return file;
}

async function dataUrl(url) {
  const file = fileFor(url);
  if (!file) return url;
  const type = mime[extname(file).toLowerCase()];
  if (!type) throw new Error(`Recurso no soportado en el export portable: ${url}. Usa WebP para imágenes, SVG para gráficos o WOFF/WOFF2 para fuentes.`);
  return `data:${type};base64,${(await readFile(file)).toString('base64')}`;
}

async function embedCss(css) {
  const references = [...css.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g)];
  for (const match of references) {
    if (match[2].startsWith('data:') || match[2].startsWith('#')) continue;
    css = css.replace(match[0], `url("${await dataUrl(match[2])}")`);
  }
  return css;
}

let html = await readFile(resolve(dist, 'index.html'), 'utf8');
const appStyles = [];
for (const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]) {
  const href = match[0].match(/href="([^"]+)"/)?.[1];
  if (!href) throw new Error('Hoja de estilos sin href.');
  const file = fileFor(href);
  if (!file) throw new Error(`La hoja de estilos debe ser local: ${href}`);
  appStyles.push(`<style>${await embedCss(await readFile(file, 'utf8'))}</style>`);
  html = html.replace(match[0], '');
}
// El cargador crítico aparece antes de las fuentes y fondos incrustados.
const styleAnchor = '<template id="app-styles-anchor"></template>';
if (!html.includes(styleAnchor)) throw new Error('Falta el punto de inserción de estilos después del cargador.');
html = html.replace(styleAnchor, () => appStyles.join(''));

// Los recursos usados por JavaScript también deben quedar dentro del archivo portable.
const embedAssets = async assets => Object.fromEntries(await Promise.all(
  Object.entries(assets).map(async ([name, path]) => [name, await dataUrl(path)])
));
const assetData = await embedAssets(staticAssets);
const visionData = await embedAssets(visionAssets);
for (const match of [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]) {
  const file = fileFor(match[1]);
  if (!file) throw new Error(`Script externo no compatible: ${match[1]}`);
  const script = (await readFile(file, 'utf8'))
    .replaceAll('import.meta.resolve', 'undefined')
    .replaceAll('import.meta.url', 'location.href');
  // A callback preserves literal $ patterns inside bundled code (e.g. QR regexes).
  new Script(script);
  const payload = JSON.stringify({ images: assetData, vision: visionData }).replaceAll('<', '\\u003c');
  // JSON inerte: el navegador puede pintar el cargador antes de preparar el bloque pesado.
  const start = `requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      const resources = document.getElementById('portable-resources');
      const payload = JSON.parse(resources.textContent);
      window.ASTELLAS_ASSETS = payload.images;
      window.ASTELLAS_VISION_ASSETS = payload.vision;
      resources.remove();
      ${script}
    } catch (error) {
      console.error('No se pudo iniciar la experiencia portable.', error);
      window.ASTELLAS_BOOT?.fail();
    }
  }));`;
  new Script(start);
  html = html.replace(match[0], () => `<script type="application/json" id="portable-resources">${payload}</script><script>${start.replace(/<\/script/gi, '<\\/script')}</script>`);
}
if (/<script\b[^>]*\bsrc=/.test(html)) throw new Error('Quedó un script externo en el export portable.');

for (const match of [...html.matchAll(/\b(src|href|poster)="([^"]+)"/g)]) {
  if (match[2].startsWith('#') || match[2].startsWith('data:') || match[2].includes('${')) continue;
  const file = fileFor(match[2]);
  if (!file) continue;
  html = html.replace(match[0], `${match[1]}="${await dataUrl(match[2])}"`);
}

for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/type="application\/json"/.test(match[1])) JSON.parse(match[2]);
  else new Script(match[2]);
}
const loaderPosition = html.indexOf('id="boot-screen"');
const payloadPosition = html.indexOf('id="portable-resources"');
if (loaderPosition < 0 || loaderPosition > 32768 || payloadPosition < loaderPosition) {
  throw new Error('El cargador debe estar en los primeros 32 KB, antes de los recursos del portable.');
}
await mkdir(resolve(root, 'portable'), { recursive: true });
await writeFile(output, html);
console.log(`portable/index.html listo (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
