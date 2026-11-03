import assert from 'node:assert/strict';
import test from 'node:test';
import { readGeneratedReport, reportMetricLabel } from '../src/services/recommendations.ts';
import { generateCoachExplanation, prepareCoachReport } from '../src/services/api.ts';

function explanationFixture() {
  const keys = ['address', 'backswing', 'top', 'downswing', 'impact', 'follow_through', 'finish'];
  const sources = keys.map(key => ({ key, quality: 'sufficient', metrics: [{
    evidence_id: `${key}.left_elbow`, difference: key === 'address' ? 0 : 15, samples: 30, total_samples: 30, unit: 'degrees',
  }] }));
  const phases = sources.filter(stage => ['backswing', 'downswing', 'follow_through'].includes(stage.key));
  const moments = sources.filter(stage => !phases.includes(stage));
  const prepared = { report_id: 'current-report', data: { phases, moments } };
  const generated = { status: 'generated', generated_by_ai: true, report_id: prepared.report_id,
    response: { strengths: [],
      stages: keys.map((key, index) => ({ stage_key: key, assessment: 'evaluated', summary: 'Explicación de prueba.',
        strengths: [], areas_to_review: [], recommended_drill: null, success_check: null,
        evidence: [{ evidence_id: `${key}.left_elbow`, difference: sources[index].metrics[0].difference }] })),
      priorities: [] } };
  return { prepared, generated };
}

test('el informe presenta sus porcentajes explícitos sin multiplicarlos de nuevo por 100', () => {
  assert.equal(reportMetricLabel({ difference: 10, unit: 'torso_percent' }), '10,0 % del torso');
  assert.equal(reportMetricLabel({ difference: 15, unit: 'degrees' }), '15,0°');
  assert.equal(reportMetricLabel({ difference: 0, unit: 'degrees' }), '0,0°');
  assert.equal(reportMetricLabel({ difference: null, unit: 'torso_percent' }), 'Sin datos');
});

test('preparar un informe solo consulta la ruta local de vista previa', async () => {
  const calls = [];
  const original = globalThis.fetch;
  const body = { swing_id: 'swing', reference_id: 'reference', setup: {}, anchors: {} };
  const prepared = { status: 'prepared', generated_by_ai: false, local_only: true,
    data: { phases: [{}, {}, {}], overall_metrics: [] } };
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    return new Response(JSON.stringify(prepared), { status: 200 });
  };
  try {
    assert.deepEqual(await prepareCoachReport(body), prepared);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/api/recommendations/preview');
    assert.deepEqual(JSON.parse(calls[0][1].body), body);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...prepared, generated_by_ai: true }));
    await assert.rejects(() => prepareCoachReport(body), /no válido/);
  } finally { globalThis.fetch = original; }
});

test('un error del backend conserva el mensaje útil y permite reintentar', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'No se ha encontrado la referencia.' }), { status: 404 });
  try {
    await assert.rejects(() => prepareCoachReport({}), /No se ha encontrado la referencia/);
  } finally { globalThis.fetch = original; }
});

test('una explicación válida se vincula al informe y permite ceros y ausencia de aspectos adicionales', () => {
  const { prepared, generated } = explanationFixture();
  assert.deepEqual(readGeneratedReport(generated, prepared), generated);
  prepared.data.phases[1].metrics[0].difference = null;
  prepared.data.phases[1].metrics[0].samples = 0;
  generated.response.stages[3].evidence = [];
  generated.response.stages[3].assessment = 'not_evaluable';
  assert.deepEqual(readGeneratedReport(generated, prepared), generated);
});

