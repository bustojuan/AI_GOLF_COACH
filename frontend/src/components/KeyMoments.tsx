import { useMemo } from 'react';
import type { EquipmentFrame, SwingResult } from '../types/swing';
import type { AnchorDraft, KeyMomentPair } from '../types/comparison';
import { ANCHOR_LABELS } from '../services/comparison';
import { previewAtTime } from '../services/equipment';
import EquipmentDrawing from './EquipmentDrawing';

function MomentImage({ frame, label, requested }: { frame: EquipmentFrame | null; label: string; requested: number }) {
  return <figure className="moment-image">
    {frame?.preview_jpeg ? <div className="moment-media">
      <img src={frame.preview_jpeg} alt={label} loading="lazy" />
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label={`Bola y palo en ${label}`}>
        <EquipmentDrawing ball={frame.ball} club={frame.club} width={1000} height={1000} radius={12} />
      </svg>
    </div> : <div className="moment-unavailable">Sin miniatura. Vuelve a procesar el vídeo para obtenerla.</div>}
    <figcaption>{label} · {(requested / 1000).toFixed(3)} s
      {frame && <span>Fotograma observado: {(frame.timestamp_ms / 1000).toFixed(3)} s</span>}
    </figcaption>
  </figure>;
}

export function SwingKeyMoments({ result, anchors, onSeek }: { result: SwingResult; anchors: AnchorDraft; onSeek: (seconds: number) => void }) {
  const items = useMemo(() => ANCHOR_LABELS.map(([key, label]) => ({ key, label, time: anchors[key],
    frame: anchors[key] === undefined ? null : previewAtTime(result, anchors[key]!) })), [result, anchors]);
  return <div className="key-moments-section">
    <h3>Los cuatro momentos de este vídeo</h3>
    <div className="key-moments-grid">{items.map(item => <div key={item.key}>
      {item.time === undefined ? <p>{item.label}: marca pendiente</p> : <>
        <MomentImage frame={item.frame} label={item.label} requested={item.time} />
        <button type="button" className="secondary" onClick={() => onSeek(item.time! / 1000)}>Ver {item.label.toLowerCase()}</button>
      </>}
    </div>)}</div>
  </div>;
}

export function ComparisonKeyMoments({ moments }: { moments: KeyMomentPair[] }) {
  return <div className="key-moments-section"><h3>Momentos equivalentes de ambos vídeos</h3>
    <p className="note">Las miniaturas corresponden al fotograma observado más cercano a cada marca. La animación conserva el movimiento intermedio.</p>
    <div className="paired-moments">{moments.map((moment, index) => <section key={moment.key} data-moment={moment.key}>
      <div className="moment-heading"><span className="moment-index">{String(index + 1).padStart(2, '0')}</span><h4>{moment.label}</h4><span className="moment-heading-note">DOS VISTAS · UN INSTANTE</span></div><div className="moment-pair">
        <MomentImage frame={moment.user} requested={moment.user_requested_ms} label="Tu swing" />
        <MomentImage frame={moment.reference} requested={moment.reference_requested_ms} label="Referencia" />
      </div>
    </section>)}</div>
  </div>;
}
