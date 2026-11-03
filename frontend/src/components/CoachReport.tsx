import { useEffect, useRef, useState } from 'react';
import type { CoachStatus, GeneratedRecommendation, PreparedRecommendation, RecommendationRequest, ReportMetric } from '../types/recommendation';
import { generateCoachExplanation, getCoachStatus, prepareCoachReport } from '../services/api';
import { reportMetricLabel } from '../services/recommendations';
import { scoreLabel, secondsLabel } from '../services/analysis';
import CoachExplanation from './CoachExplanation';
import ComparisonInsights from './ComparisonInsights';
import type { TechnicalAnalysis } from '../types/comparison';

function MetricsTable({ metrics, caption }: { metrics: ReportMetric[]; caption: string }) {
  return <div className="metric-table-wrap"><table className="metric-table report-metrics">
    <caption>{caption}</caption>
    <thead><tr><th>Medida</th><th>Diferencia media</th><th>Instantes con datos</th></tr></thead>
    <tbody>{metrics.map(metric => <tr key={metric.evidence_id}>
      <th scope="row">{metric.label}</th><td>{reportMetricLabel(metric)}</td>
      <td>{metric.samples} / {metric.total_samples}</td>
    </tr>)}</tbody>
  </table></div>;
}

export default function CoachReport({ request, analysis, onSelectPhase }: {
  request: RecommendationRequest; analysis?: TechnicalAnalysis | null; onSelectPhase: (key: string) => void;
}) {
  const [status, setStatus] = useState<CoachStatus | null>(null);
  const [report, setReport] = useState<PreparedRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [generated, setGenerated] = useState<GeneratedRecommendation | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const pendingStatus = useRef<AbortController | null>(null);
  const pendingGeneration = useRef<AbortController | null>(null);

  useEffect(() => {
    void refreshStatus();
    return () => { pendingStatus.current?.abort(); pending.current?.abort(); pendingGeneration.current?.abort(); };
  }, []);

  async function refreshStatus() {
    pendingStatus.current?.abort();
    const controller = new AbortController();
    pendingStatus.current = controller;
    setCheckingStatus(true); setStatus(null); setStatusError('');
    try {
      const data = await getCoachStatus(controller.signal);
      if (!controller.signal.aborted) setStatus(data);
    } catch {
      if (!controller.signal.aborted) setStatusError('No se ha podido consultar el estado. Puedes intentar preparar el informe.');
    } finally { if (!controller.signal.aborted) { setCheckingStatus(false); pendingStatus.current = null; } }
  }

  async function prepare() {
    if (pending.current || generating) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError(''); setReport(null); setGenerated(null); setGenerationError('');
    try {
      const prepared = await prepareCoachReport(request, controller.signal);
      if (!controller.signal.aborted) setReport(prepared);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No se pudo preparar el informe.');
    } finally { if (!controller.signal.aborted) { setLoading(false); pending.current = null; } }
  }

  async function generate() {
    if (!report || status?.enabled !== true || loading || pendingGeneration.current) return;
    const controller = new AbortController();
    pendingGeneration.current = controller;
    setGenerating(true); setGenerated(null); setGenerationError('');
    try {
      const explanation = await generateCoachExplanation(request, report, controller.signal);
      if (!controller.signal.aborted) setGenerated(explanation);
    } catch (error) {
      if (!controller.signal.aborted) setGenerationError(error instanceof Error ? error.message : 'No se pudo generar la explicación.');
    } finally { if (!controller.signal.aborted) { setGenerating(false); pendingGeneration.current = null; } }
  }

  return <section className="coach-report" aria-labelledby="coach-report-title">
    <div className="report-dashboard-hero"><div className="report-dashboard-copy">
      <span className="step">07 / INFORME DE RENDIMIENTO</span>
      <h3 id="coach-report-title">Tu informe<br /><em>de swing.</em></h3>
      <p>Consulta el ritmo, las diferencias observadas y el resumen de tus mediciones.</p>
      <div className="process-action" aria-busy={loading}>
        <button type="button" disabled={loading || generating} onClick={() => void prepare()}>
          {loading ? 'Preparando informe…' : report ? 'Actualizar informe' : 'Preparar informe'}
        </button>
        <p role="status">{loading ? 'Reuniendo las mediciones guardadas…' : 'Informe local · sin llamadas al modelo'}</p>
      </div>
    </div><div className="report-dashboard-score"><span>SEMEJANZA CON ESTA REFERENCIA</span>
      <strong>{scoreLabel(analysis?.similarity_score ?? null)}</strong><p>Calculada con las fases disponibles.</p>
    </div></div>
    {error && <p className="error report-error" role="alert">{error}</p>}
    {generated && report && <CoachExplanation generated={generated} prepared={report} />}
    {analysis && <ComparisonInsights analysis={analysis} onSelectPhase={onSelectPhase} showTempo={!generated} />}
    {report && <div className="prepared-report" aria-live="polite">
      <p className="report-label">Informe preparado · Datos de la aplicación · No generado por IA</p>
      <h4>Resumen general de datos</h4>
      <p>{report.local_summary}</p>
      <div className="report-overview">
        <p>Semejanza experimental <strong>{scoreLabel(report.data.similarity_score)}</strong></p>
        <p>Fases con puntuación <strong>{report.data.scored_phases} / {report.data.total_phases}</strong></p>
        <p>Medidas generales <strong>{report.data.overall_metrics.filter(metric => metric.difference != null).length} / {report.data.overall_metrics.length}</strong></p>
      </div>
      <p>Una puntuación parcial describe las medidas observadas. Las diferencias no indican por sí solas errores técnicos ni quién flexiona más o menos.</p>
      <details className="report-general-metrics"><summary>Mediciones del resumen general</summary>
        <MetricsTable metrics={report.data.overall_metrics} caption="Diferencias medias de todo el movimiento seleccionado" />
      </details>
      <h4>Datos por fase</h4>
      <div className="report-phases">{report.data.phases.map((phase, index) => <details key={phase.key} open={index === 0}>
        <summary>{phase.label} · {scoreLabel(phase.similarity_score)}</summary>
        <p>Tu vídeo: {secondsLabel(phase.user_start_ms)} – {secondsLabel(phase.user_end_ms)} · Referencia: {secondsLabel(phase.reference_start_ms)} – {secondsLabel(phase.reference_end_ms)}</p>
        <p>{phase.available_score_metrics} de {phase.total_score_metrics} medidas de puntuación disponibles.
          Cobertura mínima entre medidas: {Math.round(phase.minimum_metric_coverage * 100)} %. Es disponibilidad, no precisión.</p>
        {!!phase.warnings.length && <ul className="warnings">{phase.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
        <MetricsTable metrics={phase.metrics} caption={`Datos preparados de ${phase.label}`} />
      </details>)}</div>
      <details><summary>Momentos clave y ritmo incluidos</summary>
        <ul>{report.data.moments.map(moment => <li key={moment.key}>{moment.label}: tu vídeo {secondsLabel(moment.user_start_ms)} · referencia {secondsLabel(moment.reference_start_ms)}.</li>)}</ul>
        <p>Relación backswing / bajada: tu swing {report.data.user_backswing_downswing_ratio.toFixed(2)} · referencia {report.data.reference_backswing_downswing_ratio.toFixed(2)}. No se fija un ritmo ideal.</p>
      </details>
      <details className="report-json"><summary>Datos que recibiría el modelo</summary>
        <p>Solo estas métricas y su contexto. Preparar el informe no las envía fuera del backend local.
          {generated && ' Son los datos utilizados para generar la explicación mostrada.'}</p>
        <pre tabIndex={0}>{JSON.stringify(report.data, null, 2)}</pre>
      </details>
      {!generated && <p className="note">El informe destacará tus puntos fuertes y prioridades de mejora, seguidos de siete etapas con ejercicios prácticos cuando haya fundamento.
        Todavía no se han generado recomendaciones.</p>}
    </div>}
    <section className="coach-ai" aria-labelledby="coach-ai-title">
    <h4 id="coach-ai-title">Explicación con IA</h4>
    <p>Prepara los datos del informe para solicitar una explicación general y por fases cuando la conexión esté habilitada.</p>
    <p className="coach-status" role="status"><strong>{status ? status.enabled ? 'Conexión configurada' : 'IA todavía sin activar' : statusError ? 'Estado no disponible' : 'Consultando el estado de IA…'}</strong>
      <span>{status?.message ?? statusError}</span></p>
    <button className="secondary coach-status-refresh" type="button" disabled={checkingStatus || loading || generating} onClick={() => void refreshStatus()}>
      {checkingStatus ? 'Consultando estado…' : 'Actualizar estado de IA'}
    </button>
    <p className="note">Preparar informe no consulta ningún modelo. Generar una explicación enviará las métricas al proveedor configurado.
      Los vídeos, imágenes, monigotes y nombres de archivo quedan fuera.</p>
    <div className="coach-generation" aria-busy={generating}>
      <button type="button" disabled={!report || status?.enabled !== true || loading || generating}
        aria-describedby="coach-generation-help" onClick={() => void generate()}>
        {generating ? 'Generando explicación…' : generated ? 'Volver a generar explicación' : 'Generar explicación con IA'}
      </button>
      <p id="coach-generation-help" role="status">{generating ? 'Esperando la respuesta del modelo. No se reintentará automáticamente.'
        : status?.enabled !== true ? 'Disponible cuando se active la conexión en el backend. Puedes seguir preparando y revisando el informe local.'
        : !report ? 'Prepara el informe antes de solicitar una explicación.'
        : 'Solo al pulsar el botón se solicitará la explicación al proveedor. Puede tener coste de uso.'}</p>
      {generationError && <p className="error generation-error" role="alert">{generationError} El informe local sigue disponible.</p>}
    </div>
    </section>
  </section>;
}
