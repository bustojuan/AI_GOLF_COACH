import { useEffect, useRef, useState } from 'react';
import type { ReactNode, TouchEvent } from 'react';
import GolfProgress from './GolfProgress';
import GolfTransitionLayer from './motion/GolfTransitionLayer';
import { replayUntilStudioImpact } from '../services/golfMotion';
import { prepareSwingCinema } from './motion/cinema/loader';

export interface JourneyStep { title: string; description: string; content: ReactNode; available: boolean }

export default function StepJourney({ steps, current, onChange, onNext, nextLabel = 'Siguiente', canNext, busy, help }: {
  steps: JourneyStep[]; current: number; onChange: (step: number) => void; onNext: () => void;
  nextLabel?: string; canNext: boolean; busy: boolean; help: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const journey = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const launch = useRef<AbortController | null>(null);
  const navigation = useRef({ busy, canNext, current, onNext });
  navigation.current = { busy, canNext, current, onNext };
  const [awaitingImpact, setAwaitingImpact] = useState(false);
  useEffect(() => {
    menu.current?.removeAttribute('open'); heading.current?.focus({ preventScroll: true });
    if (!heading.current?.getClientRects().length) track.current?.querySelector<HTMLElement>('[aria-hidden="false"]')?.focus({ preventScroll: true });
    track.current?.querySelectorAll<HTMLVideoElement>('.journey-screen[inert] video').forEach(video => {
      if (!video.closest('[data-golf-exit]')) video.pause();
    });
  }, [current]);
  useEffect(() => () => launch.current?.abort(), []);
  useEffect(() => {
    if (!canNext || busy) { launch.current?.abort(); launch.current = null; setAwaitingImpact(false); }
  }, [canNext, busy]);

  function change(next: number) {
    launch.current?.abort(); launch.current = null; setAwaitingImpact(false);
    if (!busy && steps[next]?.available) onChange(next);
  }
  function skipReplay() {
    if (!launch.current) return;
    launch.current.abort(); launch.current = null; setAwaitingImpact(false);
    if (!navigation.current.busy && navigation.current.canNext && navigation.current.current === 0) {
      if (journey.current) { journey.current.dataset.golfSkipNext = 'true'; journey.current.dataset.golfImpactSource = 'skipped'; }
      navigation.current.onNext();
    }
  }
  async function next() {
    if (busy || !canNext || launch.current) return;
    const video = journey.current?.querySelector<HTMLVideoElement>('.studio-motion video');
    if (current !== 0 || !video || matchMedia('(prefers-reduced-motion: reduce)').matches) { onNext(); return; }
    const screen = video.closest<HTMLElement>('.journey-screen');
    if (screen) {
      const frame = video.getBoundingClientRect(), viewport = screen.getBoundingClientRect();
      const visible = Math.max(0, Math.min(frame.bottom, viewport.bottom) - Math.max(frame.top, viewport.top));
      if (visible < frame.height * .55) screen.scrollTo({ top: screen.scrollTop + frame.top - viewport.top - Math.max(0, (viewport.height - frame.height) / 2), behavior: 'instant' });
    }
    const controller = new AbortController(); launch.current = controller; setAwaitingImpact(true);
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const continueIfReady = () => {
      if (!navigation.current.busy && navigation.current.canNext && navigation.current.current === 0) navigation.current.onNext();
    };
    const skip = () => { if (preference.matches) { controller.abort(); continueIfReady(); } };
    const hidden = () => { if (document.hidden) controller.abort(); };
    preference.addEventListener('change', skip);
    document.addEventListener('visibilitychange', hidden);
    try {
      const layer = journey.current?.querySelector<HTMLElement>('.golf-motion-layer');
      if (layer && video.readyState >= 2) await prepareSwingCinema(layer, video);
      if (controller.signal.aborted) return;
      const impact = await replayUntilStudioImpact(video, controller.signal);
      if (controller.signal.aborted) return;
      if (journey.current) {
        journey.current.dataset.golfImpactTime = String(impact.mediaTime);
        journey.current.dataset.golfImpactSource = impact.reason;
      }
      continueIfReady();
    } catch { /* A new navigation cancels this launch, never the user's processing. */ }
    finally {
      preference.removeEventListener('change', skip);
      document.removeEventListener('visibilitychange', hidden);
      if (launch.current === controller) { launch.current = null; setAwaitingImpact(false); }
    }
  }
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) menu.current?.removeAttribute('open');
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.removeAttribute('open'); menu.current.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, []);

  function touchStart(event: TouchEvent) {
    const target = event.target as HTMLElement;
    if (event.touches.length !== 1 || target.closest('button, input, select, textarea, video, a, summary, pre, .metric-table-wrap')) {
      touch.current = null; return;
    }
    touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  function touchEnd(event: TouchEvent) {
    const start = touch.current; touch.current = null;
    if (!start || busy || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && canNext) void next();
    else if (dx > 0 && current > 0) change(current - 1);
  }

  return <div ref={journey} className="journey golf-journey" data-step={current} data-golf-awaiting-impact={awaitingImpact} aria-label="Análisis de swing en siete pasos">
    <div className="journey-heading">
      <a className="brand" href="/" aria-label="AI Golf Coach, inicio">
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="25" rx="13" ry="4" fill="currentColor" opacity=".25" />
          <path d="M15 25V5M15 5l12 4-12 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="7" cy="22" r="2.5" fill="#f8f5e9" /></svg>
        <span className="brand-name">AI GOLF <em>COACH</em></span><span className="brand-edition">PERFORMANCE LAB</span>
      </a>
      <div className="journey-title"><h1 ref={heading} tabIndex={-1}>{steps[current].title}</h1>
        <p className="sr-only">{steps[current].description}</p>
      </div>
      <details className="journey-menu" ref={menu}>
        <summary aria-label={`Ver pasos del análisis. Paso ${current + 1} de ${steps.length}`} title="Ver todos los pasos">
          <span>{String(current + 1).padStart(2, '0')} <span className="step-total">/ {String(steps.length).padStart(2, '0')}</span></span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
        </summary>
    <nav className="journey-nav" aria-label="Pasos del análisis"><ol>
      {steps.map((step, index) => <li key={step.title}>
        <button type="button" disabled={busy || !step.available} aria-current={current === index ? 'step' : undefined}
          aria-label={`${index + 1}. ${step.title}`} onClick={() => { menu.current?.removeAttribute('open'); if (current === 0 && index === 1) void next(); else change(index); }}>
          <span className="journey-number">{String(index + 1).padStart(2, '0')}</span><span>{step.title}</span>
        </button>
      </li>)}
    </ol></nav>
      </details>
    </div>
    <div className="journey-window" onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={() => { touch.current = null; }}>
      <div className="journey-track" ref={track}>
        {steps.map((step, index) => <section key={step.title} className="journey-screen" data-screen={index} tabIndex={-1} inert={current !== index}
          aria-hidden={current !== index} aria-label={step.title}>
          <div className="journey-content"><span className="golf-arrival-edge" aria-hidden="true" />{step.content}</div>
        </section>)}
      </div>
      <GolfTransitionLayer journey={journey} current={current} awaitingImpact={awaitingImpact} skipReplay={skipReplay} />
      <GolfProgress current={current} labels={steps.map(step => step.title)} />
    </div>
    <div className="journey-actions">
      <button type="button" className="secondary" disabled={busy || current === 0} onClick={() => change(current - 1)}>← Anterior</button>
      <p className="sr-only" role="status">{help}</p>
      {awaitingImpact && <span className="sr-only" role="status">Reproduciendo el swing antes de continuar.</span>}
      {current < steps.length - 1 ? <button type="button" disabled={busy || !canNext} aria-busy={awaitingImpact} onClick={() => void next()}>{busy ? 'Espera…' : `${nextLabel} →`}</button>
        : <span className="journey-finish">Último paso</span>}
    </div>
  </div>;
}
