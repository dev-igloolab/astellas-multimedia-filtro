import { MAX_PHOTO_BYTES, savePhoto } from '../../../lib/photo-store.mjs';

export const prerender = false;

export async function POST({ request }) {
  const length = Number(request.headers.get('content-length'));
  if (
    request.headers.get('content-type') !== 'image/webp' ||
    (length && length > MAX_PHOTO_BYTES)
  ) {
    return new Response('Formato o tamaño no admitido', { status: 413 });
  }
  if (!request.body) return new Response('Falta la imagen', { status: 400 });
  const chunks = [];
  let size = 0;
  for await (const chunk of request.body) {
    size += chunk.length;
    if (size > MAX_PHOTO_BYTES)
      return new Response('Imagen demasiado grande', { status: 413 });
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  try {
    const id = await savePhoto(bytes);
    return Response.json(
      { url: `/foto/${id}/` },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error.message === 'INVALID_PHOTO')
      return new Response('Imagen no válida', { status: 400 });
    console.error('No se pudo guardar la foto.', error);
    return new Response('No se pudo guardar la foto', { status: 500 });
  }
}
