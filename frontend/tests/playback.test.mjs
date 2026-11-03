import assert from 'node:assert/strict';
import test from 'node:test';
import { frameAtTime, isVisible } from '../src/services/playback.ts';

const pose = { timestamp_ms: 0, landmarks: [{ x: 0.5, y: 0.5, z: 0, visibility: 0.9, presence: 0.9 }], low_visibility: false };
const missing = { timestamp_ms: 100, landmarks: [], low_visibility: true };
const recovered = { ...pose, timestamp_ms: 200 };

test('una pérdida de detección interrumpe la postura, sin puentearla', () => {
  assert.equal(frameAtTime([pose, missing, recovered], 0.05), pose);
  assert.equal(frameAtTime([pose, missing, recovered], 0.15), missing);
  assert.equal(frameAtTime([pose, missing, recovered], 0.2), recovered);
});

test('no se muestran posturas fuera del intervalo disponible', () => {
  assert.equal(frameAtTime([], 0), null);
  assert.equal(frameAtTime([recovered], 0.1), null);
  assert.equal(frameAtTime([pose], 1), null);
});

test('se ocultan puntos fuera de imagen o con baja visibilidad o presencia', () => {
  const point = pose.landmarks[0];
  assert.equal(isVisible(point, 0.5), true);
  assert.equal(isVisible({ ...point, x: NaN }, 0.5), false);
  assert.equal(isVisible({ ...point, y: 1.2 }, 0.5), false);
  assert.equal(isVisible({ ...point, visibility: 0.4 }, 0.5), false);
  assert.equal(isVisible({ ...point, presence: 0.4 }, 0.5), false);
});
test('un vídeo de pocos FPS mantiene cada muestra durante su intervalo', () => {
  assert.equal(frameAtTime([pose], 0.8, 1050), pose);
  assert.equal(frameAtTime([pose], 1.2, 1050), null);
});
