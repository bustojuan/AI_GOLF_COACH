import type { SwingResult } from '../types/swing';
import type { CaptureSetup, ComparisonResult, Reference, ReferenceSummary, SwingAnchors } from '../types/comparison';
import type { CoachStatus, PreparedRecommendation, RecommendationRequest } from '../types/recommendation';
import { readGeneratedReport } from './recommendations.ts';
import { uploadVideo } from './upload.ts';
import type { UploadProgress } from './upload.ts';

export async function processSwing(file: File, onProgress?: (value: UploadProgress) => void): Promise<SwingResult> {
  if (onProgress) {
    const { ok, status, data } = await uploadVideo(file, onProgress);
    if (!ok) throw new Error(typeof data?.detail === 'string' ? data.detail : `No se ha podido procesar el vídeo (HTTP ${status}).`);
    if (!data || data.status !== 'completed' || !Array.isArray(data.frames) || !data.video) throw new Error('El backend ha devuelto un resultado no válido.');
    return data as SwingResult;
  }
  const form = new FormData();
  form.append('file', file);
  let response: Response;
  try {
    response = await fetch('/api/swings', {
      method: 'POST', body: form, signal: AbortSignal.timeout(300_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('La espera ha terminado. Prueba un vídeo más corto; el backend puede seguir terminando la petición anterior.');
    }
    throw new Error('No se puede conectar. Comprueba que el backend esté iniciado en el puerto 8000.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof data?.detail === 'string' ? data.detail : `No se ha podido procesar el vídeo (HTTP ${response.status}).`);
  }
  if (!data || data.status !== 'completed' || !Array.isArray(data.frames) || !data.video) {
    throw new Error('El backend ha devuelto un resultado no válido.');
  }
  return data as SwingResult;
}
async function requestJson<T>(path: string, body?: unknown, signal?: AbortSignal, timeoutMs = 15000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs), cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('La espera del backend ha terminado. No se ha reintentado automáticamente; la solicitud anterior podría seguir procesándose.');
    }
    throw new Error('No se puede conectar. Comprueba que el backend esté iniciado.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : data?.detail?.[0]?.msg;
    throw new Error(detail || `Error del backend (HTTP ${response.status}).`);
  }
  if (data === null) throw new Error('Respuesta del backend no válida.');
  return data as T;
}

export async function listReferences() {
  return requestJson<ReferenceSummary[]>('/api/references');
}
export async function getReference(id: string) {
  return requestJson<Reference>(`/api/references/${encodeURIComponent(id)}`);
}
export async function createReference(body: {
  swing_id: string; name: string; setup: CaptureSetup; anchors: SwingAnchors;
}) {
  return requestJson<Reference>('/api/references', body);
}
export async function compareSwing(body: {
  swing_id: string; reference_id: string; setup: CaptureSetup; anchors: SwingAnchors;
}) {
  return requestJson<ComparisonResult>('/api/comparisons', body);
}

export function getCoachStatus(signal?: AbortSignal) {
  return requestJson<CoachStatus>('/api/recommendations/status', undefined, signal);
}
export async function prepareCoachReport(body: RecommendationRequest, signal?: AbortSignal) {
  const report = await requestJson<PreparedRecommendation>('/api/recommendations/preview', body, signal);
  if (report.status !== 'prepared' || report.generated_by_ai !== false || report.local_only !== true
    || !Array.isArray(report.data?.phases) || report.data.phases.length !== 3 || !Array.isArray(report.data.overall_metrics)) {
    throw new Error('El backend ha devuelto un informe preparado no válido.');
  }
  return report;
}

export async function generateCoachExplanation(body: RecommendationRequest, prepared: PreparedRecommendation, signal?: AbortSignal) {
  // El backend reconstruye las mediciones; el navegador solo envía IDs y marcas.
  // La espera supera los 60 s del proveedor más el cálculo de la comparación.
  const response = await requestJson<unknown>('/api/recommendations', body, signal, 90000);
  return readGeneratedReport(response, prepared);
}
