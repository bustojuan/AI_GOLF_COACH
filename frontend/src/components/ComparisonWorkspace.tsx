import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SwingResult } from '../types/swing';
import type { AnchorDraft, ComparisonResult, Reference, ReferenceSummary, SetupDraft } from '../types/comparison';
import { ANCHOR_LABELS, anchorsReady, setupReady } from '../services/comparison';
import { compareSwing, createReference, getReference, listReferences, processSwing } from '../services/api';
import { proposedAnchors } from '../services/equipment';
import CaptureSetupFields from './CaptureSetupFields';
import ComparisonPlayer from './ComparisonPlayer';
import CoachReport from './CoachReport';
import SwingPlayer from './SwingPlayer';
import SwingVideoFrame from './SwingVideoFrame';
import VideoSelector from './VideoSelector';
import StepJourney from './StepJourney';
import { ComparisonKeyMoments } from './KeyMoments';
import TechnicalAnalysis from './TechnicalAnalysis';
import AnalysisProgress from './AnalysisProgress';
import type { UploadProgress } from '../services/upload';
import ReferencePilot, { referencePilotEnabled } from './design/ReferencePilot';

export default function ComparisonWorkspace({ swing, src, anchors, onAnchorsChange, upload, processing }: {
  swing: SwingResult | null; src: string; anchors: AnchorDraft; onAnchorsChange: (value: AnchorDraft) => void;
  upload: ReactNode; processing: boolean;
}) {
  const [step, setStep] = useState(0);
  const [references, setReferences] = useState<ReferenceSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState<Reference | null>(null);
  const [setup, setSetup] = useState<SetupDraft>({ handedness: '', view: '', club: '' });
  const [entry, setEntry] = useState<{ signature: string; result: ComparisonResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [referenceSrc, setReferenceSrc] = useState('');
  const [newSwing, setNewSwing] = useState<SwingResult | null>(null);
  const [referenceAnchors, setReferenceAnchors] = useState<AnchorDraft>({});
  const [referenceSetup, setReferenceSetup] = useState<SetupDraft>({ handedness: '', view: '', club: '' });
  const [referenceName, setReferenceName] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [referenceTransfer, setReferenceTransfer] = useState<UploadProgress | null>(null);
  const [seekRequest, setSeekRequest] = useState<{ timeMs: number } | null>(null);
  const [selectedStageKey, setSelectedStageKey] = useState('address');
  const pending = useRef(false);
  const isNew = selectedId === 'new';
  const referenceFile = isNew ? newFile : originalFile;
  const signature = JSON.stringify([swing?.id, anchors, setup, selected?.id]);
  const comparison = entry?.signature === signature ? entry.result : null;
  const busy = processing || detecting || comparing || loading;

  useEffect(() => {
    // Reset analysis state without remounting the upload screen or its studio golfer.
    setStep(0); setSelectedId(''); setSelected(null);
    setSetup({ handedness: '', view: '', club: '' }); setEntry(null);
    setLoading(false); setComparing(false); setDetecting(false); setError('');
    setNewFile(null); setOriginalFile(null); setNewSwing(null);
    setReferenceAnchors({}); setReferenceSetup({ handedness: '', view: '', club: '' });
    setReferenceName(''); setReferenceTransfer(null); setSeekRequest(null); setSelectedStageKey('address');
    pending.current = false;
  }, [swing?.id]);

  useEffect(() => {
    let cancelled = false;
    listReferences().then(items => { if (!cancelled) { setReferences(items); setError(''); } })
      .catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    if (!selectedId || selectedId === 'new' || selected?.id === selectedId) return;
    let cancelled = false;
    setLoading(true); setError('');
    getReference(selectedId).then(reference => { if (!cancelled) setSelected(reference); })
      .catch(error => { if (!cancelled) setError(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, refresh]);

  useEffect(() => {
    if (!referenceFile) { setReferenceSrc(''); return; }
    const url = URL.createObjectURL(referenceFile);
    setReferenceSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [referenceFile]);

  async function detectReference() {
    if (!newFile || pending.current) return;
    pending.current = true; setDetecting(true); setError(''); setNewSwing(null);
    try {
      const result = await processSwing(newFile, setReferenceTransfer);
      setNewSwing(result); setReferenceAnchors(proposedAnchors(result.suggested_anchors));
    } catch (error) { setError(error instanceof Error ? error.message : 'No se ha podido procesar la referencia.'); }
    finally { pending.current = false; setDetecting(false); }
  }

  const referenceReady = isNew
    ? !!newSwing && setupReady(referenceSetup) && !!referenceName.trim()
    : !!selected;
  const selectionReady = !!swing && setupReady(setup) && referenceReady;
  const marksReady = !!swing && anchorsReady(anchors, swing.video.duration_seconds)
    && (!isNew || (!!newSwing && anchorsReady(referenceAnchors, newSwing.video.duration_seconds)));

  async function compare() {
    if (!swing || !setupReady(setup) || !anchorsReady(anchors, swing.video.duration_seconds) || !selectionReady || !marksReady || pending.current) return;
    pending.current = true; setComparing(true); setError(''); setEntry(null);
    try {
      let reference = selected;
      if (isNew && newSwing && setupReady(referenceSetup) && anchorsReady(referenceAnchors, newSwing.video.duration_seconds)) {
        reference = await createReference({ swing_id: newSwing.id, name: referenceName.trim(), setup: referenceSetup, anchors: referenceAnchors });
        setReferences(items => [...items, reference!]); setSelected(reference); setOriginalFile(newFile); setSelectedId(reference.id);
      }
      if (!reference) return;
      const result = await compareSwing({ swing_id: swing.id, reference_id: reference.id, setup, anchors });
      setEntry({ signature: JSON.stringify([swing.id, anchors, setup, reference.id]), result });
      setSeekRequest(null); setSelectedStageKey('address'); setStep(3);
    } catch (error) { setError(error instanceof Error ? error.message : 'No se ha podido comparar.'); }
    finally { pending.current = false; setComparing(false); }
  }

  const steps = [
    { title: 'Sube tu vídeo', description: 'Un swing, una cámara fija y todo tu cuerpo dentro del encuadre.', available: true, content: upload },
    { title: 'Elige la referencia', description: 'Selecciona el movimiento con el que quieres comparar tu swing.', available: !!swing, content: <ReferencePilot
      swing={swing} src={src} selected={selected} referenceSrc={referenceSrc} draftReference={isNew ? newSwing : null} referenceStartMs={referenceAnchors.start_ms}
      setup={setup} active={step === 1} ready={selectionReady} startMs={anchors.start_ms}>
      <section className="card"><h2>¿Cómo has grabado tu swing?</h2>
        <p>Ambos vídeos deben tener la misma perspectiva y mano dominante.</p>
        <CaptureSetupFields id="user" setup={setup} onChange={value => { setSetup(value); setEntry(null); }} disabled={busy} />
      </section>
      <section className="card reference-choice"><h2>Tu vídeo de referencia</h2>
        <div className="reference-selection"><label htmlFor="reference-select">Referencia
          <select id="reference-select" value={selectedId} disabled={busy} onChange={event => {
            setSelectedId(event.target.value); setSelected(null); setOriginalFile(null); setEntry(null); setError('');
          }}><option value="">Selecciona una referencia…</option>
            <option value="new">＋ Subir una nueva referencia</option>
            {references.map(reference => <option key={reference.id} value={reference.id}>{reference.name}</option>)}
          </select></label>
          <button type="button" className="secondary" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Actualizar referencias</button>
        </div>
        {!references.length && <p className="note">Si todavía no tienes referencias, elige «Subir una nueva referencia».</p>}
        {selected && <><p className="reference-info">{selected.name} · {selected.setup.handedness === 'right' ? 'Mano derecha' : 'Mano izquierda'} · {selected.setup.view === 'face_on' ? 'Frontal' : 'Desde atrás'}{selected.setup.club && ' · ' + selected.setup.club}</p>
          <details><summary>Abrir también el vídeo original de la referencia (opcional)</summary>
            <p>La referencia conserva fotogramas y monigotes, pero no el vídeo original. Abre exactamente el archivo que usaste al guardarla para ver el vídeo completo.</p>
            <VideoSelector id="reference-original" title="Original de la referencia" step="VÍDEO LOCAL" file={originalFile} disabled={busy} onSelect={setOriginalFile} />
          </details></>}
        {isNew && <><VideoSelector id="reference-video" title="Sube la referencia" step="REFERENCIA / VÍDEO" file={newFile} disabled={busy} onSelect={file => {
          setNewFile(file); setNewSwing(null); setReferenceTransfer(null); setReferenceAnchors({}); setEntry(null); setError(''); setReferenceName(file?.name.replace(/\.[^.]+$/, '') ?? '');
        }} />
          <div className="process-action"><button type="button" disabled={!newFile || busy} onClick={() => void detectReference()}>{detecting ? 'Procesando referencia…' : 'Procesar referencia'}</button>
            <p role="status">{detecting ? 'Puede tardar hasta cuatro minutos.' : newSwing ? 'Referencia procesada. Revisarás sus marcas en el siguiente paso.' : 'La detección se ejecuta en tu equipo.'}</p></div>
          <AnalysisProgress progress={referenceTransfer} busy={detecting} completed={!!newSwing} />
          <label htmlFor="reference-name">Nombre de la referencia<input id="reference-name" maxLength={100} value={referenceName} disabled={busy} onChange={event => setReferenceName(event.target.value)} /></label>
          <CaptureSetupFields id="reference" setup={referenceSetup} onChange={setReferenceSetup} disabled={busy} />
        </>}
      </section>
    </ReferencePilot> },
    { title: 'Revisa las marcas', description: 'Sitúa el inicio, la cima de la subida, el impacto y el final. Puedes corregir las propuestas automáticas.', available: selectionReady, content: <>
      <fieldset className="marks-lock" disabled={busy}>
        {swing && <SwingPlayer src={src} result={swing} anchors={anchors} active={step === 2} showMoments={false}
          onAnchorsChange={value => { onAnchorsChange(value); setEntry(null); }} title="Las cuatro marcas de tu swing" />}
        {isNew && newSwing && referenceSrc && <SwingPlayer id="reference-editor" src={referenceSrc} result={newSwing}
          anchors={referenceAnchors} onAnchorsChange={setReferenceAnchors} active={step === 2} showMoments={false} title="Las cuatro marcas de la referencia" />}
      </fieldset>
      {selected && <section className="card saved-marks"><h2>Marcas guardadas de {selected.name}</h2>
        <p>Esta referencia ya tiene sus cuatro marcas preparadas.</p><dl>{ANCHOR_LABELS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{(selected.anchors[key] / 1000).toFixed(3)} s</dd></div>)}</dl>
        <SwingVideoFrame swing={selected.swing} src={referenceSrc} timeMs={selected.anchors.start_ms} color="#ffc17c" label="Inicio de la referencia" />
      </section>}
    </> },
    { title: 'Compara los swings', description: 'Tu vídeo y la referencia, sincronizados y con sus monigotes.', available: !!comparison, content: comparison && swing && selected && <ComparisonPlayer
      key={signature} result={comparison} swing={swing} reference={selected.swing} src={src} referenceSrc={referenceSrc} active={step === 3} seekRequest={seekRequest} /> },
    { title: 'Momentos equivalentes', description: 'Observa los cuatro momentos clave de ambos vídeos, uno junto al otro.', available: !!comparison,
      content: comparison && (comparison.key_moments?.length ? <ComparisonKeyMoments moments={comparison.key_moments} /> : <p>No hay miniaturas disponibles para esta comparación.</p>) },
    { title: 'Puntuación final', description: 'Consulta la puntuación general y explora cada fase y momento de tu swing.', available: !!comparison, content: comparison && <>
      {comparison.analysis ? <TechnicalAnalysis analysis={comparison.analysis} frames={comparison.frames} active={step === 5}
        selectedKey={selectedStageKey} onSelectKey={setSelectedStageKey}
        seek={timeMs => setSeekRequest({ timeMs })} viewSelection={() => setStep(3)} />
        : <p>No hay análisis técnico disponible para esta comparación.</p>}
    </> },
    { title: 'Informe', description: 'Entiende el ritmo y las diferencias de tu swing y consulta la explicación de IA cuando esté disponible.', available: !!comparison, content: comparison && setupReady(setup) && <CoachReport key={signature}
      analysis={comparison.analysis} onSelectPhase={key => {
        const phase = comparison.analysis?.phases.find(phase => phase.key === key);
        if (phase) { setSelectedStageKey(key); setSeekRequest({ timeMs: phase.user_start_ms }); setStep(5); }
      }}
      request={{ swing_id: comparison.swing_id, reference_id: comparison.reference_id, setup, anchors: comparison.user_anchors }} /> },
  ];
  const canNext = step === 0 ? !!swing : step === 1 ? selectionReady : step === 2 ? marksReady && selectionReady : !!comparison;
  const help = step === 0 ? swing ? 'Tu vídeo está listo.' : 'Procesa tu vídeo para continuar.'
    : step === 1 ? selectionReady ? 'Referencia preparada. Continúa con las marcas.' : 'Completa las condiciones y elige o procesa una referencia.'
      : step === 2 ? marksReady ? 'Al continuar se sincronizan ambos swings.' : 'Completa las cuatro marcas en orden dentro de cada vídeo.'
        : step === 6 ? 'Puedes volver a cualquier paso para revisar tus datos.' : 'Avanza o vuelve sin perder los resultados.';

  return <div className="workspace-flow" data-ux-pilot={referencePilotEnabled || undefined} data-design="hybrid">
    {error && <p role="alert" className="error error-panel flow-error">{error}</p>}
    <StepJourney steps={steps} current={step} onChange={next => { if (!busy && steps[next]?.available) setStep(next); }} busy={busy}
      canNext={canNext} onNext={() => { if (!busy && canNext) { if (step === 2) void compare(); else setStep(step + 1); } }}
      nextLabel={step === 2 ? isNew ? 'Guardar referencia y comparar' : 'Comparar swings' : 'Siguiente'} help={help} />
  </div>;
}
