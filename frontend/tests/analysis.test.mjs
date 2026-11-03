import assert from 'node:assert/strict';
import test from 'node:test';
import { chronologicalStages, differenceLabel, framesForStage, scoreLabel, secondsLabel } from '../src/services/analysis.ts';

test('las distancias se presentan como porcentaje de la longitud del torso', () => {
  assert.equal(differenceLabel(0.1, 'torso_lengths'), '10,0 % del torso');
  assert.equal(differenceLabel(0, 'torso_lengths'), '0,0 % del torso');
  assert.equal(differenceLabel(1.25, 'torso_lengths'), '125,0 % del torso');
  assert.equal(differenceLabel(20, 'degrees'), '20,0°');
});

test('la ausencia de datos no se presenta como diferencia cero o puntuación cero', () => {
  assert.equal(differenceLabel(null, 'degrees'), 'Sin datos');
  assert.equal(differenceLabel(NaN, 'torso_lengths'), 'Sin datos');
  assert.equal(scoreLabel(null), 'Sin puntuación');
  assert.equal(scoreLabel(0), '0 / 100');
  assert.equal(scoreLabel(82.3), '82,3 / 100');
  assert.equal(secondsLabel(1200), '1,20 s');
});

test('las puntuaciones alternan momentos y fases en orden cronológico sin alterar sus notas', () => {
  const phase = key => ({ key, kind: 'phase', similarity_score: 82 });
  const moment = key => ({ key, kind: 'moment', similarity_score: null });
  const analysis = {
    phases: [phase('follow_through'), phase('backswing'), phase('downswing')],
    moments: [moment('finish'), moment('impact'), moment('address'), moment('top')],
  };
  const stages = chronologicalStages(analysis);
  assert.deepEqual(stages.map(stage => stage.key), ['address', 'backswing', 'top', 'downswing', 'impact', 'follow_through', 'finish']);
  assert.equal(stages[0], analysis.moments[2]);
  assert.equal(stages[1], analysis.phases[1]);
  assert.equal(stages[0].similarity_score, null);
});

test('el monigote muestra el momento comparado más cercano y solo el intervalo de la fase', () => {
  const frames = [0, 100, 200, 300].map(user_time_ms => ({ user_time_ms, user: user_time_ms === 200 ? [] : [{ x: 0, y: 0 }] }));
  assert.deepEqual(framesForStage(frames, { kind: 'moment', user_start_ms: 180 }), [frames[2]]);
  assert.deepEqual(framesForStage(frames, { kind: 'moment', user_start_ms: 150 }), [frames[1]]);
  assert.deepEqual(framesForStage(frames, { kind: 'phase', user_start_ms: 100, user_end_ms: 200 }), frames.slice(1, 3));
  assert.deepEqual(framesForStage([], { kind: 'moment', user_start_ms: 180 }), []);
  assert.deepEqual(framesForStage(frames, { kind: 'phase', user_start_ms: 110, user_end_ms: 190 }), []);
});
