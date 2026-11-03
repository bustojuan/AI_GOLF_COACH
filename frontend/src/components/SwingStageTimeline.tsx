import type { StageAnalysis } from '../types/comparison';

export default function SwingStageTimeline({ stages, selected, onSelect }: {
  stages: StageAnalysis[]; selected: string | undefined; onSelect: (stage: StageAnalysis) => void;
}) {
  return <nav className="swing-stage-timeline" aria-label="Navegar por las etapas del vídeo">{stages.map((stage, index) => <button
    type="button" key={stage.key} data-stage={stage.key} aria-pressed={selected === stage.key} onClick={() => onSelect(stage)}>
    <span className="timeline-step-number">{String(index + 1).padStart(2, '0')}</span>
    <span className="timeline-step-copy"><small>{stage.kind === 'phase' ? 'Fase' : 'Momento'}</small>{stage.label}</span>
    <span className="timeline-step-line" aria-hidden="true" />
  </button>)}</nav>;
}
