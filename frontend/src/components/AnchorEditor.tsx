import { useState } from 'react';
import type { AnchorDraft } from '../types/comparison';
import { ANCHOR_LABELS, anchorsReady } from '../services/comparison';
import type { SuggestedAnchors } from '../types/swing';
import { proposedAnchors } from '../services/equipment';

interface Props {
  id: string;
  anchors: AnchorDraft;
  duration: number;
  time: number;
  onChange: (anchors: AnchorDraft) => void;
  onCapture: () => void;
  onSelect?: (seconds: number) => void;
  suggestion?: SuggestedAnchors;
}

export default function AnchorEditor({ id, anchors, duration, time, onChange, onCapture, onSelect, suggestion }: Props) {
  const [selected, setSelected] = useState<string>('start_ms');
  return (
    <fieldset className="anchor-editor">
      <legend>Marcas para sincronizar</legend>
      <p>Las marcas propuestas automáticamente se pueden corregir. Pausa el vídeo y pulsa <strong>Marcar aquí</strong> o escribe los segundos.</p>
      {(suggestion?.impact_ms != null || !!suggestion?.notes.length) && <details>
        <summary>Cómo se han propuesto estas marcas</summary>
        {suggestion?.impact_ms != null && <p className="note">{suggestion.impact_refined
          ? 'Impacto aproximado con ayuda de palo y bola; revisa la marca.'
          : 'Impacto aproximado por la postura corporal; revisa el momento de contacto en el vídeo.'}</p>}
        {suggestion?.notes.map(note => <p className="note" key={note}>{note}</p>)}
        {!!suggestion?.refinement_frames && <p className="note">Se han revisado {suggestion.refinement_frames} fotogramas originales alrededor del impacto.
          {suggestion.impact_refined ? ' Propuesta ajustada con detecciones de palo y bola.' : ' No se ha podido precisar el contacto con palo y bola.'}</p>}
      </details>}
      <button type="button" className="secondary" disabled={!Object.keys(proposedAnchors(suggestion)).length}
        onClick={() => onChange(proposedAnchors(suggestion))}>Restaurar propuesta automática</button>
      <div className="anchor-grid">
        {ANCHOR_LABELS.map(([key, label], index) => (
          <div key={key} className={`anchor-item ${selected === key ? 'is-active' : ''} ${anchors[key] === undefined ? 'is-pending' : 'is-marked'}`}>
            <div className="anchor-item-heading">
              <button type="button" className="anchor-select" aria-pressed={selected === key}
                onClick={() => { setSelected(key); if (anchors[key] !== undefined) onSelect?.(anchors[key]! / 1000); }}>
                <span className="anchor-order">{String(index + 1).padStart(2, '0')}</span><span>{label}</span>
              </button>
              <span className="anchor-state">{anchors[key] === undefined ? 'Pendiente' : 'Marcada'}</span>
            </div>
            <label htmlFor={`${id}-${key}`} className="sr-only">{label} (s)</label>
            <input id={`${id}-${key}`} type="number" min="0" max={duration} step="0.001"
              value={anchors[key] === undefined ? '' : anchors[key]! / 1000}
              onFocus={() => setSelected(key)}
              onChange={event => onChange({ ...anchors, [key]: event.target.value === '' ? undefined : Math.round(Number(event.target.value) * 1000) })} />
            <button type="button" className="secondary" aria-label={`Marcar ${label.toLowerCase()} aquí`}
              onClick={() => { setSelected(key); onCapture(); onChange({ ...anchors, [key]: Math.min(Math.round(duration * 1000), Math.round(time * 1000)) }); }}>Marcar aquí</button>
          </div>
        ))}
      </div>
      <p className="note" role="status">{anchorsReady(anchors, duration)
        ? 'Marcas preparadas. Se alinearán esos cuatro momentos con la referencia.'
        : 'Completa las cuatro marcas en orden: inicio < cima < impacto < final, dentro del vídeo.'}</p>
    </fieldset>
  );
}
