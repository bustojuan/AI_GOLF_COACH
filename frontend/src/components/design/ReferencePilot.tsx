import { Children, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SwingResult } from '../../types/swing';
import type { Reference, SetupDraft } from '../../types/comparison';
import { previewAtTime } from '../../services/equipment';
import './reference-pilot.css';
import './reference-refined.css';

export const referencePilotEnabled = true;

/** Opt-in presentation only: the workspace continues to own every form and API call. */
export default function ReferencePilot({ children, swing, src, selected, referenceSrc, draftReference, referenceStartMs, setup, active, ready, startMs }: {
  children: ReactNode; swing: SwingResult | null; src: string; selected: Reference | null;
  referenceSrc: string; setup: SetupDraft; active: boolean; ready: boolean; startMs?: number;
  draftReference: SwingResult | null; referenceStartMs?: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const referenceVideo = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [referenceFailed, setReferenceFailed] = useState(false);
  useEffect(() => { if (!active) { video.current?.pause(); referenceVideo.current?.pause(); } }, [active]);
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => { setReferenceFailed(false); }, [referenceSrc]);
  const preview = swing ? previewAtTime(swing, startMs ?? 0)?.preview_jpeg : null;
  const referenceSwing = selected?.swing ?? draftReference;
  const referenceStart = selected?.anchors.start_ms ?? referenceStartMs ?? 0;
  const refPreview = referenceSwing ? previewAtTime(referenceSwing, referenceStart)?.preview_jpeg : null;
  const hasReference = !!referenceSwing || !!referenceSrc;
  const controls = Children.toArray(children);
  const userAspect = swing ? swing.video.width / swing.video.height : .75;
  const referenceAspect = referenceSwing ? referenceSwing.video.width / referenceSwing.video.height : userAspect;
  const perspective = setup.view === 'face_on' ? 'Frontal' : setup.view === 'down_the_line' ? 'Desde atrás' : 'Perspectiva por indicar';
  return <div className="reference-pilot" data-ux-direction="hybrid">
    <div className="pilot-intro">
      <div><p className="pilot-eyebrow">02 / PREPARA TU COMPARACIÓN</p>
        <h2>Tu swing, <em>en buena compañía.</em></h2></div>
      <div className="pilot-intro-help"><p>Prepara la comparación con una grabación desde la misma perspectiva y con la misma mano dominante.</p>
        <button className="pilot-options-shortcut" type="button" onClick={() => document.getElementById('user-handedness')?.focus()}>Ir a las opciones <span aria-hidden="true">↓</span></button>
      </div>
    </div>
    <div className="pilot-workbench">
      <div className="pilot-visual-column">
        <section className="pilot-film" aria-label="Vídeos de esta sesión">
          <div className="pilot-film-heading"><h3>Mesa de comparación</h3><span>VISTA PREVIA · SIN SINCRONIZAR</span></div>
          <div className="pilot-media-pair" data-format={userAspect > 1 && referenceAspect > 1 ? 'landscape' : 'portrait'}>
            <figure className="pilot-user-film">
              <figcaption><span><span className="pilot-channel">01</span> Tu swing</span><span className="pilot-source">VÍDEO LOCAL</span></figcaption>
              <div className="pilot-media-well"><div className="pilot-media" style={{ aspectRatio: userAspect, width: `min(100%, calc(var(--ux-film-height, 320px) * ${userAspect}))` }}>
                {src && !failed ? <video ref={video} src={src} controls playsInline preload="metadata" poster={preview ?? undefined}
                  aria-label="Vista previa de tu swing" onError={() => setFailed(true)}
                  onLoadedMetadata={() => { if (video.current) video.current.currentTime = (startMs ?? 0) / 1000; }} />
                  : preview ? <img src={preview} alt="Fotograma guardado de tu swing" /> : <p>Vista previa no disponible.</p>}
              </div></div><p className="pilot-clip-label" title={swing?.filename}><span className="pilot-dot" />{swing?.filename ?? 'Tu grabación'}<span>{swing ? `${swing.video.width} × ${swing.video.height}` : ''}</span></p>
            </figure>
            <figure className="pilot-reference-film">
              <figcaption><span><span className="pilot-channel">02</span> Referencia</span><span className="pilot-source">{hasReference ? referenceSrc && !referenceFailed ? 'VÍDEO LOCAL' : 'FOTOGRAMA GUARDADO' : 'POR SELECCIONAR'}</span></figcaption>
              <div className="pilot-media-well"><div className={`pilot-media ${!hasReference ? 'pilot-media-empty' : ''}`} style={hasReference
                ? { aspectRatio: referenceAspect, width: `min(100%, calc(var(--ux-film-height, 320px) * ${referenceAspect}))` }
                : { aspectRatio: 'auto', width: '100%' }}>
                {hasReference ? referenceSrc && !referenceFailed ? <video ref={referenceVideo} src={referenceSrc} controls playsInline preload="metadata"
                  poster={refPreview ?? undefined} aria-label="Vista previa de la referencia" onError={() => setReferenceFailed(true)}
                  onLoadedMetadata={() => { if (referenceVideo.current) referenceVideo.current.currentTime = referenceStart / 1000; }} />
                  : refPreview ? <img src={refPreview} alt={`Fotograma guardado de ${selected?.name ?? 'la nueva referencia'}`} /> : <p>Sin fotograma disponible.</p>
                  : <div><span className="pilot-empty-number" aria-hidden="true">02</span><strong>Completa la pareja.</strong><p>Elige un swing guardado o sube tu referencia para verla junto al tuyo.</p><button type="button" onClick={() => document.getElementById('reference-select')?.focus()}>Elegir referencia <span aria-hidden="true">↗</span></button></div>}
              </div></div><p className="pilot-clip-label" title={selected?.name ?? draftReference?.filename}><span className="pilot-dot pilot-dot-reference" />{selected?.name ?? draftReference?.filename ?? 'El siguiente punto de vista'}<span>{referenceSwing ? `${referenceSwing.video.width} × ${referenceSwing.video.height}` : '—'}</span></p>
            </figure>
          </div>
          <dl className="pilot-media-meta">
            <div><dt>Duración de tu clip</dt><dd>{swing ? `${swing.video.duration_seconds.toLocaleString('es-ES', { maximumFractionDigits: 1 })} s` : '—'}</dd></div>
            <div><dt>Encuadre</dt><dd>{perspective}</dd></div>
            <div><dt>Mano dominante</dt><dd>{setup.handedness === 'right' ? 'Derecha' : setup.handedness === 'left' ? 'Izquierda' : 'Por indicar'}</dd></div>
          </dl>
        </section>
      </div>
      <div className="pilot-controls"><div className="pilot-config-heading"><span>CONFIGURACIÓN DE SESIÓN</span></div>
        <div className="pilot-config-step pilot-user-settings">{controls[0]}</div>
        <div className="pilot-config-step">{controls.slice(1)}</div>
        <p className={`pilot-readiness ${ready ? 'is-ready' : ''}`} role="status"><span aria-hidden="true">{ready ? '✓' : '○'}</span>
          {ready ? 'Todo listo para revisar las marcas.' : 'Completa las condiciones y elige una referencia.'}</p>
      </div>
    </div>
  </div>;
}
