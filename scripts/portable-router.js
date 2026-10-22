// Adaptador exclusivo de la exportación. La web usa ClientRouter de Astro.
let pages;
let paths;
let current = '/';
let navigationId = 0;
let transition;
const normalize = (path) =>
  path === '/' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}/`;
const cleanUrl = () => location.href.split('#')[0];
const historyRoute = () => history.state?.astellasRoute || '/';

function hydrate(markup) {
  for (const [path, url] of Object.entries(paths))
    markup = markup.split(path).join(url);
  return markup;
}

function render(path) {
  const page = pages[path];
  if (!page) throw new Error(`Ruta no exportada: ${path}`);
  document.dispatchEvent(new Event('astro:before-swap'));
  const template = document.createElement('template');
  template.innerHTML = hydrate(page.body);
  document.body.replaceChildren(template.content);
  document.title = page.title;
  // Astro emitted the loader's inline script. Rerun it only on its own page.
  for (const inert of document.body.querySelectorAll('script')) {
    if (inert.src || inert.type === 'module') {
      inert.remove();
      continue;
    }
    const script = document.createElement('script');
    script.textContent = inert.textContent;
    inert.replaceWith(script);
  }
  current = path;
}

export async function navigate(href, options = {}) {
  const path = normalize(href);
  if (!pages[path]) throw new Error(`Ruta no exportada: ${path}`);
  const entry = { ...history.state, astellasRoute: path };
  if (options.history === 'replace')
    history.replaceState(entry, '', cleanUrl());
  else if (current !== path) history.pushState(entry, '', cleanUrl());
  const id = ++navigationId;
  transition?.skipTransition();
  const update = () => {
    if (id === navigationId) render(path);
  };
  if (
    document.startViewTransition &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    transition = document.startViewTransition(update);
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
    await transition.updateCallbackDone;
  } else update();
  if (id === navigationId) document.dispatchEvent(new Event('astro:page-load'));
}

function blobUrl(data) {
  const [header, base64] = data.split(',');
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return URL.createObjectURL(
    new Blob([bytes], { type: header.slice(5).split(';')[0] }),
  );
}

export function startPortable() {
  try {
    const payload = JSON.parse(
      document.getElementById('portable-resources').textContent,
    );
    pages = payload.pages;
    paths = Object.fromEntries(
      Object.entries(payload.resources).map(([path, data]) => [
        path,
        blobUrl(data),
      ]),
    );
    window.ASTELLAS_ASSETS = Object.fromEntries(
      Object.entries(payload.images).map(([name, path]) => [name, paths[path]]),
    );
    window.ASTELLAS_VISION_ASSETS = Object.fromEntries(
      Object.entries(payload.vision).map(([name, path]) => [name, paths[path]]),
    );
    // Shared CSS survives body changes and is embedded exactly once.
    for (const style of document.body.querySelectorAll(':scope > style'))
      document.head.append(style);
    window.addEventListener('popstate', () =>
      navigate(pages[historyRoute()] ? historyRoute() : '/', {
        history: 'replace',
      }).catch(console.error),
    );
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (
        !link ||
        link.target ||
        link.hasAttribute('download') ||
        event.defaultPrevented ||
        event.button ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const href = link.getAttribute('href');
      if (!href.startsWith('/') || href.startsWith('//')) return;
      if (!pages[normalize(href)]) return;
      event.preventDefault();
      navigate(href).catch(console.error);
    });
    // Los enlaces antiguos siguen abriendo su destino, pero se limpia la URL.
    const legacy = normalize(decodeURIComponent(location.hash.slice(1) || '/'));
    const requested = location.hash ? legacy : historyRoute();
    const initial = pages[requested] ? requested : '/';
    history.replaceState(
      { ...history.state, astellasRoute: initial },
      '',
      cleanUrl(),
    );
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.altKey && event.code === 'KeyA') {
        event.preventDefault();
        navigate('/admin/').catch(console.error);
      }
    });
    render(initial);
    document.dispatchEvent(new Event('astro:page-load'));
  } catch (error) {
    console.error('No se pudo iniciar la experiencia portable.', error);
    window.ASTELLAS_BOOT?.fail();
  }
}
