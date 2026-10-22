import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordStore, recordsCsv } from '../src/lib/records.js';

test('guarda una partida por sesión y conserva únicamente respuestas y resultado', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const store = createRecordStore(storage);
  const record = {
    id: 'sesion-1',
    completedAt: '2026-10-20T18:00:00.000Z',
    age: '40-55',
    frequency: 'sometimes',
    feeling: 'calor',
    zone: 'cara',
    result: 'mild',
  };
  store.save(record);
  store.save({ ...record, result: 'moderate' });
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].result, 'moderate');
  assert.ok(!values.values().next().value.includes('photo'));
});

test('exporta un CSV legible y evita fórmulas en valores alterados', () => {
  const csv = recordsCsv([
    {
      id: '=HYPERLINK("x")',
      completedAt: '2026-10-20T18:00:00.000Z',
      age: '40-55',
      frequency: 'never',
      feeling: '',
      zone: '',
      result: 'none',
    },
  ]);
  assert.match(csv, /"Rango de edad"/);
  assert.match(csv, /"40 a 55","Nunca"/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
});
