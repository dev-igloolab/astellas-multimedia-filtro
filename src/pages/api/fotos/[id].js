import { readPhoto } from '../../../lib/photo-store.mjs';

export const prerender = false;

export async function GET({ params }) {
  const photo = await readPhoto(params.id);
  if (!photo)
    return new Response('Foto no disponible', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  return new Response(photo.bytes, {
    headers: {
      'Content-Type': photo.contentType,
      'Content-Disposition': `inline; filename="Astellas-TomaElControl.${photo.extension}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
