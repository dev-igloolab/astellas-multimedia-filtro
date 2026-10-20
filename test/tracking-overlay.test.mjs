import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawTrackingOverlay, projectSpot } from '../src/tracking-overlay.js';
import { trackedSpots } from '../src/thermal.js';

test('Los puntos siguen la imagen reflejada y recortada de la cámara', () => {
  const frame = { videoWidth: 1280, videoHeight: 720, cropWidth: 540, cropHeight: 720, cropLeft: 370, cropTop: 0 };
  const viewport = { width: 1080, height: 1210 };
  const center = projectSpot([.5, .5, .1, .1], frame, viewport);
  const left = projectSpot([0, .5, .1, .1], frame, viewport);
  const right = projectSpot([1, .5, .1, .1], frame, viewport);
  assert.equal(center.x, 540);
  assert.equal(center.y, 605);
  assert.ok(left.x > right.x);
});

test('Los marcadores visibles se proyectan sobre el mismo encuadre 9:16 de la foto', () => {
  const frame = { videoWidth: 1280, videoHeight: 720, cropWidth: 405, cropHeight: 720, cropLeft: 437.5, cropTop: 0 };
  const viewport = { width: 1080, height: 1210, imageHeight: 1920 };
  const top = projectSpot([.5, .2, .05, .05], frame, viewport);
  const bottom = projectSpot([.5, .9, .05, .05], frame, viewport);
  assert.equal(top.x, 540);
  assert.ok(Math.abs(top.y - 384) < 1e-10);
  assert.ok(bottom.y > viewport.height);
});

test('La zona del pecho se mueve con los hombros detectados', () => {
  const pose = shift => {
    const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
    points[11] = { x: .35 + shift, y: .4, visibility: 1 };
    points[12] = { x: .65 + shift, y: .4, visibility: 1 };
    points[23] = { x: .4 + shift, y: .8, visibility: 1 };
    points[24] = { x: .6 + shift, y: .8, visibility: 1 };
    return points;
  };
  const first = trackedSpots(pose(0), { width: 900, height: 1200 }, 'pecho');
  const moved = trackedSpots(pose(.1), { width: 900, height: 1200 }, 'pecho');
  assert.equal(first.length, 1);
  assert.ok(Math.abs(moved[0][0] - first[0][0] - .1) < 1e-10);
  assert.ok(first[0][1] < .55, 'el centro del calor queda en el pecho, encima del abdomen');
  assert.ok(first[0][3] < .1, 'el calor del pecho no se extiende hasta el estómago');
});

test('El mapa completo conserva zonas separadas para rostro, pecho y brazos', () => {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const set = (index, x, y) => { points[index] = { x, y, visibility: 1 }; };
  [[2, .46, .2], [5, .54, .2], [7, .42, .22], [8, .58, .22], [9, .48, .28], [10, .52, .28],
    [11, .4, .35], [12, .6, .35], [13, .36, .48], [14, .64, .48], [15, .35, .63], [16, .65, .63],
    [23, .43, .75], [24, .57, .75]].forEach(([index, x, y]) => set(index, x, y));
  const image = { width: 900, height: 1600 };
  const face = trackedSpots(points, image, 'cara');
  const chest = trackedSpots(points, image, 'pecho');
  const arms = trackedSpots(points, image, 'brazos');
  const wholeBody = trackedSpots(points, image, 'cuerpo');
  assert.equal(face.length, 4);
  assert.ok(face[1][0] + face[1][2] < face[0][0], 'el calor del cachete izquierdo no cubre el centro de la nariz');
  assert.ok(face[2][0] - face[2][2] > face[0][0], 'el calor del cachete derecho no cubre el centro de la nariz');
  assert.ok(face[0][2] * image.width > face[0][3] * image.height, 'la frente sigue una forma horizontal');
  assert.ok(face[0][1] + face[0][3] < .2, 'la frente queda por encima de los ojos');
  assert.ok(face[1][1] - face[1][3] > .2, 'el calor del cachete no llega a los ojos');
  assert.ok(face[1][1] + face[1][3] < .28, 'el calor del cachete no llega a la boca');
  assert.ok(face[1][3] * image.height < face[1][2] * image.width, 'el cachete ocupa menos alto');
  assert.ok(face[3][1] > .32, 'el calor del cuello queda debajo de la mandíbula');
  assert.ok(face.every(spot => spot[6] === 'cara'));
  assert.ok(chest.every(spot => spot[6] === 'pecho'));
  assert.ok(chest[0][2] < .1, 'el calor del pecho no llega hasta ambos brazos');
  assert.ok(arms.every(spot => spot[6] === 'brazos'));
  assert.ok(arms[1][1] - arms[0][1] > arms[0][3] + arms[1][3], 'brazo y antebrazo quedan como parches separados');
  assert.deepEqual(wholeBody.filter(spot => spot[6] === 'cara'), face);
  assert.deepEqual(wholeBody.filter(spot => spot[6] === 'pecho'), chest);
  assert.deepEqual(wholeBody.filter(spot => spot[6] === 'brazos'), arms);
  assert.ok(wholeBody.every(spot => spot[6] !== 'abdomen'));
  assert.ok(wholeBody.every(spot => spot[6] !== 'piernas'));
  assert.deepEqual(trackedSpots(points, image, 'piernas'), []);
});

test('El seguimiento dibuja solo las guías de las zonas de calor visibles', () => {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  points[11] = { x: .35, y: .4, visibility: 1 };
  points[12] = { x: .65, y: .4, visibility: 1 };
  points[23] = { x: .4, y: .8, visibility: 1 };
  points[24] = { x: .6, y: .8, visibility: 1 };
  let strokes = 0;
  const context = {
    clearRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { strokes++; },
  };
  const canvas = {
    clientWidth: 450, clientHeight: 600, width: 0, height: 0,
    getContext: () => context,
  };
  const frame = {
    videoWidth: 900, videoHeight: 1200,
    cropWidth: 900, cropHeight: 1200, cropLeft: 0, cropTop: 0,
  };
  assert.deepEqual(drawTrackingOverlay(canvas, points, frame), ['pecho']);
  assert.equal(strokes, 2);
  canvas.clientHeight = 200;
  assert.deepEqual(drawTrackingOverlay(canvas, points, frame), []);
  assert.equal(strokes, 2);
});

test('La guía muestra frente, dos cachetes, cuello, pecho, brazos y antebrazos', () => {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const set = (index, x, y) => { points[index] = { x, y, visibility: 1 }; };
  [[2, .46, .2], [5, .54, .2], [7, .42, .22], [8, .58, .22], [9, .48, .28], [10, .52, .28],
    [11, .4, .35], [12, .6, .35], [13, .36, .48], [14, .64, .48], [15, .35, .63], [16, .65, .63],
    [23, .43, .75], [24, .57, .75]].forEach(([index, x, y]) => set(index, x, y));
  let strokes = 0;
  const context = {
    clearRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { strokes++; },
  };
  const canvas = { clientWidth: 450, clientHeight: 600, width: 0, height: 0, getContext: () => context };
  const frame = { videoWidth: 900, videoHeight: 1600, cropWidth: 900, cropHeight: 1600, cropLeft: 0, cropTop: 0 };
  assert.deepEqual(drawTrackingOverlay(canvas, points, frame), ['cara', 'pecho', 'brazos']);
  assert.equal(strokes, 18);
});
