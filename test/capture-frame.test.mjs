import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureFrame, visibleCaptureFrame } from '../src/capture-frame.js';
import { coverPhoto } from '../src/photo-frame.js';

test('El encuadre base centra la cámara detrás de la visual 9:16', () => {
  const frame = captureFrame(1280, 720, 9, 16);
  assert.equal(frame.height, 720);
  assert.equal(frame.width / frame.height, 9 / 16);
  assert.equal(frame.x, (1280 - frame.width) / 2);
  assert.equal(frame.y, 0);
});

test('Una cámara vertical no se recorta a lo ancho', () => {
  const frame = captureFrame(1080, 1920, 9, 16);
  assert.equal(frame.width, 1080);
  assert.equal(frame.y, 0);
});

test('La captura toma solo la parte de la cámara que se ve en pantalla', () => {
  const full = captureFrame(1280, 720, 1080, 1920);
  const visible = visibleCaptureFrame(1280, 720, 1080, 1920, 1325);
  assert.equal(visible.x, full.x);
  assert.equal(visible.y, full.y);
  assert.equal(visible.width, full.width);
  assert.equal(visible.height, full.height * 1325 / 1920);
});

test('La foto del recuadro visible llena el resultado 9:16 sin bordes', () => {
  const frame = coverPhoto(900, 1104, 1080, 1920);
  assert.ok(frame.width > 1080);
  assert.equal(frame.height, 1920);
  assert.ok(frame.x < 0);
  assert.equal(frame.y, 0);
});