test('se rechazan respuestas de otra comparación y citas inventadas, alteradas o de otra fase', () => {
  const { prepared, generated } = explanationFixture();
  assert.throws(() => readGeneratedReport({ ...generated, report_id: 'old-report' }, prepared), /comparación ha cambiado/);
  for (const change of ['unknown', 'value', 'phase', 'missing']) {
    const raw = structuredClone(generated);
    if (change === 'unknown') raw.response.stages[0].evidence[0].evidence_id = 'address.invented';
    if (change === 'value') raw.response.stages[0].evidence[0].difference = 99;
    if (change === 'phase') raw.response.stages[0].evidence[0] = raw.response.stages[1].evidence[0];
    if (change === 'missing') raw.response.stages[0].evidence = [];
    assert.throws(() => readGeneratedReport(raw, prepared), /no es válida/);
  }
  prepared.data.phases[0].metrics[0].difference = null;
  prepared.data.phases[0].metrics[0].samples = 0;
  assert.throws(() => readGeneratedReport(generated, prepared), /no es válida/);
});

test('se requieren siete etapas ordenadas y hasta tres prioridades con evidencias propias de fases o momentos', () => {
  const { prepared, generated } = explanationFixture();
  const point = { stage_key: 'impact', observation: 'Dato de prueba.', recommendation: 'Revisar la comparación.', evidence: generated.response.stages[4].evidence };
  const valid = structuredClone(generated);
  valid.response.priorities = [point];
  assert.deepEqual(readGeneratedReport(valid, prepared), valid);
  for (const change of ['duplicate_phase', 'missing_phase', 'missing_limits', 'too_many', 'empty_evidence', 'not_ai']) {
    const raw = structuredClone(valid);
    if (change === 'duplicate_phase') raw.response.stages[1].stage_key = 'address';
    if (change === 'missing_phase') raw.response.stages.pop();
    if (change === 'missing_limits') raw.response.limitations = [];
    if (change === 'too_many') raw.response.priorities = [point, point, point, point];
    if (change === 'empty_evidence') raw.response.priorities[0].evidence = [];
    if (change === 'not_ai') raw.generated_by_ai = false;
    assert.throws(() => readGeneratedReport(raw, prepared), /no es válida/);
  }
});

test('la disponibilidad determina assessment y una etapa ausente no puede inventar fortalezas o prácticas', () => {
  const { prepared, generated } = explanationFixture();
  prepared.data.phases[0].quality = 'limited';
  assert.throws(() => readGeneratedReport(generated, prepared), /no es válida/);
  generated.response.stages[1].assessment = 'partial';
  assert.deepEqual(readGeneratedReport(generated, prepared), generated);
  prepared.data.moments.shift();
  const absent = generated.response.stages[0];
  absent.assessment = 'not_evaluable'; absent.evidence = [];
  assert.deepEqual(readGeneratedReport(generated, prepared), generated);
  for (const change of [{ strengths: ['Inventado'] }, { areas_to_review: ['Inventado'] },
    { recommended_drill: 'Inventado', success_check: 'Inventado' }, { assessment: 'evaluated' }]) {
    const invalid = structuredClone(generated);
    Object.assign(invalid.response.stages[0], change);
    assert.throws(() => readGeneratedReport(invalid, prepared), /no es válida/);
  }
});

test('se rechazan textos vacíos o demasiado largos, prácticas sin comprobación, citas repetidas y contratos antiguos', () => {
  const { prepared, generated } = explanationFixture();
  for (const change of [{ summary: ' ' }, { summary: 'x'.repeat(1201) },
    { strengths: ['x'.repeat(401)] }, { areas_to_review: ['a', 'b', 'c'] },
    { recommended_drill: 'Práctica sin comprobación' }, { success_check: 'Sin práctica' },
    { evidence: [...generated.response.stages[0].evidence, ...generated.response.stages[0].evidence] },
    { evidence: generated.response.stages[2].evidence }, { extra: 'Campo inventado' }]) {
    const invalid = structuredClone(generated);
    Object.assign(invalid.response.stages[0], change);
    assert.throws(() => readGeneratedReport(invalid, prepared), /no es válida/);
  }
  for (const response of [{ ...generated.response, general_summary: 'x'.repeat(2001) },
    { ...generated.response, limitations: ['x'.repeat(801)] },
    { general_summary: 'Antiguo', phases: [], review_points: [], limitations: ['2D'] }]) {
    assert.throws(() => readGeneratedReport({ ...generated, response }, prepared), /no es válida/);
  }
  const valid = structuredClone(generated);
  Object.assign(valid.response.stages[0], { recommended_drill: 'Observar la postura.', success_check: 'Repetir la grabación.' });
  assert.deepEqual(readGeneratedReport(valid, prepared), valid);
});

