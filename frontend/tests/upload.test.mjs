import assert from 'node:assert/strict';
import test from 'node:test';
import { validateVideoFile } from '../src/services/upload.ts';
import { processSwing } from '../src/services/api.ts';

function mockTransfer(t) {
  const original = globalThis.XMLHttpRequest;
  const calls = [];
  globalThis.XMLHttpRequest = class extends EventTarget {
    upload = new EventTarget();
    status = 0;
    responseText = '';
    constructor() { super(); calls.push(this); }
    open(method, path) { this.method = method; this.path = path; }
    send(body) { this.body = body; }
    respond(status, body) { this.status = status; this.responseText = JSON.stringify(body); this.dispatchEvent(new Event('load')); }
  };
  t.after(() => { globalThis.XMLHttpRequest = original; });
  return calls;
}
const file = () => new File(['example video'], 'swing.mp4', { type: 'video/mp4' });

test('la validación de subida conserva formatos, tamaño y archivos vacíos', () => {
  assert.equal(validateVideoFile({ name: 'SWING.MP4', size: 20 }), '');
  assert.equal(validateVideoFile({ name: 'swing.mov', size: 50 * 1024 * 1024 }), '');
  assert.match(validateVideoFile({ name: 'swing.mp4', size: 0 }), /vacío/);
  assert.match(validateVideoFile({ name: 'swing.exe', size: 20 }), /MP4/);
  assert.match(validateVideoFile({ name: 'swing.mp4', size: 50 * 1024 * 1024 + 1 }), /50 MB/);
});

test('el progreso de transferencia procede de bytes y analizar empieza al terminar el envío', async t => {
  const calls = mockTransfer(t), progress = [];
  const pending = processSwing(file(), value => progress.push(value));
  const request = calls[0];
  assert.equal(request.method, 'POST'); assert.equal(request.path, '/api/swings');
  assert.equal(request.timeout, 300_000); assert(request.body instanceof FormData);
  request.upload.dispatchEvent(Object.assign(new Event('progress'), { loaded: 25, total: 100, lengthComputable: true }));
  assert.deepEqual(progress.at(-1), { phase: 'uploading', loaded: 25, total: 100 });
  assert.equal(progress.some(value => value.phase === 'processing'), false);
  request.upload.dispatchEvent(new Event('load'));
  assert.deepEqual(progress.at(-1), { phase: 'processing' });
  const result = { status: 'completed', frames: [], video: { duration_seconds: 4 } };
  request.respond(201, result);
  assert.deepEqual(await pending, result); assert.equal(calls.length, 1);
});

test('un tamaño de transferencia desconocido no se convierte en porcentaje ficticio', async t => {
  const calls = mockTransfer(t), progress = [];
  const pending = processSwing(file(), value => progress.push(value));
  calls[0].upload.dispatchEvent(Object.assign(new Event('progress'), { loaded: 25, total: 0, lengthComputable: false }));
  assert.equal(progress.at(-1).total, null);
  calls[0].respond(400, { detail: 'Vídeo no válido.' });
  await assert.rejects(pending, /Vídeo no válido/);
});

test('los errores, respuestas inválidas y timeouts no se ocultan ni provocan reintentos', async t => {
  const calls = mockTransfer(t);
  let pending = processSwing(file(), () => {});
  calls.at(-1).respond(201, { status: 'completed', frames: null, video: {} });
  await assert.rejects(pending, /no válido/);
  pending = processSwing(file(), () => {});
  calls.at(-1).dispatchEvent(new Event('timeout'));
  await assert.rejects(pending, /La espera ha terminado/);
  pending = processSwing(file(), () => {});
  calls.at(-1).dispatchEvent(new Event('error'));
  await assert.rejects(pending, /No se puede conectar/);
  assert.equal(calls.length, 3);
});
