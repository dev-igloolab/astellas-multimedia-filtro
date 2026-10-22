import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canEnter,
  nextPage,
  pageUrl,
  resultIndexFor,
} from '../src/lib/experience-flow.js';

const session = (changes = {}) => ({
  consent: true,
  assetsReady: true,
  photo: 'photo',
  photoReady: true,
  age: '30-40',
  frequency: 'sometimes',
  feelings: new Set(['calor']),
  zones: new Set(['cara']),
  ...changes,
});

test('las rutas protegidas necesitan consentimiento y una foto analizada', () => {
  for (const page of [
    'instructions',
    'camera',
    'countdown',
    'age',
    'frequency',
    'feelings',
    'zones',
    'result',
    'map',
    'download',
  ]) {
    assert.equal(canEnter(page, session({ consent: false })), false);
    assert.equal(canEnter(page, session({ assetsReady: false })), false);
  }
  assert.equal(canEnter('intro', session({ consent: false })), true);
  assert.equal(canEnter('camera', session({ photoReady: false })), true);
  for (const page of [
    'age',
    'frequency',
    'feelings',
    'zones',
    'result',
    'map',
    'download',
  ]) {
    assert.equal(canEnter(page, session({ photoReady: false })), false);
  }
});

test('cada resultado tiene su ruta Astro y respeta las respuestas', () => {
  for (const [feeling, index, path] of [
    ['calor', 1, 'leves'],
    ['sudor', 2, 'moderados'],
    ['interrumpe', 3, 'severos'],
  ]) {
    const state = session({ feelings: new Set([feeling]) });
    assert.equal(resultIndexFor(state), index);
    assert.equal(pageUrl('result', state), `/resultado/${path}/`);
    assert.equal(canEnter('result', state), true);
  }
  const state = session({
    frequency: 'never',
    feelings: new Set(),
    zones: new Set(),
  });
  assert.equal(pageUrl('result', state), '/resultado/sin-sintomas/');
  assert.equal(canEnter('result', state), true);
  assert.equal(canEnter('feelings', state), false);
  assert.equal(canEnter('zones', state), false);
});

test('no se puede avanzar ni mostrar resultados con respuestas incompletas', () => {
  assert.equal(nextPage(session({ page: 'age', age: '' })), null);
  assert.equal(nextPage(session({ page: 'frequency', frequency: '' })), null);
  assert.equal(
    nextPage(session({ page: 'feelings', feelings: new Set() })),
    null,
  );
  assert.equal(nextPage(session({ page: 'zones', zones: new Set() })), null);
  assert.equal(canEnter('map', session({ age: '' })), false);
  assert.equal(canEnter('download', session({ feelings: new Set() })), false);
  assert.equal(canEnter('result', session({ zones: new Set() })), false);
});

test('el recorrido salta las preguntas de síntomas cuando la respuesta es nunca', () => {
  assert.equal(
    nextPage(session({ page: 'frequency', frequency: 'never' })),
    'result',
  );
  assert.equal(nextPage(session({ page: 'frequency' })), 'feelings');
  assert.equal(nextPage(session({ page: 'camera', photoReady: false })), null);
  assert.equal(nextPage(session({ page: 'camera' })), 'countdown');
  assert.equal(nextPage(session({ page: 'result' })), 'map');
  assert.equal(nextPage(session({ page: 'map' })), 'download');
});
