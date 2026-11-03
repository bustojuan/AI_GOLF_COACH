import { useEffect, useState } from 'react';
import VideoSelector from './components/VideoSelector';
import { processSwing } from './services/api';
import type { SwingResult } from './types/swing';
import type { AnchorDraft } from './types/comparison';
import ComparisonWorkspace from './components/ComparisonWorkspace';
import { proposedAnchors } from './services/equipment';
import type { UploadProgress } from './services/upload';
import AnalysisProgress from './components/AnalysisProgress';
import LandingExperience from './components/LandingExperience';
import StudioLanding from './components/landing/StudioLanding';

const previousLanding = new URLSearchParams(window.location.search).get('portada') === 'anterior';
const Landing = previousLanding ? LandingExperience : StudioLanding;

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState<SwingResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [anchors, setAnchors] = useState<AnchorDraft>({});
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(next: File | null) {
    setFile(next);
    setResult(null);
    setAnchors({});
    setError('');
    setUploadProgress(null);
  }

  async function processVideo() {
    if (!file || processing) return;
    setProcessing(true);
    setError('');
    setResult(null);
    setAnchors({});
    try { const processed = await processSwing(file, setUploadProgress); setResult(processed); setAnchors(proposedAnchors(processed.suggested_anchors)); }
    catch (error) { setError(error instanceof Error ? error.message : 'No se ha podido procesar el vídeo.'); }
    finally { setProcessing(false); }
  }

  return (
    <div className={`app performance-app${previousLanding ? '' : ' studio-mode'}`}>
      <main>
        <ComparisonWorkspace swing={result} src={preview} anchors={anchors}
          onAnchorsChange={setAnchors} processing={processing} upload={<Landing preview={preview} result={result} busy={processing}>
        <VideoSelector file={file} disabled={processing} onSelect={selectFile} variant={previousLanding ? 'default' : 'studio'} />
        {(previousLanding || file) && <div className="process-action" aria-busy={processing}>
          <button type="button" disabled={!file || processing} onClick={() => void processVideo()}>
            {processing ? 'Procesando vídeo…' : 'Detectar movimiento'}<span className="button-arrow" aria-hidden="true">↗</span>
          </button>
          {!processing && <p>La detección se ejecuta en tu equipo.</p>}
        </div>}
        <AnalysisProgress progress={uploadProgress} busy={processing} completed={!!result} />
        {error && <p className="error error-panel" role="alert">{error}</p>}
        {result && previousLanding && <p className="upload-success" role="status">✓ Vídeo procesado. Continúa para elegir la referencia.</p>}
        </Landing>} />
      </main>
    </div>
  );
}
