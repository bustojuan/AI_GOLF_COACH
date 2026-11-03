export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
  presence: number;
}

export interface ImagePoint { x: number; y: number }
export interface ClubSegment { start: ImagePoint; end: ImagePoint }
export interface EquipmentFrame {
  timestamp_ms: number;
  ball?: ImagePoint | null;
  club?: ClubSegment | null;
  preview_jpeg?: string | null;
}

export interface SuggestedAnchors {
  start_ms?: number | null;
  top_ms?: number | null;
  impact_ms?: number | null;
  end_ms?: number | null;
  notes: string[];
  refinement_frames: number;
  impact_refined: boolean;
}

export interface PoseFrame extends EquipmentFrame {
  landmarks: Landmark[];
  low_visibility: boolean;
}

export interface SwingResult {
  id: string;
  filename: string;
  status: 'completed';
  video: {
    width: number;
    height: number;
    fps: number;
    duration_seconds: number;
    processed_fps: number;
  };
  visibility_threshold: number;
  detected_frames: number;
  frames: PoseFrame[];
  warnings: string[];
  analysis_version?: number;
  suggested_anchors?: SuggestedAnchors;
  equipment_frames?: EquipmentFrame[];
}
