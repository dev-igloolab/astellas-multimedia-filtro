import { navigate } from 'astro:transitions/client';
import { assetUrl, preloadImages } from '../lib/assets.js';
import { prepareTracking } from '../lib/vision/pose.js';
import { renderThermal, validateTrackedZone } from '../lib/vision/thermal.js';
import { revealScreen, animateCount } from '../lib/ui/screen-motion.js';
import { sound } from '../lib/ui/feedback.js';
import { state } from '../lib/experience-state.js';
import {
  canEnter,
  nextPage,
  pageUrl,
  resultIndexFor,
} from '../lib/experience-flow.js';
import { createRecordStore } from '../lib/records.js';
import { resultVariants } from '../data/result-content.js';
import { mountCamera, takePhoto, retakePhoto, clearPhoto } from './camera.js';
import { showDownload, downloadPhoto, retryPhotoUpload } from './photo.js';

let dispose = () => {};
let preparation;

// La promesa y las cachés sobreviven a la navegación de Astro.
function prepareAssets() {
  if (preparation) return preparation;
  state.assetsLoading = true;
  state.assetsError = false;
  const boot = window.ASTELLAS_BOOT;
  const fonts = [
    '400 38px Anton',
    '400 38px "Myriad Variable Concept"',
    '700 38px "Myriad Variable Concept"',
  ];
  const tasks = [
    ...preloadImages(),
    ...fonts.map(async (font) => {
      const faces = await document.fonts.load(font, '¡¿ÁÉÍÓÚáéíóúñÑ');
      if (!faces.length)
        throw new Error(`No se pudo preparar la fuente: ${font}`);
    }),
    document.fonts.ready,
    prepareTracking(),
  ];
  let completed = 0;
  preparation = Promise.all(
    tasks.map((task) =>
      task.then(() => boot?.progress(++completed, tasks.length)),
    ),
  )
    .then(() => {
      state.assetsReady = true;
    })
    .catch((error) => {
      preparation = null;
      state.assetsReady = false;
      state.assetsError = true;
      throw error;
    })
    .finally(() => {
      state.assetsLoading = false;
    });
  return preparation;
}

function resetSession() {
  clearPhoto();
  Object.assign(state, {
    consent: false,
    age: '',
    frequency: '',
    resultIndex: 0,
    sessionId: '',
  });
  state.feelings.clear();
  state.zones.clear();
}

function saveResult() {
  try {
    if (!state.sessionId)
      state.sessionId =
        crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const store = createRecordStore(localStorage);
    const previous = store
      .list()
      .find((record) => record.id === state.sessionId);
    store.save({
      id: state.sessionId,
      completedAt: previous?.completedAt || new Date().toISOString(),
      age: state.age,
      frequency: state.frequency,
      feeling: [...state.feelings][0] || '',
      zone: [...state.zones][0] || '',
      result: resultVariants[state.resultIndex].kind,
    });
  } catch (error) {
    console.error('No se pudo guardar la partida localmente.', error);
    window.alert(
      'No se pudo guardar esta partida en el navegador. Revisa el almacenamiento del dispositivo.',
    );
  }
}

