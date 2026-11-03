import type { CaptureSetup, SwingAnchors } from './comparison';

export interface RecommendationRequest {
  swing_id: string;
  reference_id: string;
  setup: CaptureSetup;
  anchors: SwingAnchors;
}
export interface ReportMetric {
  evidence_id: string;
  key: string;
  label: string;
  unit: 'degrees' | 'torso_percent';
  difference: number | null;
  samples: number;
  total_samples: number;
}
export interface ReportStage {
  key: string;
  label: string;
  kind: 'phase' | 'moment';
  user_start_ms: number;
  user_end_ms: number;
  reference_start_ms: number;
  reference_end_ms: number;
  similarity_score: number | null;
  available_score_metrics: number;
  total_score_metrics: number;
  score_weight_coverage: number;
  quality: 'sufficient' | 'limited' | 'insufficient';
  minimum_metric_coverage: number;
  user_observed_frames: number;
  reference_observed_frames: number;
  warnings: string[];
  metrics: ReportMetric[];
}
export interface CoachInput {
  schema_version: 'coach-input-v1';
  language: 'es';
  analysis_version: string;
  handedness: CaptureSetup['handedness'];
  view: CaptureSetup['view'];
  similarity_score: number | null;
  scored_phases: number;
  total_phases: number;
  user_backswing_downswing_ratio: number;
  reference_backswing_downswing_ratio: number;
  overall_metrics: ReportMetric[];
  phases: ReportStage[];
  moments: ReportStage[];
  warnings: string[];
  limitations: string[];
}
export interface PreparedRecommendation {
  status: 'prepared';
  generated_by_ai: false;
  local_only: true;
  report_id: string;
  prompt_version: string;
  local_summary: string;
  data: CoachInput;
}
export interface CoachStatus {
  enabled: boolean;
  provider: 'disabled' | 'gemini';
  message: string;
}

export type CoachStageKey = 'address' | 'backswing' | 'top' | 'downswing' | 'impact' | 'follow_through' | 'finish';
export interface EvidenceCitation {
  evidence_id: string;
  difference: number;
}
export interface StageCoaching {
  stage_key: CoachStageKey;
  assessment: 'evaluated' | 'partial' | 'not_evaluable';
  summary: string;
  strengths: string[];
  areas_to_review: string[];
  recommended_drill: string | null;
  success_check: string | null;
  evidence: EvidenceCitation[];
}
export interface StrengthHighlight {
  stage_key: CoachStageKey;
  observation: string;
  evidence: EvidenceCitation[];
}
export interface PriorityImprovement extends StrengthHighlight {
  recommendation: string;
}
export interface CoachResponseV3 {
  strengths: StrengthHighlight[];
  stages: StageCoaching[];
  priorities: PriorityImprovement[];
}
export interface GeneratedRecommendation {
  status: 'generated';
  generated_by_ai: true;
  report_id: string;
  response: CoachResponseV3;
}
