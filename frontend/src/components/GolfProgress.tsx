import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export default function GolfProgress({ current, labels }: { current: number; labels: string[] }) {
  const previous = useRef(current);
  const [shot, setShot] = useState({ from: current, sequence: 0 });
  useLayoutEffect(() => {
    if (previous.current === current) return;
    const from = previous.current;
    previous.current = current;
    setShot(value => ({ from, sequence: value.sequence + 1 }));
  }, [current]);
  const percentage = (step: number) => `${step / Math.max(1, labels.length - 1) * 100}%`;
  const finished = current === labels.length - 1;
  const direction = current < shot.from ? 'backward' : 'forward';
  const golferStyle = { left: percentage(current), '--shot-from': percentage(shot.from), '--shot-to': percentage(current) } as CSSProperties;

  return <div className={`journey-progress${finished ? ' is-finished' : ''}`} aria-hidden="true">
    <div className="journey-route"><span style={{ width: percentage(current) }} /></div>
    {labels.map((label, index) => <span key={label} className={`journey-stop ${index <= current ? 'visited' : ''}`}
      data-finish={index === labels.length - 1} style={{ left: percentage(index) }} />)}
    <span className="journey-flag" style={{ left: '100%' }}>
      <svg viewBox="0 0 28 38">
        <ellipse cx="14" cy="32" rx="7" ry="2.4" fill="#214a32" />
        <path d="M14 32V3" fill="none" stroke="#34583b" strokeWidth="1.6" />
        <path className="flag-cloth" d="M14 4 26 8 14 14Z" fill="#d5ac49" stroke="#94752c" strokeWidth=".6" />
      </svg>
    </span>
    <span key={shot.sequence} className={`journey-golfer${shot.sequence ? ' is-putting' : ''}`} data-direction={direction} style={golferStyle}>
      <svg viewBox="0 0 48 36">
        <ellipse cx="24" cy="33" rx="9" ry="1.5" fill="#2d593522" />
        <path d="M21.8 20v5l.4 6m4-11v5l-.4 6" fill="none" stroke="#34503b" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M19.5 31.5h3.5m2 0h3.5" fill="none" stroke="#132d22" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M17 12q7-4 14 0l-2 5-1 5h-8l-1-5Z" fill="#578249" stroke="#345c35" strokeWidth=".7" />
        <path d="m21.5 10 2.5 3 2.5-3" fill="#f4f8ef" />
        <rect x="22.4" y="8" width="3.2" height="3" rx="1" fill="#b7805c" />
        <ellipse cx="24" cy="6.7" rx="3.6" ry="3.9" fill="#c99972" />
        <path d="M20 5q0-4 4-4t4 4Z" fill="#f4f8ef" />
        <path d="M19.5 5.2q4.5 1 9 0" fill="none" stroke="#d5e3cc" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M22.6 7h.2m2.4 0h.2" stroke="#4e392b" strokeWidth=".8" strokeLinecap="round" />
        <g className="putt-stroke">
          <path d="m18 14 2 4 4 2m6-6-2 4-4 2" fill="none" stroke="#c99972" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m24 19 7 12" stroke="#7b9290" strokeWidth="1.2" />
          <path d="m24 19 1.5 2.6" stroke="#253b30" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M28.5 31h5" stroke="#253b30" strokeWidth="2.3" strokeLinecap="round" />
        </g>
      </svg>
    </span>
    <span className="journey-ball" style={{ left: percentage(current) }}>
      <svg viewBox="0 0 24 24" style={{ transform: `rotate(${current * 150}deg)` }}>
        <circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#8eac98" />
        {[[8, 5], [13, 4.5], [17, 7], [5, 9], [10, 9], [14.5, 9.5], [19, 12], [6, 14], [10.5, 14], [15, 14.5], [8.5, 18.5], [13.5, 19], [17.5, 17.5]].map(([x, y], index) =>
          <circle key={index} cx={x} cy={y} r="1.15" fill="#dfe9e1" stroke="#bdcdc2" strokeWidth=".35" />)}
      </svg>
    </span>
  </div>;
}
