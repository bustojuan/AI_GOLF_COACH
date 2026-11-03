import assert from 'node:assert/strict';
import test from 'node:test';
import { anchorsReady, setupReady, comparisonFrameAtTime } from '../src/services/comparison.ts';

const marks = { start_ms: 100, top_ms: 500, impact_ms: 800, end_ms: 1000 };

test('la comparación requiere cuatro marcas ordenadas dentro del vídeo', () => {
  assert.equal(anchorsReady(marks, 1), true);
  assert.equal(anchorsReady({ ...marks, top_ms: 800 }, 1), false);
  assert.equal(anchorsReady({ ...marks, end_ms: 1100 }, 1), false);
  assert.equal(anchorsReady({ start_ms: 0 }, 1), false);
  assert.equal(anchorsReady({ ...marks, start_ms: -1 }, 1), false);
});

test('las marcas rechazan valores no finitos o fracciones de milisegundo', () => {
  assert.equal(anchorsReady({ ...marks, top_ms: NaN }, 1), false);
  assert.equal(anchorsReady({ ...marks, top_ms: 400.5 }, 1), false);
});

test('es necesario declarar lateralidad y perspectiva', () => {
  assert.equal(setupReady({ handedness: '', view: '', club: '' }), false);
  assert.equal(setupReady({ handedness: 'right', view: '', club: '' }), false);
  assert.equal(setupReady({ handedness: 'left', view: 'face_on', club: '' }), true);
});

test('el reproductor encuentra la muestra de cada marca sin exceder los extremos', () => {
  const frames = [0, 300, 600, 900].map(elapsed_ms => ({ elapsed_ms }));
  assert.equal(comparisonFrameAtTime(frames, 300), frames[1]);
  assert.equal(comparisonFrameAtTime(frames, 599), frames[1]);
  assert.equal(comparisonFrameAtTime(frames, 600), frames[2]);
  assert.equal(comparisonFrameAtTime(frames, -10), frames[0]);
  assert.equal(comparisonFrameAtTime(frames, 1000), frames[3]);
  assert.equal(comparisonFrameAtTime([], 0), null);
});