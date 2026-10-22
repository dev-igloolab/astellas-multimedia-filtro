import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { Script } from 'node:vm';
import { build } from 'esbuild';
import { staticAssets, visionAssets } from '../src/data/asset-manifest.js';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const output = resolve(root, 'portable', 'index.html');
const mime = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
};

function fileFor(url) {
  const parsed = new URL(url, 'https://portable.invalid/');
  if (parsed.origin !== 'https://portable.invalid') return null;
  const file = resolve(
    dist,
    decodeURIComponent(parsed.pathname).replace(/^\/+/, ''),
  );
  if (file !== dist && !file.startsWith(`${dist}${sep}`)) {
    throw new Error(`Recurso fuera de dist: ${url}`);
  }
  return file;
}

async function dataUrl(url) {
  const file = fileFor(url);
  if (!file) return url;
  const type = mime[extname(file).toLowerCase()];
  if (!type)
    throw new Error(
      `Recurso no soportado en el export portable: ${url}. Usa WebP para imágenes, SVG para gráficos o WOFF/WOFF2 para fuentes.`,
    );
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

// Astro remains the source of every page. Only the export replaces its web router.
async function collectPages(directory = dist) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectPages(path)));
    else if (entry.name === 'index.html') files.push(path);
  }
  return files;
}
const pages = {};
const styles = new Set();
const assetPaths = new Set([
  ...Object.values(staticAssets),
  ...Object.values(visionAssets),
]);
let initialBody = '';
for (const file of await collectPages()) {
  const html = await readFile(file, 'utf8');
  const route =
    '/' +
    file
      .slice(dist.length + 1)
      .replaceAll('\\', '/')
      .replace(/index\.html$/, '');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1];
  if (!body) throw new Error('Falta body: ' + file);
  const clean = body.replace(
    /<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g,
    '',
  );
  pages[route] = {
    title: html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || 'Astellas',
    body: clean,
  };
  if (route === '/') initialBody = clean.slice(0, clean.indexOf('<main'));
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/)?.[1] || '';
  for (const match of head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
    styles.add(match[1]);
  for (const match of head.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)) {
    const href = match[0].match(/href="([^"]+)"/)?.[1];
    if (!href || !fileFor(href)) throw new Error('CSS no local: ' + href);
    styles.add(await readFile(fileFor(href), 'utf8'));
  }
  for (const match of clean.matchAll(/(?:src|poster)="(\/[^"#]+)"/g))
    assetPaths.add(match[1]);
}
if (!pages['/'] || !pages['/admin/'])
  throw new Error('Faltan páginas de Astro en dist.');
const resources = Object.fromEntries(
  await Promise.all(
    [...assetPaths].map(async (path) => [path, await dataUrl(path)]),
  ),
);
const payload = JSON.stringify({
  pages,
  resources,
  images: staticAssets,
  vision: visionAssets,
}).replaceAll('<', '\\u003c');
const css = (await Promise.all([...styles].map(embedCss))).join('\n');
const bundled = await build({
  stdin: {
    contents: `import './src/scripts/experience.js'; import './src/scripts/admin-page.js'; import { startPortable } from './scripts/portable-router.js'; startPortable();`,
    resolveDir: root,
    sourcefile: 'portable-entry.js',
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
  minify: true,
  define: {
    'import.meta.resolve': 'undefined',
    'import.meta.url': 'location.href',
  },
  plugins: [
    {
      name: 'portable-navigation',
      setup(builder) {
        builder.onResolve({ filter: /^astro:transitions\/client$/ }, () => ({
          path: resolve(root, 'scripts/portable-router.js'),
        }));
      },
    },
  ],
});
const script = bundled.outputFiles[0].text;
new Script(script);
// A small loader is painted before parsing the larger resource payload.
initialBody = initialBody.replace(
  /src="\/assets\/logos\/astellas-blanco.webp"/g,
  () => 'src="' + resources[staticAssets.logo] + '"',
);
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Astellas · Multimedia portable</title></head><body>${initialBody}<style>${css}</style><script id="portable-resources" type="application/json">${payload}</script><script>requestAnimationFrame(()=>requestAnimationFrame(()=>{${script.replace(/<\/script/gi, '<\\/script')} }));</script></body></html>`;
if (
  html.indexOf('id="boot-screen"') < 0 ||
  html.indexOf('id="boot-screen"') > 32768
)
  throw new Error('El cargador debe aparecer en los primeros 32 KB.');
await mkdir(resolve(root, 'portable'), { recursive: true });
await writeFile(output, html);
console.log(
  `portable/index.html listo: ${Object.keys(pages).length} páginas, ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`,
);
