import assert from 'node:assert/strict';
import test from 'node:test';
import { heroFrameAtTime, heroPhaseAtTime, heroClubTrail, validHeroPoint } from '../src/services/heroTracking.ts';

const observed = { time: 1, joints: { left_wrist: { x: .2, y: .4 } }, club: { grip: { x: .2, y: .4 }, head: { x: .3, y: .6 } } };
const next = { ...observed, time: 1.04, club: { ...observed.club, head: { x: .5, y: .7 } } };
const missing = { time: 1.08, joints: {}, club: null };

test('el overlay sigue la muestra observada del vídeo y caduca fuera de su intervalo', () => {
  const clip = { fps: 25, frames: [observed, next, missing] };
  assert.equal(heroFrameAtTime(clip, .9), null);
  assert.equal(heroFrameAtTime(clip, 1.039), observed);
  assert.equal(heroFrameAtTime(clip, 1.04), next);
  assert.equal(heroFrameAtTime(clip, 1.1), missing);
  assert.equal(heroFrameAtTime(clip, 2), null);
  assert.equal(heroFrameAtTime(clip, NaN), null);
});

test('las fases cambian en sus marcas sin un reloj de animación independiente', () => {
  const phases = [{ key: 'address', label: 'Inicio', start: 0 }, { key: 'top', label: 'Cima', start: 2.12 }];
  assert.equal(heroPhaseAtTime(phases, -1), null);
  assert.equal(heroPhaseAtTime(phases, 2.119)?.key, 'address');
  assert.equal(heroPhaseAtTime(phases, 2.12)?.key, 'top');
  assert.equal(heroPhaseAtTime(phases, NaN), null);
});

test('la trayectoria solo conecta observaciones explícitas y se corta en pérdidas', () => {
  assert.deepEqual(heroClubTrail({ fps: 25, frames: [observed, next] }, 1.04), [observed.club.head, next.club.head]);
  assert.deepEqual(heroClubTrail({ fps: 25, frames: [observed, next, missing] }, 1.08), []);
  assert.deepEqual(heroClubTrail({ fps: 25, frames: [{ ...observed, club: null }, next] }, 1.04), [next.club.head]);
  const recovered = { ...next, time: 1.2 };
  assert.deepEqual(heroClubTrail({ fps: 25, frames: [observed, recovered] }, 1.2), [recovered.club.head]);
  assert.deepEqual(heroClubTrail({ fps: 25, frames: [{ time: 1, joints: observed.joints }] }, 1), []);
});

test('los puntos inválidos o fuera del fotograma no generan gráficos técnicos', () => {
  assert.equal(validHeroPoint({ x: 0, y: 1 }), true);
  for (const point of [null, undefined, { x: -1, y: .5 }, { x: .5, y: 2 }, { x: Infinity, y: .5 }, { x: NaN, y: .5 }]) assert.equal(validHeroPoint(point), false);
  assert.deepEqual(heroClubTrail({ fps: 25, frames: [{ ...observed, club: { ...observed.club, head: { x: NaN, y: .2 } } }] }, 1), []);
});
