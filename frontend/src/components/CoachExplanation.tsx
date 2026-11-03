import { useId } from 'react';
import type { GeneratedRecommendation, PreparedRecommendation } from '../types/recommendation';
import { COACH_STAGE_LABELS } from '../services/recommendations';
import CoachStageFigure from './CoachStageFigure';
import SwingTempo from './SwingTempo';

function ReportIcon({ kind }: { kind: 'check' | 'flag' | 'practice' }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'check' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>
      : kind === 'flag' ? <><path d="M6 21V3l13 4-13 5" /><path d="M3 21h10" /></>
      : <><path d="m5 18 5-5m0 0 3-9m-3 9 9 1" /><circle cx="7" cy="6" r="2" /><path d="M3 21h18" /></>}
  </svg>;
}

export default function CoachExplanation({ generated, prepared }: {
  generated: GeneratedRecommendation; prepared: PreparedRecommendation;
}) {
  const { strengths, priorities, stages } = generated.response;
  const prefix = useId();
  const stageId = (key: string) => `${prefix}-stage-${key}`;

  return <section className="coach-explanation" aria-labelledby="coach-explanation-title" aria-live="polite">
    <div className="report-hero">
      <div className="report-hero-copy"><p className="explanation-label">Explicación generada por IA</p>
        <h4 id="coach-explanation-title">Tu siguiente<br /><em>gran swing.</em></h4>
        <p>Conserva lo que funciona. Trabaja una cosa cada vez.<br />Lleva tu próximo paso al campo.</p>
        <a className="report-hero-link" href={`#${stageId('address')}`}>Recorre tu swing <span aria-hidden="true">↘</span></a>
      </div>
      <svg className="report-hero-green" viewBox="0 0 300 230" aria-hidden="true">
        <path d="M22 174C-22 115 53 23 122 41c43 11 54-33 113-5 72 35 64 129 18 164-52 40-195 23-231-26Z" fill="#2e6652" />
        <path d="M46 168C16 124 67 56 122 69c53 12 59-30 105-9 50 23 50 100 9 124-45 27-165 20-190-16Z" fill="#387a5a" />
        <path d="M72 160C49 127 85 83 128 93c44 9 55-22 87-8 35 16 33 67 3 83-33 19-127 13-146-8Z" fill="#4c9462" />
        <ellipse cx="191" cy="145" rx="12" ry="4" fill="#123c2f" /><path d="M191 144V45l46 15-46 17" fill="none" stroke="#e1edc8" strokeWidth="3" strokeLinejoin="round" />
        <path d="m193 47 42 13-42 15" fill="#c7ef89" />
        <path d="M58 184C70 95 110 144 181 145" fill="none" stroke="#c5e5a2" strokeWidth="1.5" strokeDasharray="4 6" opacity=".7" />
        <g className="report-hero-ball"><circle cx="58" cy="182" r="10" fill="#f4fae9" /><circle cx="55" cy="180" r="1" fill="#b2c6ad" /><circle cx="60" cy="178" r="1" fill="#b2c6ad" /><circle cx="61" cy="184" r="1" fill="#b2c6ad" /><circle cx="55" cy="185" r="1" fill="#b2c6ad" /></g>
      </svg>
    </div>
    <div className="explanation-overview">
      <div className="explanation-strengths"><div className="report-section-heading"><span className="report-section-icon"><ReportIcon kind="check" /></span>
        <div><span className="report-eyebrow">ESTO VA CONTIGO</span><h5>Tus puntos fuertes</h5></div></div>
        {strengths.length ? <ol>{strengths.map((strength, index) => <li key={`${strength.stage_key}-${index}`}>
          <span className="strength-number" aria-hidden="true">0{index + 1}</span>
          <h6>{COACH_STAGE_LABELS[strength.stage_key]}</h6><p>{strength.observation}</p>
        </li>)}</ol> : <p>Todavía no hay información suficiente para destacar un punto fuerte.</p>}
      </div>
      <div className="explanation-review"><div className="report-section-heading"><span className="report-section-icon"><ReportIcon kind="flag" /></span>
        <div><span className="report-eyebrow">TU PRÓXIMA SESIÓN</span><h5>Prioridades de mejora</h5></div></div>
        {priorities.length ? <ol>{priorities.map((point, index) => <li key={`${point.stage_key}-${index}`}>
          <span className="priority-number">{String(index + 1).padStart(2, '0')}</span>
          <div className="priority-content"><h6>{COACH_STAGE_LABELS[point.stage_key]}</h6><p>{point.observation}</p>
            <div className="priority-practice"><strong>Cómo trabajarlo</strong><p>{point.recommendation}</p></div>
          </div>
        </li>)}</ol> : <p>No hay aspectos que priorizar con la información disponible.</p>}
      </div>
    </div>
    <SwingTempo userRatio={prepared.data.user_backswing_downswing_ratio}
      referenceRatio={prepared.data.reference_backswing_downswing_ratio} phases={prepared.data.phases} />
    <div className="report-section-heading report-journey-heading"><span className="report-section-icon"><ReportIcon kind="practice" /></span>
      <div><span className="report-eyebrow">DE LA PREPARACIÓN AL FINAL</span><h5>Tu swing, paso a paso</h5></div>
    </div>
    <nav className="report-stage-nav" aria-label="Etapas del informe">{stages.map((stage, index) => <a key={stage.stage_key} href={`#${stageId(stage.stage_key)}`}>
      <span>{index + 1}</span>{COACH_STAGE_LABELS[stage.stage_key]}</a>)}</nav>
    <div className="explanation-stages">{stages.map((stage, index) => {
      return <article key={stage.stage_key} id={stageId(stage.stage_key)} data-stage={stage.stage_key}>
      <div className="report-stage-heading"><span className="report-stage-number">{String(index + 1).padStart(2, '0')}</span>
        <div><span className="stage-kind">{['address', 'top', 'impact', 'finish'].includes(stage.stage_key) ? 'Momento' : 'Fase'}</span>
          <h6>{COACH_STAGE_LABELS[stage.stage_key]}</h6></div>
      </div>
      <div className="report-stage-body">
        <CoachStageFigure stageKey={stage.stage_key} view={prepared.data.view} />
        <div className="report-stage-coaching"><p className="stage-intro">{stage.summary}</p>
          {stage.assessment !== 'not_evaluable' && <>
            <div className="stage-good"><strong><span aria-hidden="true">✓</span> Qué haces bien</strong>
              {stage.strengths.length ? <ul>{stage.strengths.map((strength, index) => <li key={index}>{strength}</li>)}</ul>
                : <p>No hay un punto fuerte que destacar en esta etapa.</p>}
            </div>
            <div className="stage-improve"><strong><span aria-hidden="true">↗</span> Qué puedes mejorar</strong>
              {stage.areas_to_review.length ? <ul>{stage.areas_to_review.map((area, index) => <li key={index}>{area}</li>)}</ul>
                : <p>No se ha identificado un aspecto concreto que corregir en esta etapa.</p>}
            </div>
            {stage.recommended_drill && <div className="explanation-drill">
              <span className="drill-icon"><ReportIcon kind="practice" /></span>
              <div><strong>Ejercicio para practicar</strong><p>{stage.recommended_drill}</p>
                <p className="drill-check"><strong>Cómo comprobarlo:</strong> {stage.success_check}</p></div>
            </div>}
          </>}
        </div>
      </div>
    </article>; })}</div>
  </section>;
}
