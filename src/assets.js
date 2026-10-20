import { staticAssets } from './asset-manifest.js';

const imageCache = new Map();
export const assetUrl = (name) =>
  imageCache.get(name)?.url ||
  globalThis.ASTELLAS_ASSETS?.[name] ||
  staticAssets[name];
export function warmAsset(name) {
  if (imageCache.has(name)) return imageCache.get(name).ready;
  const entry = { url: '', image: null, ready: null };
  entry.ready = (async () => {
    const response = await fetch(
      globalThis.ASTELLAS_ASSETS?.[name] ?? staticAssets[name],
    );
    if (!response.ok) throw new Error(`No se pudo descargar ${name}`);
    entry.url = URL.createObjectURL(await response.blob());
    const image = new Image();
    image.decoding = 'async';
    image.src = entry.url;
    await image.decode();
    entry.image = image;
    return image;
  })().catch((error) => {
    if (entry.url) URL.revokeObjectURL(entry.url);
    imageCache.delete(name);
    throw error;
  });
  imageCache.set(name, entry);
  return entry.ready;
}

export const preloadImages = () => Object.keys(staticAssets).map(warmAsset);
