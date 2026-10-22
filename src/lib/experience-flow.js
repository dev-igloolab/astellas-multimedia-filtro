import { resultForAnswers } from './results.js';
export const routes = {
  intro: '/',
  instructions: '/instrucciones/',
  camera: '/camara/',
  countdown: '/evaluando/',
  age: '/edad/',
  frequency: '/frecuencia/',
  feelings: '/sensaciones/',
  zones: '/zonas/',
  result: '/resultado/',
  map: '/mapa/',
  download: '/descarga/',
};
export const resultPaths = ['sin-sintomas', 'leves', 'moderados', 'severos'];
export function resultIndexFor(state) {
  if (state.frequency === 'never') return 0;
  if (!state.zones.size) return null;
  return resultForAnswers(state.frequency, [...state.feelings][0]);
}
export function pageUrl(page, state) {
  return page === 'result'
    ? routes.result + resultPaths[resultIndexFor(state)] + '/'
    : routes[page];
}
export function canEnter(page, state) {
  if (page === 'intro') return true;
  if (!state.consent || !state.assetsReady) return false;
  if (page === 'instructions' || page === 'camera') return true;
  if (!state.photoReady || !state.photo) return false;
  if (page === 'countdown' || page === 'age') return true;
  if (!state.age) return false;
  if (page === 'frequency') return true;
  if (!state.frequency) return false;
  if (page === 'feelings') return state.frequency !== 'never';
  if (page === 'zones')
    return state.frequency !== 'never' && !!state.feelings.size;
  return (
    ['result', 'map', 'download'].includes(page) &&
    resultIndexFor(state) !== null
  );
}
export function nextPage(state) {
  if (state.page === 'intro' && (!state.consent || !state.assetsReady))
    return null;
  if (state.page === 'camera' && !state.photoReady) return null;
  if (state.page === 'age' && !state.age) return null;
  if (state.page === 'frequency')
    return state.frequency
      ? state.frequency === 'never'
        ? 'result'
        : 'feelings'
      : null;
  if (state.page === 'feelings' && !state.feelings.size) return null;
  if (state.page === 'zones' && resultIndexFor(state) === null) return null;
  return (
    {
      intro: 'instructions',
      instructions: 'camera',
      camera: 'countdown',
      age: 'frequency',
      feelings: 'zones',
      zones: 'result',
      result: 'map',
      map: 'download',
    }[state.page] || null
  );
}
