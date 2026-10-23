const policyUrl =
  'https://www.astellas.com/en/about/privacy-center/privacy-policy.es-co-general-privacy-notice';

export const prerender = false;

export async function GET() {
  try {
    const response = await fetch(policyUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Astellas respondió ${response.status}`);
    const html = (await response.text()).replace(
      /<head([^>]*)>/i,
      '<head$1><base href="https://www.astellas.com/">',
    );
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': 'sandbox allow-forms allow-scripts',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('No se pudo cargar la política de privacidad.', error);
    return new Response(
      '<!doctype html><html lang="es"><meta charset="utf-8"><body style="font:20px Arial;padding:24px">No se pudo cargar la política de privacidad. Intenta de nuevo.</body></html>',
      {
        status: 502,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': 'sandbox',
        },
      },
    );
  }
}
