import assert from 'node:assert/strict';
import test from 'node:test';
import { proposedAnchors, equipmentAtTime, previewAtTime, trajectorySegments } from '../src/services/equipment.ts';

test('las propuestas parciales dejan sin rellenar las marcas no detectadas', () => {
  assert.deepEqual(proposedAnchors({ start_ms: 100, top_ms: 500, impact_ms: null, end_ms: null }), { start_ms: 100, top_ms: 500 });
  assert.deepEqual(proposedAnchors(), {});
  assert.deepEqual(proposedAnchors({ start_ms: NaN, top_ms: -1 }), {});
});

test('una pérdida de bola o palo no mantiene la detección anterior', () => {
  const seen = { timestamp_ms: 0, ball: { x: .5, y: .8 }, club: null };
  const missing = { timestamp_ms: 33, ball: null, club: null };
  assert.equal(equipmentAtTime([seen, missing], .02), seen);
  assert.equal(equipmentAtTime([seen, missing], .05), missing);
  assert.equal(equipmentAtTime([seen], .3), null);
  assert.equal(equipmentAtTime([missing], 0), null);
});

test('las miniaturas usan el fotograma observado cercano y conservan su tiempo real', () => {
  const sample = { timestamp_ms: 500, preview_jpeg: 'data:image/jpeg;base64,example' };
  const result = { video: { processed_fps: 30 }, frames: [sample], equipment_frames: [] };
  assert.equal(previewAtTime(result, 520), sample);
  assert.equal(previewAtTime(result, 1000), null);
});

test('la trayectoria no conecta puntos a través de una oclusión ni muestra el futuro', () => {
  const frames = [
    { elapsed_ms: 0, user: [{ x: 0, y: 0 }] },
    { elapsed_ms: 33, user: [{ x: 1, y: 1 }] },
    { elapsed_ms: 66, user: [] },
    { elapsed_ms: 99, user: [{ x: 2, y: 2 }] },
    { elapsed_ms: 132, user: [{ x: 3, y: 3 }] },
  ];
  assert.equal(trajectorySegments(frames, 'user', 0, 140).length, 2);
  assert.equal(trajectorySegments(frames, 'user', 0, 50).length, 1);
  assert.deepEqual(trajectorySegments(frames, 'user', 0, 0), []);
});