test('los puntos fuertes globales requieren citas propias y un máximo de tres', () => {
  const { prepared, generated } = explanationFixture();
  generated.response.strengths = [{ stage_key: 'address', observation: 'La colocación de los brazos es un punto favorable.',
    evidence: generated.response.stages[0].evidence }];
  assert.deepEqual(readGeneratedReport(generated, prepared), generated);
  for (const change of ['too_many', 'empty', 'value', 'cross_stage', 'absent', 'long_text', 'missing_field']) {
    const invalid = structuredClone(generated), strength = invalid.response.strengths[0];
    if (change === 'too_many') invalid.response.strengths = Array(4).fill(strength);
    if (change === 'empty') strength.evidence = [];
    if (change === 'value') strength.evidence[0].difference += 2;
    if (change === 'cross_stage') strength.stage_key = 'finish';
    if (change === 'absent') strength.evidence[0].evidence_id = 'address.absent';
    if (change === 'long_text') strength.observation = 'x'.repeat(801);
    if (change === 'missing_field') delete invalid.response.strengths;
    assert.throws(() => readGeneratedReport(invalid, prepared), /no es válida/);
  }
});

test('cada aspecto por mejorar necesita ejercicio y comprobación', () => {
  const { prepared, generated } = explanationFixture();
  generated.response.stages[1].areas_to_review = ['Trabajar la colocación del brazo en la subida.'];
  assert.throws(() => readGeneratedReport(generated, prepared), /no es válida/);
  Object.assign(generated.response.stages[1], {
    recommended_drill: 'En casa sin palo, ensaya cinco subidas lentas con una pausa cómoda.',
    success_check: 'Comprueba que puedes parar y volver sin tirones.',
  });
  assert.deepEqual(readGeneratedReport(generated, prepared), generated);
});

test('generar usa una petición explícita con IDs y marcas y una espera suficiente para el proveedor', async () => {
  const { prepared, generated } = explanationFixture();
  const originalFetch = globalThis.fetch, originalTimeout = AbortSignal.timeout;
  const calls = [], timeouts = [];
  const body = { swing_id: 'user', reference_id: 'reference', setup: {}, anchors: {} };
  AbortSignal.timeout = milliseconds => { timeouts.push(milliseconds); return originalTimeout(milliseconds); };
  globalThis.fetch = async (url, options) => { calls.push([url, options]); return new Response(JSON.stringify(generated)); };
  try {
    assert.deepEqual(await generateCoachExplanation(body, prepared), generated);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/api/recommendations');
    assert.deepEqual(JSON.parse(calls[0][1].body), body);
    assert(timeouts[0] > 60000);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});

test('la IA desactivada, respuestas inválidas y timeouts no generan respuestas de sustitución ni reintentos', async () => {
  const { prepared, generated } = explanationFixture();
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ detail: 'IA todavía sin activar.' }), { status: 503 }); };
    await assert.rejects(() => generateCoachExplanation({}, prepared), /sin activar/);
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...generated, report_id: 'old-report' }));
    await assert.rejects(() => generateCoachExplanation({}, prepared), /comparación ha cambiado/);
    calls = 0;
    globalThis.fetch = async () => { calls++; throw new DOMException('Test timeout', 'TimeoutError'); };
    await assert.rejects(() => generateCoachExplanation({}, prepared), /No se ha reintentado automáticamente/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
