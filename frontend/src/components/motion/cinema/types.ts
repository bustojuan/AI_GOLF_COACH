import type * as THREE from 'three';
import type { GolfTransition } from '../../../services/golfMotion';

export type CinemaFamily = GolfTransition;
export type FrameCapture = { canvas: HTMLCanvasElement; aspect: number; label: string; source: string; target?: ScreenTarget };
export type ScreenTarget = { x: number; y: number; width: number; height: number };
export type StageInput = {
  family: CinemaFamily; width: number; height: number; mobile: boolean;
  frames: FrameCapture[]; target: ScreenTarget;
  studioVideo?: { element: HTMLVideoElement; bounds: ScreenTarget };
};
export type StageSignal = {
  /** Progress of the meaningful event that opens the next UI (0..1). */
  reveal: number;
  /** A true world-space aperture, used only for the physical hole. */
  aperture?: { center: THREE.Vector3; radius: number };
  /** Optional exact image hand-off at the destination panel. */
  mediaBridge?: boolean;
  diagnostics?: Record<string, number | string | boolean>;
};
export type CinemaRig = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  ball: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  ballRadius: number; key: THREE.DirectionalLight;
};
export interface CinemaStage {
  root: THREE.Group;
  start(input: StageInput): void;
  frame(progress: number): StageSignal;
  stop(): void;
  dispose(): void;
}

export const clamp = (t: number) => Math.max(0, Math.min(1, t));
export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const range = (t: number, from: number, to: number) => clamp((t - from) / (to - from));
