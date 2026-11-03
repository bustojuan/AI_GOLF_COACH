import copy
import unittest
from dataclasses import replace

import numpy as np

from test_comparisons import make_swing, marks, reference, setup
from app.schemas.comparison import DifferenceMetric, SwingAnchors
from app.services.analysis_config import AnalysisConfig, ScoreRule
from app.services.swing_comparison import compare_swings, line_tilt, normalise_frame
from app.services.swing_analysis import analyse_comparison, phase_score


def moving_swing(duration_ms=3000, bent=False):
    swing = make_swing(duration_ms=duration_ms, bent=bent)
    for index, frame in enumerate(swing.frames):
        frame.landmarks = copy.deepcopy(frame.landmarks)
        offset = 0.12 * np.sin(index / 90 * np.pi * 2)
        for joint in (15, 16):
            frame.landmarks[joint].y += offset
    swing.video.processed_fps = min(30, 90000 / duration_ms)
    return swing


class TechnicalAnalysisTests(unittest.TestCase):
    def test_identical_observed_movements_score_100_and_partition_without_duplicates(self):
        swing = moving_swing()
        analysis = compare_swings(swing, reference(swing), setup(), marks()).analysis
        self.assertEqual(analysis.similarity_score, 100)
        self.assertEqual([phase.samples for phase in analysis.phases], [30, 30, 31])
        self.assertEqual(sum(phase.samples for phase in analysis.phases), 91)
        self.assertTrue(all(phase.similarity_score == 100 for phase in analysis.phases))
        self.assertEqual([moment.user_start_ms for moment in analysis.moments], [0, 1000, 2000, 3000])
        self.assertTrue(all(moment.samples == 1 and moment.similarity_score == 100 for moment in analysis.moments))
        self.assertEqual(analysis.largest_differences, [])

    def test_moment_scores_use_the_marked_pose_and_are_not_added_to_global_score(self):
        swing = moving_swing()
        bent_pose = moving_swing(bent=True).frames[30]
        swing.frames[30].landmarks = copy.deepcopy(bent_pose.landmarks)
        analysis = compare_swings(swing, reference(moving_swing()), setup(), marks()).analysis
        self.assertEqual(analysis.moments[0].similarity_score, 100)
        self.assertLess(analysis.moments[1].similarity_score, analysis.phases[1].similarity_score)
        self.assertEqual(analysis.moments[2].similarity_score, 100)
        expected = round(sum(phase.similarity_score for phase in analysis.phases) / 3, 1)
        self.assertEqual(analysis.similarity_score, expected)
        self.assertEqual(analysis.version, analysis.policy.version)

    def test_missing_moment_pose_has_no_score_while_available_phases_remain_scored(self):
        swing = moving_swing()
        swing.frames[30].landmarks = []
        analysis = compare_swings(swing, reference(moving_swing()), setup(), marks()).analysis
        self.assertIsNone(analysis.moments[1].similarity_score)
        self.assertEqual(analysis.moments[1].quality.status, 'insufficient')
        self.assertTrue(all(metric.mean_difference is None for metric in analysis.moments[1].metrics))
        self.assertTrue(all(phase.similarity_score == 100 for phase in analysis.phases))
        self.assertEqual(analysis.similarity_score, 100)

    def test_known_geometry_reduces_score_and_largest_differences_identify_the_measure(self):
        result = compare_swings(moving_swing(bent=True), reference(moving_swing()), setup(), marks())
        self.assertIsNotNone(result.analysis.similarity_score)
        self.assertLess(result.analysis.similarity_score, 100)
        self.assertGreaterEqual(result.analysis.similarity_score, 0)
        self.assertIn("left_elbow", [item.metric_key for item in result.analysis.largest_differences])
        self.assertAlmostEqual(result.analysis.similarity_score,
                               sum(phase.similarity_score for phase in result.analysis.phases) / 3, places=1)

    def test_missing_joint_is_omitted_and_weight_coverage_is_reported(self):
        swing = moving_swing()
        for frame in swing.frames:
            frame.landmarks[15].visibility = 0
        analysis = compare_swings(swing, reference(moving_swing()), setup(), marks()).analysis
        self.assertEqual(analysis.similarity_score, 100)
        self.assertTrue(all(phase.similarity_score == 100 for phase in analysis.phases))
        self.assertTrue(all(phase.score_weight_coverage == 0.9 for phase in analysis.phases))
        self.assertTrue(all(moment.similarity_score == 100 and moment.score_weight_coverage == 0.9 for moment in analysis.moments))
        self.assertEqual(analysis.phases[0].quality.minimum_metric_coverage, 0)
        self.assertEqual(next(m for m in analysis.phases[0].metrics if m.key == "left_elbow").mean_difference, None)

    def test_lost_middle_phase_does_not_hide_available_first_phase(self):
        swing = moving_swing()
        for frame in swing.frames[30:60]:
            frame.landmarks = []
        analysis = compare_swings(swing, reference(moving_swing()), setup(), marks()).analysis
        self.assertEqual(analysis.phases[0].similarity_score, 100)
        self.assertIsNone(analysis.phases[1].similarity_score)
        self.assertEqual(analysis.phases[1].quality.status, "insufficient")
        self.assertEqual(analysis.similarity_score, 100)  # Media de las dos fases observadas.

    def test_coverage_below_80_percent_warns_without_blocking_score(self):
        swing = moving_swing()
        for frame in swing.frames[:6]:
            frame.landmarks[15].visibility = 0
        analysis = compare_swings(swing, reference(moving_swing()), setup(), marks()).analysis
        self.assertEqual(analysis.phases[0].quality.minimum_metric_coverage, 0.8)
        self.assertIsNotNone(analysis.similarity_score)
        swing.frames[6].landmarks[15].visibility = 0
        analysis = compare_swings(swing, reference(moving_swing()), setup(), marks()).analysis
        self.assertIsNotNone(analysis.phases[0].similarity_score)
        self.assertLess(analysis.phases[0].quality.minimum_metric_coverage, 0.8)
        self.assertTrue(any("cobertura" in reason for reason in analysis.phases[0].quality.reasons))
        self.assertIsNotNone(analysis.phases[1].similarity_score)
        self.assertIsNotNone(analysis.similarity_score)

    def test_static_pose_and_low_sampling_keep_scores_and_quality_warnings(self):
        static = compare_swings(make_swing(), reference(make_swing()), setup(), marks()).analysis
        self.assertEqual(static.similarity_score, 100)  # Semejanza de las posturas, no calidad del swing.
        self.assertTrue(any("recorrido" in reason for reason in static.score_reasons))
        swing = moving_swing()
        swing.video.processed_fps = 10
        analysis = compare_swings(swing, reference(moving_swing()), setup(), marks()).analysis
        self.assertIsNotNone(analysis.similarity_score)
        self.assertTrue(any("por segundo" in reason for reason in analysis.score_reasons))

    def test_repeated_aligned_samples_do_not_count_as_distinct_observed_frames(self):
        swing = moving_swing()
        short = SwingAnchors(start_ms=0, top_ms=1000, impact_ms=1030, end_ms=3000)
        result = compare_swings(swing, reference(moving_swing()), setup(), short)
        phase = result.analysis.phases[1]
        self.assertEqual(phase.samples, 30)
        self.assertEqual(phase.quality.user_observed_frames, 1)
        self.assertIsNotNone(phase.similarity_score)
        self.assertTrue(any("pocos fotogramas" in reason for reason in phase.quality.reasons))
        self.assertIsNotNone(result.analysis.similarity_score)

    def test_different_duration_is_aligned_but_original_timing_is_preserved(self):
        result = compare_swings(moving_swing(), reference(moving_swing(duration_ms=6000)), setup(), marks())
        # El muestreo mantiene fotogramas observados: redondear tiempos a ms
        # puede seleccionar un fotograma anterior, sin inventar interpolaciones.
        self.assertGreater(result.analysis.similarity_score, 99)
        self.assertLessEqual(result.analysis.similarity_score, 100)
        phase = result.analysis.phases[0]
        self.assertEqual(phase.user_end_ms - phase.user_start_ms, 1000)
        self.assertEqual(phase.reference_end_ms - phase.reference_start_ms, 2000)
        self.assertEqual(result.analysis.user_backswing_downswing_ratio, 1)
        uneven = SwingAnchors(start_ms=0, top_ms=1000, impact_ms=1500, end_ms=3000)
        result = compare_swings(moving_swing(), reference(moving_swing()), setup(), uneven)
        self.assertEqual(result.analysis.user_backswing_downswing_ratio, 2)
        self.assertEqual(result.analysis.reference_backswing_downswing_ratio, 1)

    def test_small_person_and_estimated_timestamps_warn_without_blocking_scores(self):
        swing = moving_swing()
        swing.video.width = swing.video.height = 80
        analysis = compare_swings(swing, reference(moving_swing()), setup(), marks()).analysis
        self.assertIsNotNone(analysis.similarity_score)
        self.assertTrue(any("pequeño" in reason for reason in analysis.score_reasons))
        swing = moving_swing()
        swing.warnings = ["Algunos tiempos se estimaron a partir de los FPS; la sincronización puede ser aproximada."]
        analysis = compare_swings(swing, reference(moving_swing()), setup(), marks()).analysis
        self.assertIsNotNone(analysis.similarity_score)
        self.assertTrue(any("estimados" in reason for reason in analysis.score_reasons))

    def test_no_measures_gives_no_score_and_missing_measure_is_not_a_perfect_component(self):
        absent = DifferenceMetric(key="position", label="Posición", unit="torso_lengths", mean_difference=None, samples=0)
        elbow = DifferenceMetric(key="left_elbow", label="Codo", unit="degrees", mean_difference=45, samples=1)
        self.assertIsNone(phase_score([absent], AnalysisConfig()))
        self.assertEqual(phase_score([absent, elbow], AnalysisConfig()), 0)
        elbow.mean_difference = 0
        self.assertEqual(phase_score([absent, elbow], AnalysisConfig()), 100)

    def test_partial_body_positions_are_used_and_flagged(self):
        swing = moving_swing()
        for frame in swing.frames:
            for joint in (25, 26, 27, 28, 29, 30, 31, 32):
                frame.landmarks[joint].visibility = 0
        result = compare_swings(swing, reference(moving_swing()), setup(), marks())
        self.assertEqual(result.frames[0].position_joint_count, 8)
        self.assertEqual(result.analysis.similarity_score, 100)
        self.assertTrue(all(phase.score_weight_coverage == 0.8 for phase in result.analysis.phases))
        self.assertIsNotNone(result.analysis.phases[0].metrics[0].mean_difference)
        self.assertTrue(any("menos de 12" in reason for reason in result.analysis.phases[0].quality.reasons))

    def test_score_policy_can_be_changed_without_changing_geometry_and_remains_bounded(self):
        user, other = moving_swing(bent=True), moving_swing()
        result = compare_swings(user, reference(other), setup(), marks())
        points = lambda swing: [normalise_frame(frame, swing) for frame in swing.frames]
        config = replace(AnalysisConfig(), rules=(ScoreRule("left_elbow", 1, 0.001),))
        analysis = analyse_comparison(result, user, other, points(user), points(other), config)
        self.assertEqual(analysis.similarity_score, 0)
        self.assertEqual(analysis.policy.weights, {"left_elbow": 1})
        for invalid in ((), (ScoreRule("position", -1, 0.5),), (ScoreRule("position", 1, 0),)):
            with self.assertRaises(ValueError):
                AnalysisConfig(rules=invalid)

    def test_2d_tilt_handles_line_direction_and_abstains_for_short_projection(self):
        from app.schemas.comparison import Point2D
        self.assertEqual(line_tilt([Point2D(x=0, y=0), Point2D(x=1, y=1)], 0, 1), 45)
        self.assertIsNone(line_tilt([Point2D(x=0, y=0), Point2D(x=0.01, y=0.01)], 0, 1))
        result = compare_swings(moving_swing(), reference(moving_swing()), setup(), marks())
        self.assertEqual(result.frames[0].angle_differences["shoulder_tilt"], 0)
        self.assertEqual(result.frames[0].angle_differences["hip_tilt"], 0)


if __name__ == "__main__":
    unittest.main()
