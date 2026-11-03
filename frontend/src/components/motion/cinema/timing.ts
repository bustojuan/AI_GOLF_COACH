import type { CinemaFamily } from './types';
export const CINEMA_DURATION: Record<CinemaFamily, number> = {
  'swing-impact': 3600, 'ball-flight': 2100, 'radar-scan': 1800,
  'swing-replay': 2050, 'landing-impact': 1900, 'final-putt': 2400,
};
export const CINEMA_RETURN: Record<CinemaFamily, number> = {
  'swing-impact': 620, 'ball-flight': 680, 'radar-scan': 620,
  'swing-replay': 700, 'landing-impact': 640, 'final-putt': 720,
};
