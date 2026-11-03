import test from 'node:test';
import assert from 'node:assert/strict';
import { golfTransition, replayUntilStudioImpact } from '../src/services/golfMotion.ts';

const timers = new Map();
let identifier = 0;
globalThis.window = { setTimeout(callback) { const id = ++identifier; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); } };

class Video extends EventTarget {
  readyState = 2; currentTime = 3; muted = false; seeking = false; error = null;
  callbacks = new Map(); paused = false; playbackFailure = false;
  play() { this.paused = false; return this.playbackFailure ? Promise.reject(new Error('blocked')) : Promise.resolve(); }
  pause() { this.paused = true; }
  requestVideoFrameCallback(callback) { const id = ++identifier; this.callbacks.set(id, callback); return id; }
  cancelVideoFrameCallback(id) { this.callbacks.delete(id); }
  present(time) { this.currentTime = time; const callbacks = [...this.callbacks.values()]; this.callbacks.clear(); callbacks.forEach(callback => callback(0, { mediaTime: time })); }
}

test('seis cambios consecutivos tienen seis familias y los regresos mantienen su identidad', () => {
  const expected = ['swing-impact', 'ball-flight', 'radar-scan', 'swing-replay', 'landing-impact', 'final-putt'];
  expected.forEach((family, index) => { assert.equal(golfTransition(index, index + 1), family); assert.equal(golfTransition(index + 1, index), family); });
  assert.equal(golfTransition(1, 6), 'final-putt');
  assert.equal(golfTransition(6, 3), 'swing-replay');
});
test('la salida espera el fotograma presentado de golpe, incluso con seeking o reproducción lenta', async () => {
  const video = new Video(), controller = new AbortController();
  let complete = false;
  const result = replayUntilStudioImpact(video, controller.signal).then(value => { complete = true; return value; });
  assert.equal(video.currentTime, 0); assert.equal(video.muted, true);
  video.present(.9375); await Promise.resolve(); assert.equal(complete, false);
  video.seeking = true; video.present(1.125); await Promise.resolve(); assert.equal(complete, false);
  video.seeking = false; video.present(1.0625);
  assert.deepEqual(await result, { reason: 'frame', mediaTime: 1.0625 });
  assert.equal(timers.size, 0); assert.equal(video.callbacks.size, 0);
});
test('cancelar una navegación detiene y limpia el replay sin continuar más tarde', async () => {
  const video = new Video(), controller = new AbortController();
  const result = replayUntilStudioImpact(video, controller.signal);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  video.present(1); assert(video.paused); assert.equal(video.callbacks.size, 0); assert.equal(timers.size, 0);
});
test('vídeo ausente, autoplay bloqueado y reproducción estancada permiten continuar', async () => {
  const missing = new Video(); missing.readyState = 0;
  assert.equal((await replayUntilStudioImpact(missing, new AbortController().signal)).reason, 'unavailable');
  const blocked = new Video(); blocked.playbackFailure = true;
  assert.equal((await replayUntilStudioImpact(blocked, new AbortController().signal)).reason, 'blocked');
  const stalled = new Video();
  const result = replayUntilStudioImpact(stalled, new AbortController().signal);
  for (const callback of [...timers.values()]) callback();
  assert.equal((await result).reason, 'stalled');
  assert.equal(stalled.callbacks.size, 0); assert.equal(timers.size, 0);
});
test('sin callback de vídeo la alternativa usa currentTime y no un temporizador de salida', async () => {
  const video = new Video(); video.requestVideoFrameCallback = undefined;
  const result = replayUntilStudioImpact(video, new AbortController().signal);
  video.currentTime = .75; video.dispatchEvent(new Event('timeupdate')); assert.equal(timers.size, 1);
  video.currentTime = 1; video.dispatchEvent(new Event('timeupdate'));
  assert.deepEqual(await result, { reason: 'timeupdate', mediaTime: 1 }); assert.equal(timers.size, 0);
});
