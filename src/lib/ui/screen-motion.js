const reducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;
const milliseconds = (value) =>
  parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000) || 0;

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
