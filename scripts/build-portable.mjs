import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { Script } from 'node:vm';

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
for (const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]) {
  const href = match[0].match(/href="([^"]+)"/)?.[1];
  if (!href) throw new Error('Hoja de estilos sin href.');
  const file = fileFor(href);
  if (!file) throw new Error(`La hoja de estilos debe ser local: ${href}`);
  html = html.replace(match[0], `<style>${await embedCss(await readFile(file, 'utf8'))}</style>`);
}

// Los recursos usados por JavaScript también deben quedar dentro del archivo portable.
const iconNames = await readdir(resolve(dist, 'assets', 'iconos'));
const assetData = Object.fromEntries(await Promise.all(iconNames.filter(name => name.endsWith('.webp')).map(async name => [name.slice(0, -5), await dataUrl(`/assets/iconos/${name}`)])));
assetData.logo = await dataUrl('/assets/logos/astellas-blanco.webp');
assetData.logoColor = await dataUrl('/assets/logos/astellas-color.webp');
assetData.background = await dataUrl('/assets/fondos/inicio.webp');
assetData.qr = await dataUrl('/assets/qr/menopausia-figma.svg');
const visionData = Object.fromEntries(await Promise.all(Object.entries({
  model: '/models/pose_landmarker_lite.task',
  loader: '/mediapipe/vision_wasm_internal.js',
  wasm: '/mediapipe/vision_wasm_internal.wasm',
  loaderFallback: '/mediapipe/vision_wasm_nosimd_internal.js',
  wasmFallback: '/mediapipe/vision_wasm_nosimd_internal.wasm',
}).map(async ([name, path]) => [name, await dataUrl(path)])));
for (const match of [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]) {
  const file = fileFor(match[1]);
  if (!file) throw new Error(`Script externo no compatible: ${match[1]}`);
  const script = (await readFile(file, 'utf8'))
    .replaceAll('import.meta.resolve', 'undefined')
    .replaceAll('import.meta.url', 'location.href');
  // A callback preserves literal $ patterns inside bundled code (e.g. QR regexes).
  new Script(script);
  html = html.replace(match[0], () => `<script>window.ASTELLAS_ASSETS=${JSON.stringify(assetData)};window.ASTELLAS_VISION_ASSETS=${JSON.stringify(visionData)};</script><script>${script.replace(/<\/script/gi, '<\\/script')}</script>`);
}
if (/<script\b[^>]*\bsrc=/.test(html)) throw new Error('Quedó un script externo en el export portable.');

for (const match of [...html.matchAll(/\b(src|href|poster)="([^"]+)"/g)]) {
  if (match[2].startsWith('#') || match[2].startsWith('data:') || match[2].includes('${')) continue;
  const file = fileFor(match[2]);
  if (!file) continue;
  html = html.replace(match[0], `${match[1]}="${await dataUrl(match[2])}"`);
}

for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
  new Script(match[1]);
}
await mkdir(resolve(root, 'portable'), { recursive: true });
await writeFile(output, html);
console.log(`portable/index.html listo (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
