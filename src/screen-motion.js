const reducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;
const milliseconds = (value) =>
  parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000) || 0;

// Conservar los píxeles de cámara, QR y filtro al retirar la pantalla anterior.
function snapshot(app) {
  const copy = app.cloneNode(true);
  const originals = app.querySelectorAll('canvas, video');
  const copies = copy.querySelectorAll('canvas, video');
  originals.forEach((source, index) => {
    const frame = document.createElement('canvas');
    frame.width = source.videoWidth || source.width || 1;
    frame.height = source.videoHeight || source.height || 1;
    const style = getComputedStyle(source);
    for (const property of style)
      frame.style.setProperty(property, style.getPropertyValue(property));
    frame.className = source.className;
    try {
      frame.getContext('2d').drawImage(source, 0, 0);
    } catch {
      /* Cámara aún sin primer fotograma. */
    }
    copies[index].replaceWith(frame);
  });
  copy.removeAttribute('id');
  copy.removeAttribute('aria-busy');
  copy
    .querySelectorAll('[id]')
    .forEach((element) => element.removeAttribute('id'));
  const layer = document.createElement('div');
  layer.className = 't-page motion-snapshot';
  layer.dataset.pageId = '1';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  layer.append(copy);
  return layer;
}

export function revealScreen(app) {
  if (reducedMotion()) return;
  const selectors = [
    '.screen > .logo, .header, .camera-heading',
    '.intro-center, .center > h1, .center > h2, .center > .large-icon, .center > .check, .result > h1, .map > h1',
    '.center > p, .center > .avatar, .center > .dark-card, .result-intro, .camera-info, .final-photo',
    '.instructions li, .choice, .zone, .result-card',
    '.intro-footer, .screen > .cta, .map-copy, .download-bottom',
  ];
  selectors.forEach((selector, group) => {
    app.querySelectorAll(selector).forEach((element, index) => {
      // Las transformaciones del diseño (scaleX, centrado, etc.) se conservan.
      element.style.setProperty(
        '--reveal-delay',
        `${Math.min(160, group * 30 + (group === 3 ? index * 30 : 0))}ms`,
      );
      element.classList.add('motion-reveal');
      element.addEventListener(
        'animationend',
        () => {
          element.classList.remove('motion-reveal');
          element.style.removeProperty('--reveal-delay');
        },
        { once: true },
      );
    });
  });
}

export function animateCount(element, value) {
  if (!element) return;
  element.textContent = String(value);
  element.getAnimations().forEach((animation) => animation.cancel());
  if (!reducedMotion()) {
    const style = getComputedStyle(element);
    element.animate(
      [
        { opacity: 0.35, translate: '0 6px', scale: '.94' },
        { opacity: 1, translate: '0 0', scale: '1' },
      ],
      {
        duration: milliseconds(style.getPropertyValue('--motion-count')),
        easing: style.getPropertyValue('--motion-ease').trim(),
      },
    );
  }
}

export function createScreenMotion(app) {
  const livePage = app.parentElement;
  const viewport = livePage.parentElement;
  let busy = false;
  let keyboard = false;
  document.addEventListener(
    'click',
    (event) => {
      keyboard = event.detail === 0;
    },
    true,
  );

  return {
    get busy() {
      return busy;
    },
    async run(update, { reveal = true, focus = true } = {}) {
      if (busy) return false;
      busy = true;
      app.setAttribute('aria-busy', 'true');
      let previous;
      const animate = !keyboard && !reducedMotion() && !document.hidden;
      try {
        if (animate) {
          previous = snapshot(app);
          viewport.prepend(previous);
          viewport.classList.add('is-preparing');
          viewport.dataset.page = '1';
          // Establecer el estado inicial antes de cambiar el contenido.
          void viewport.offsetHeight;
        }
        await update();
        if (animate && reveal) revealScreen(app);
        if (animate) {
          void viewport.offsetHeight;
          viewport.classList.remove('is-preparing');
          viewport.dataset.page = '2';
          const duration = milliseconds(
            getComputedStyle(viewport).getPropertyValue('--page-fade-dur'),
          );
          await new Promise((resolve) => {
            const finish = (event) => {
              if (
                event &&
                (event.target !== previous || event.propertyName !== 'opacity')
              )
                return;
              clearTimeout(timer);
              previous.removeEventListener('transitionend', finish);
              resolve();
            };
            const timer = setTimeout(() => finish(), duration + 80);
            previous.addEventListener('transitionend', finish);
          });
        }
        if (focus) {
          const title = app.querySelector('h1');
          if (title) {
            title.tabIndex = -1;
            title.focus({ preventScroll: true });
          }
        }
        return true;
      } finally {
        previous?.remove();
        viewport.classList.remove('is-preparing');
        viewport.dataset.page = '2';
        app.removeAttribute('aria-busy');
        busy = false;
      }
    },
  };
}
