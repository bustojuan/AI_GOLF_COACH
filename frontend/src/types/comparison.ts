import type { SwingResult, EquipmentFrame } from './swing';

export interface CaptureSetup {
  handedness: 'right' | 'left';
  view: 'face_on' | 'down_the_line';
  club: string;
}
export interface SetupDraft {
  handedness: CaptureSetup['handedness'] | '';
  view: CaptureSetup['view'] | '';
  club: string;
}
export interface SwingAnchors {
  start_ms: number;
  top_ms: number;
  impact_ms: number;
  end_ms: number;
}
export type AnchorDraft = Partial<SwingAnchors>;
export interface ReferenceSummary {
  id: string;
  name: string;
  filename: string;
  setup: CaptureSetup;
  anchors: SwingAnchors;
}
export interface Reference extends ReferenceSummary { swing: SwingResult }
export interface Point2D { x: number; y: number }
export interface NormalizedClub { start: Point2D; end: Point2D }
export interface ComparisonFrame {
  elapsed_ms: number;
  user_time_ms: number;
  reference_time_ms: number;
  user: (Point2D | null)[];
  reference: (Point2D | null)[];
  position_difference: number | null;
  angle_differences: Record<string, number | null>;
  position_joint_count?: number;
  position_details?: Record<string, number | null>;
  user_ball?: Point2D | null;
  reference_ball?: Point2D | null;
  user_club?: NormalizedClub | null;
  reference_club?: NormalizedClub | null;
}
export interface KeyMomentPair {
  key: string;
  label: string;
  user_requested_ms: number;
  reference_requested_ms: number;
  user: EquipmentFrame | null;
  reference: EquipmentFrame | null;
}
export interface ComparisonResult {
  swing_id: string;
  reference_id: string;
  reference_name: string;
  method: 'manual_anchors_linear_2d';
  duration_ms: number;
  user_anchors: SwingAnchors;
  reference_anchors: SwingAnchors;
  frames: ComparisonFrame[];
  metrics: DifferenceMetric[];
  comparable_frames: number;
  warnings: string[];
  key_moments?: KeyMomentPair[];
  compared_joint_count?: number;
  analysis?: TechnicalAnalysis | null;
}

export interface DifferenceMetric {
  key: string;
  label: string;
  unit: 'degrees' | 'torso_lengths';
  mean_difference: number | null;
  samples: number;
}
export interface StageAnalysis {
  key: string;
  label: string;
  kind: 'phase' | 'moment';
  user_start_ms: number;
  user_end_ms: number;
  reference_start_ms: number;
  reference_end_ms: number;
  samples: number;
  metrics: DifferenceMetric[];
  quality: {
    status: 'sufficient' | 'limited' | 'insufficient';
    minimum_metric_coverage: number;
    user_observed_frames: number;
    reference_observed_frames: number;
    reasons: string[];
  };
  similarity_score: number | null;
  score_weight_coverage: number;
}
export interface TechnicalAnalysis {
  version: string;
  similarity_score: number | null;
  score_reasons: string[];
  phases: StageAnalysis[];
  moments: StageAnalysis[];
  user_backswing_downswing_ratio: number;
  reference_backswing_downswing_ratio: number;
  largest_differences: {
    phase_key: string; phase_label: string; metric_key: string; metric_label: string;
    difference: number; unit: DifferenceMetric['unit'];
  }[];
  policy: {
    version: string; weights: Record<string, number>; zero_score_differences: Record<string, number>;
    minimum_metric_coverage: number; minimum_processed_fps: number; minimum_observed_frames: number;
    minimum_motion_range: number; minimum_torso_pixels: number;
    minimum_position_joints: number;
    quality_checks_block_score: boolean;
  };
  limitations: string[];
}
