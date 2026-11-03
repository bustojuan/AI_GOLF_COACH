import { heroClubTrail, heroFrameAtTime, validHeroPoint } from '../../services/heroTracking';
import type { HeroClip, HeroJoint } from '../../services/heroTracking';

const segments: [HeroJoint, HeroJoint][] = [['left_shoulder', 'right_shoulder'], ['left_hip', 'right_hip']];

export default function TrackingOverlay({ clip, time, reveal = 1 }: { clip: HeroClip; time: number; reveal?: number }) {
  const frame = heroFrameAtTime(clip, time);
  const trail = heroClubTrail(clip, time);
  return <svg className="hero-tracking-overlay" viewBox={`0 0 ${clip.width} ${clip.height}`} style={{ opacity: reveal }}
    aria-label="Puntos corporales detectados en el fotograma de la demostración" role="img" data-media-time={time.toFixed(4)} data-sample-time={frame?.time ?? ''}>
    {frame && <g>{segments.map(([a, b]) => {
      const start = frame.joints[a], end = frame.joints[b];
      return validHeroPoint(start) && validHeroPoint(end) ? <line key={a} x1={start.x * clip.width} y1={start.y * clip.height}
        x2={end.x * clip.width} y2={end.y * clip.height} /> : null;
    })}
      {Object.entries(frame.joints).map(([key, point]) => validHeroPoint(point)
        ? <circle data-joint={key} key={key} cx={point.x * clip.width} cy={point.y * clip.height} r={clip.width / 230} /> : null)}
      {frame.club && validHeroPoint(frame.club.head) && validHeroPoint(frame.club.grip) && <line className="hero-club"
        x1={frame.club.grip.x * clip.width} y1={frame.club.grip.y * clip.height} x2={frame.club.head.x * clip.width} y2={frame.club.head.y * clip.height} />}
    </g>}
    {trail.length > 1 && <polyline className="hero-club-trail" points={trail.map(point => `${point.x * clip.width},${point.y * clip.height}`).join(' ')} />}
  </svg>;
}
