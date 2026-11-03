import test from 'node:test';
import assert from 'node:assert/strict';
import { flightPoint, flightPath, flightDistance, flightTravel, flightReveal, flightSweep } from '../src/services/flightGeometry.ts';

test('el arco conserva sus extremos y pasa por encima de su cuerda, sin esquinas en la trayectoria', () => {
  const a = { x: 100, y: 600 }, b = { x: 1200, y: 250 };
  assert.deepEqual(flightPoint(a, b, 180, 0), a); assert.deepEqual(flightPoint(a, b, 180, 1), b);
  assert.equal(flightPoint(a, b, 180, .5).y, 245);
  let last = a;
  for (let index = 1; index <= 100; index++) {
    const point = flightPoint(a, b, 180, index / 100);
    assert(point.x > last.x); assert(Number.isFinite(point.y)); last = point;
  }
  assert(flightPath(a, b, 180).startsWith('M 100 600 C '));
  assert(flightPath(a, b, 180).endsWith(', 1200 250'));
});
test('bola y estela comparten progreso, pero el dash utiliza distancia de arco', () => {
  const length = flightDistance({ x: 0, y: 100 }, { x: 100, y: 100 }, 80);
  assert.equal(length(0), 0); assert.equal(length(1), 1);
  assert(Math.abs(length(.5) - .5) < .001);
  assert(length(.1) > .1);
  let previous = -1;
  for (let index = 0; index <= 100; index++) { const value = length(index / 100); assert(value > previous); previous = value; }
});
test('el vuelo desacelera progresivamente sin resolver casi todo al comenzar', () => {
  assert.equal(flightTravel(0), 0); assert.equal(flightTravel(1), 1);
  assert(flightTravel(.25) > .25 && flightTravel(.25) < .4);
  const distances = [0, .25, .5, .75, 1].map(flightTravel);
  const deltas = distances.slice(1).map((value, index) => value - distances[index]);
  for (let index = 1; index < deltas.length; index++) assert(deltas[index] < deltas[index - 1]);
});
test('la máscara comienza y termina estable, con progreso acotado', () => {
  assert.equal(flightReveal(-1), 0); assert.equal(flightReveal(2), 1);
  assert.equal(flightReveal(.5), .5);
  assert(flightReveal(.01) < .001); assert(flightReveal(.99) > .999);
});
test('el barrido sigue la cabeza del vuelo y termina ocupando toda la pantalla', () => {
  const head = { x: 800, y: 400 };
  assert(flightSweep(head, 1200, 800, 0, 0).every(point => point.x === 0));
  const following = flightSweep(head, 1200, 800, 1, 0);
  assert.equal(following[12].x, head.x); assert.equal(following[12].y, head.y);
  assert(following.every(point => point.x <= head.x));
  assert(flightSweep(head, 1200, 800, 1, 1).every(point => point.x === 1200));
});
