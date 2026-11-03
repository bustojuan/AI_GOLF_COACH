import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { playGolfTransition } from './golfChoreography';
import { prepareCinema, disposeCinema } from './cinema/loader';
import { warmSceneMedia } from './cinema/capture';

export default function GolfTransitionLayer({ journey, current, awaitingImpact, skipReplay }: {
  journey: RefObject<HTMLDivElement | null>; current: number; awaitingImpact: boolean; skipReplay: () => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const previous = useRef(current);
  const running = useRef<{ cancel: () => void } | null>(null);
  const [skippable, setSkippable] = useState(false);

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const prepare = () => { if (layer.current && !preference.matches) void prepareCinema(layer.current); };
    const timer = window.setTimeout(prepare, 650);
    preference.addEventListener('change', prepare);
    return () => { window.clearTimeout(timer); preference.removeEventListener('change', prepare); };
  }, []);

  useEffect(() => {
    if (journey.current) warmSceneMedia(journey.current);
    if (awaitingImpact && layer.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) void prepareCinema(layer.current);
  }, [current, awaitingImpact, journey]);

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = current;
    if (from === current || !layer.current || !journey.current) return;
    running.current?.cancel();
    running.current = playGolfTransition(journey.current, layer.current, from, current);
  }, [current, journey]);

  useEffect(() => {
    const stage = layer.current;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const hide = () => { if (motion.matches || document.hidden) running.current?.cancel(); };
    const resize = () => running.current?.cancel();
    motion.addEventListener('change', hide);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('resize', resize);
    const observer = new MutationObserver(() => setSkippable(journey.current?.dataset.golfState === 'running'));
    if (journey.current) observer.observe(journey.current, { attributes: true, attributeFilter: ['data-golf-state', 'data-golf-edition'] });
    return () => {
      running.current?.cancel();
      if (stage) disposeCinema(stage);
      motion.removeEventListener('change', hide);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    };
  }, []);
  return <><div ref={layer} className="golf-motion-layer" aria-hidden="true" />
    {(awaitingImpact || skippable) && <button type="button" className="golf-skip-motion"
      onClick={() => { if (awaitingImpact) skipReplay(); else running.current?.cancel(); }}>Omitir animación <span aria-hidden="true">↗</span></button>}
  </>;
}
