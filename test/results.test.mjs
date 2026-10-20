import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resultForAnswers } from '../src/results.js';

test('Nunca muestra el resultado sin síntomas', () => {
  assert.equal(resultForAnswers('never', ''), 0);
});

for (const frequency of ['sometimes', 'often']) {
  test(`Las respuestas de sensaciones eligen un único resultado con frecuencia ${frequency}`, () => {
    assert.equal(resultForAnswers(frequency, 'calor'), 1);
    assert.equal(resultForAnswers(frequency, 'sudor'), 2);
    assert.equal(resultForAnswers(frequency, 'ambas'), 2);
    assert.equal(resultForAnswers(frequency, 'interrumpe'), 3);
    assert.equal(resultForAnswers(frequency, 'todas'), 3);
  });
}

test('No asigna una severidad a respuestas incompletas', () => {
  assert.equal(resultForAnswers('', 'calor'), null);
  assert.equal(resultForAnswers('often', ''), null);
});