async function mountExperience() {
  dispose();
  const app = document.querySelector('#app[data-page]');
  if (!app) return;
  const page = app.dataset.page;
  if (!canEnter(page, state)) {
    await navigate('/', { history: 'replace' });
    return;
  }
  state.page = page;
  if (['result', 'map', 'download'].includes(page)) {
    state.resultIndex = resultIndexFor(state);
    if (
      page === 'result' &&
      Number(app.dataset.resultIndex) !== state.resultIndex
    ) {
      await navigate(pageUrl('result', state), { history: 'replace' });
      return;
    }
  }

  let active = true;
  let busy = false;
  let stopCamera = () => {};
  let timer;
  const controller = new AbortController();
  const viewport = app.closest('.viewport');
  const fit = () => {
    const { width, height } = viewport.getBoundingClientRect();
    document.documentElement.style.setProperty(
      '--stage-scale',
      String(Math.min(width / 1080, height / 1920)),
    );
  };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(viewport);
  dispose = () => {
    active = false;
    controller.abort();
    observer.disconnect();
    clearInterval(timer);
    stopCamera();
    dispose = () => {};
  };

  function hydrateAssets() {
    app.style.setProperty('--intro-image', `url("${assetUrl('background')}")`);
    for (const el of app.querySelectorAll('[data-asset-icon]'))
      el.style.setProperty(
        '--image',
        `url("${assetUrl(el.dataset.assetIcon)}")`,
      );
    for (const el of app.querySelectorAll('[data-asset-image]'))
      el.src = assetUrl(el.dataset.assetImage);
  }
  function updateChoices() {
    for (const option of app.querySelectorAll('[data-action="select"]')) {
      const { group, value } = option.dataset;
      const selected =
        state[group] instanceof Set
          ? state[group].has(value)
          : state[group] === value;
      option.classList.toggle('selected', selected);
      option.setAttribute(
        option.getAttribute('role') === 'radio'
          ? 'aria-checked'
          : 'aria-pressed',
        String(selected),
      );
    }
    const next = app.querySelector('.screen > .cta');
    if (next && ['age', 'frequency', 'feelings', 'zones'].includes(page))
      next.disabled = !nextPage(state);
  }
  function updateIntro() {
    app.querySelector('#consent').checked = state.consent;
    const button = app.querySelector('.intro .cta');
    button.textContent = state.assetsLoading ? 'CARGANDO...' : 'INICIAR';
    button.disabled = !state.consent || !state.assetsReady;
  }
  if (page === 'intro') {
    const overlay = app.querySelector('#privacy-overlay');
    const frame = app.querySelector('#privacy-frame');
    const title = app.querySelector('#privacy-title');
    const closeButton = app.querySelector('[data-privacy-close]');
    const loading = app.querySelector('.privacy-loading');
    let trigger;
    let openedAt = 0;
    let loadTimer;
    let loadSequence = 0;
    function closePrivacy() {
      loadSequence++;
      clearTimeout(loadTimer);
      overlay.hidden = true;
      loading.hidden = true;
      frame.removeAttribute('src');
      trigger?.focus();
    }
    frame.addEventListener(
      'load',
      () => {
        if (overlay.hidden) return;
        const sequence = loadSequence;
        clearTimeout(loadTimer);
        loadTimer = setTimeout(
          () => {
            if (sequence === loadSequence && !overlay.hidden)
              loading.hidden = true;
          },
          Math.max(200, 550 - (performance.now() - openedAt)),
        );
      },
      { signal: controller.signal },
    );
    controller.signal.addEventListener('abort', () => clearTimeout(loadTimer), {
      once: true,
    });
    app.addEventListener(
      'click',
      (event) => {
        const link = event.target.closest('[data-privacy-src]');
        if (link) {
          loadSequence++;
          clearTimeout(loadTimer);
          openedAt = performance.now();
          trigger = link;
          title.textContent = link.dataset.privacyTitle;
          frame.title = link.dataset.privacyTitle;
          loading.hidden = false;
          overlay.hidden = false;
          frame.src = link.dataset.privacySrc;
          closeButton.focus();
        } else if (
          event.target.closest('[data-privacy-close]') ||
          event.target === overlay
        ) {
          closePrivacy();
        }
      },
      { signal: controller.signal },
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && !overlay.hidden) closePrivacy();
      },
      { signal: controller.signal },
    );
  }
  async function boot() {
    window.ASTELLAS_BOOT?.begin(boot);
    updateIntro();
    try {
      await prepareAssets();
      if (!active) return;
      hydrateAssets();
      updateIntro();
      if (window.ASTELLAS_BOOT)
        await window.ASTELLAS_BOOT.complete(() => revealScreen(app));
      else revealScreen(app);
    } catch (error) {
      console.error('No se pudieron preparar los recursos.', error);
      if (active) window.ASTELLAS_BOOT?.fail();
    }
  }
  async function advance() {
    const next = nextPage(state);
    if (!next || busy) return;
    busy = true;
    try {
      if (page === 'zones') {
        try {
          await validateTrackedZone(state.photo, [...state.zones][0]);
        } catch (error) {
          if (!active) return;
          clearPhoto();
          state.trackingError =
            error.message || 'Repite la foto para mostrar la zona elegida.';
          await navigate(pageUrl('camera', state));
          return;
        }
      }
      if (!active) return;
      if (page === 'intro') {
        resetSession();
        state.consent = true;
      }
      if (page === 'frequency' && state.frequency === 'never') {
        state.feelings.clear();
        state.zones.clear();
      }
      await navigate(pageUrl(next, state));
    } finally {
      busy = false;
    }
  }

  app.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled || busy) return;
      const { action, group, value } = button.dataset;
      if (action !== 'capture' || state.photo)
        sound.play(action === 'select' ? 'select' : 'tap', { gesture: true });
      if (action === 'home') {
        resetSession();
        navigate('/');
      }
      if (action === 'next') advance().catch(console.error);
      if (action === 'download') downloadPhoto();
      if (action === 'retry-upload') retryPhotoUpload();
      if (action === 'capture') takePhoto();
      if (action === 'retake') retakePhoto();
      if (action === 'select') {
        if (group === 'age' || group === 'frequency') state[group] = value;
        else if (group === 'zones' || group === 'feelings')
          state[group] = new Set([value]);
        updateChoices();
      }
    },
    { signal: controller.signal },
  );
  app.addEventListener(
    'change',
    (event) => {
      if (event.target.id === 'consent') {
        sound.play('select', { gesture: true });
        state.consent = event.target.checked;
        updateIntro();
      }
    },
    { signal: controller.signal },
  );

  hydrateAssets();
  updateChoices();
  if (page === 'intro') {
    await boot();
    return;
  }
  if (page === 'camera') stopCamera = mountCamera(app);
  if (page === 'frequency' || page === 'countdown') {
    const image = new Image();
    image.src = state.photo;
    image.alt = page === 'frequency' ? 'Tu foto' : '';
    image.className = page === 'frequency' ? 'avatar' : 'countdown-photo';
    app
      .querySelector(page === 'frequency' ? '.center' : '.countdown')
      .prepend(image);
  }
  if (page === 'countdown') {
    let remaining = 3;
    timer = setInterval(() => {
      remaining--;
      if (remaining > 0)
        animateCount(app.querySelector('#count span'), remaining);
      else {
        clearInterval(timer);
        navigate(pageUrl('age', state));
      }
    }, 850);
  }
  if (page === 'result') saveResult();
  if (page === 'map') {
    if (state.resultIndex === 0) {
      app.querySelector('.map > h1').textContent = '¡ESTA ES TU FOTO!';
      app
        .querySelector('#thermal-map')
        .setAttribute('aria-label', 'Tu fotografía');
      app.querySelector('.final-photo p').textContent =
        'Conocer tu cuerpo y dar seguimiento a tu salud es el primer paso para cuidarte.';
    }
    await renderThermal(
      state.photo,
      state.zones,
      app.querySelector('#thermal-map'),
      undefined,
      state.resultIndex,
    );
  }
  if (page === 'download') await showDownload();
  if (active) revealScreen(app);
}

document.addEventListener('astro:before-swap', () => dispose());
document.addEventListener('astro:page-load', () =>
  mountExperience().catch(console.error),
);
window.addEventListener('pagehide', () => dispose());
