"""Preparación y proveedores simulados. Ninguna prueba consulta un LLM."""
import copy
import json
import os
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.recommendation import CoachResponseV3, STAGE_KEYS
from app.services.ai_coach import generate_report, prepare_report, validate_coach_response
from app.services.coach_prompt import build_coach_messages
from app.services.coach_provider import LangChainGeminiProvider
from app.services.errors import ProcessingError
from app.services.swing_comparison import compare_swings
from test_comparisons import make_swing, marks, reference, setup


def simulated_response(prepared):
    stages = []
    for key in STAGE_KEYS:
        source = next((stage for stage in [*prepared.data.phases, *prepared.data.moments] if stage.key == key), None)
        measured = next((metric for metric in source.metrics if metric.difference is not None and metric.samples), None) if source else None
        stages.append({"stage_key": key,
                       "assessment": "not_evaluable" if measured is None else "evaluated" if source.quality == "sufficient" else "partial",
                       "summary": "Respuesta simulada exclusivamente para la prueba.",
                       "strengths": [], "areas_to_review": [],
                       "recommended_drill": None, "success_check": None,
                       "evidence": [] if measured is None else [{"evidence_id": measured.evidence_id, "difference": measured.difference}]})
    return {"strengths": [], "stages": stages, "priorities": []}


class RecommendationContractTests(unittest.TestCase):
    def prepared(self, hidden=()):
        user = make_swing(hidden=hidden)
        result = compare_swings(user, reference(make_swing()), setup(), marks())
        return prepare_report(result, setup())

    def test_real_measurements_preserve_zero_missing_values_and_explicit_units(self):
        user = make_swing(hidden=(15,))
        result = compare_swings(user, reference(make_swing()), setup(), marks())
        result.metrics[0].mean_difference = 0.1
        prepared = prepare_report(result, setup())
        metrics = {metric.key: metric for metric in prepared.data.overall_metrics}
        self.assertEqual(metrics["position"].difference, 10)
        self.assertEqual(metrics["position"].unit, "torso_percent")
        self.assertIsNone(metrics["left_elbow"].difference)
        self.assertEqual(metrics["left_elbow"].samples, 0)
        self.assertEqual(metrics["right_elbow"].difference, 0)
        self.assertGreater(metrics["right_elbow"].samples, 0)
        self.assertFalse(prepared.generated_by_ai)
        self.assertTrue(prepared.local_only)
        self.assertEqual(len(prepared.data.phases), 3)
        self.assertEqual(len(prepared.data.moments), 4)

    def test_prompt_contains_only_report_data_and_explains_unsigned_partial_measurements(self):
        prepared = self.prepared(hidden=(15,))
        messages = build_coach_messages(prepared.data)
        self.assertEqual([role for role, _ in messages], ["system", "human"])
        self.assertEqual(json.loads(messages[1][1]), prepared.data.model_dump())
        for required in ("NO contiene dirección", "torso_percent", "difference=null", "No has visualizado", "CoachResponseV3", "assessment"):
            self.assertIn(required, messages[0][1])
        for obsolete in ("PhaseExplanation", "review_points", "Grupo de respuesta"):
            self.assertNotIn(obsolete, messages[0][1])

    def test_valid_simulated_response_is_accepted_and_bound_to_this_report(self):
        prepared = self.prepared()
        provider = Mock()
        provider.generate.return_value = simulated_response(prepared)
        result = generate_report(prepared, provider)
        self.assertEqual(result.report_id, prepared.report_id)
        self.assertTrue(result.generated_by_ai)
        self.assertEqual([stage.stage_key for stage in result.response.stages],
                         ["address", "backswing", "top", "downswing", "impact", "follow_through", "finish"])
        provider.generate.assert_called_once_with(build_coach_messages(prepared.data))

    def test_invented_wrong_phase_or_changed_evidence_is_rejected(self):
        prepared = self.prepared()
        valid = simulated_response(prepared)
        for change in ("unknown", "wrong_phase", "wrong_value", "empty"):
            raw = copy.deepcopy(valid)
            evidence = raw["stages"][0]["evidence"]
            if change == "unknown":
                evidence[0]["evidence_id"] = "address.not_measured"
            elif change == "wrong_phase":
                evidence[0]["evidence_id"] = evidence[0]["evidence_id"].replace("address", "backswing")
            elif change == "wrong_value":
                evidence[0]["difference"] += 99
            else:
                evidence.clear()
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_coach_response(prepared.data, raw)

    def test_absent_evidence_duplicate_phases_and_invented_response_fields_are_rejected(self):
        prepared = self.prepared(hidden=(15,))
        raw = simulated_response(prepared)
        raw["stages"][2]["evidence"] = [{"evidence_id": "top.left_elbow", "difference": 0}]
        with self.assertRaises(ValueError):
            validate_coach_response(prepared.data, raw)
        raw = simulated_response(prepared)
        raw["stages"][1]["stage_key"] = "address"
        with self.assertRaises(ValueError):
            validate_coach_response(prepared.data, raw)
        raw = simulated_response(prepared)
        raw["invented_score"] = 99
        with self.assertRaises(ValueError):
            validate_coach_response(prepared.data, raw)

    def test_priorities_can_reference_a_moment_and_require_own_evidence_and_maximum_three(self):
        prepared = self.prepared()
        raw = simulated_response(prepared)
        point = {"stage_key": "impact", "observation": "Dato de prueba.", "recommendation": "Revisar el instante.",
                 "evidence": raw["stages"][4]["evidence"]}
        raw["priorities"] = [point]
        self.assertEqual(len(validate_coach_response(prepared.data, raw).priorities), 1)
        raw["priorities"] = [point] * 4
        with self.assertRaises(ValueError):
            validate_coach_response(prepared.data, raw)

    def test_global_strengths_require_own_evidence_and_allow_at_most_three(self):
        prepared = self.prepared()
        raw = simulated_response(prepared)
        strength = {"stage_key": "address", "observation": "La posición de los brazos es un punto favorable.",
                    "evidence": raw["stages"][0]["evidence"]}
        raw["strengths"] = [strength]
        self.assertEqual(len(validate_coach_response(prepared.data, raw).strengths), 1)
        for change in ("too_many", "empty", "wrong_value", "cross_stage", "absent", "long_text"):
            invalid = copy.deepcopy(raw)
            point = invalid["strengths"][0]
            if change == "too_many":
                invalid["strengths"] *= 4
            elif change == "empty":
                point["evidence"] = []
            elif change == "wrong_value":
                point["evidence"][0]["difference"] += 2
            elif change == "cross_stage":
                point["stage_key"] = "finish"
            elif change == "absent":
                point["evidence"][0]["evidence_id"] = "address.absent"
            else:
                point["observation"] = "x" * 801
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_coach_response(prepared.data, invalid)

    def test_an_area_to_improve_requires_a_practical_exercise_and_check(self):
        prepared = self.prepared()
        raw = simulated_response(prepared)
        raw["stages"][1]["areas_to_review"] = ["Trabajar la colocación del brazo en la subida."]
        with self.assertRaises(ValueError):
            validate_coach_response(prepared.data, raw)
        raw["stages"][1].update(recommended_drill="En casa sin palo, ensaya cinco subidas lentas con pausa cómoda.",
                                success_check="Comprueba que puedes parar y volver sin tirones.")
        validate_coach_response(prepared.data, raw)

    def test_v2_output_is_rejected_and_input_keeps_measurement_limits(self):
        prepared = self.prepared()
        raw = simulated_response(prepared)
        self.assertTrue(prepared.data.limitations)
        self.assertNotIn("limitations", CoachResponseV3.model_fields)
        self.assertNotIn("general_summary", CoachResponseV3.model_fields)
        for old_field in ("general_summary", "limitations"):
            with self.assertRaises(ValueError):
                validate_coach_response(prepared.data, {**raw, old_field: "Contrato anterior"})
        prompt = build_coach_messages(prepared.data)[0][1]
        for required in ("No propongas mirar, copiar o comparar el vídeo de referencia", "campo de prácticas", "strengths:", "CoachResponseV3"):
            self.assertIn(required, prompt)

    def test_missing_phase_has_no_fabricated_citation_and_can_still_be_explained(self):
        user = make_swing()
        for frame in user.frames[30:60]:
            frame.landmarks = []
        prepared = prepare_report(compare_swings(user, reference(make_swing()), setup(), marks()), setup())
        raw = simulated_response(prepared)
        self.assertEqual(raw["stages"][3]["evidence"], [])
        self.assertEqual(raw["stages"][3]["assessment"], "not_evaluable")
        self.assertEqual(prepared.data.scored_phases, 2)
        self.assertEqual(len(validate_coach_response(prepared.data, raw).stages), 7)

    def test_assessment_matches_measured_availability_for_moments_and_phases(self):
        prepared = self.prepared()
        prepared.data.moments[0].quality = "sufficient"
        raw = simulated_response(prepared)
        self.assertEqual(raw["stages"][0]["assessment"], "evaluated")
        self.assertEqual(raw["stages"][1]["assessment"], "partial")
        validate_coach_response(prepared.data, raw)
        for index in (0, 1):
            invalid = copy.deepcopy(raw)
            invalid["stages"][index]["assessment"] = "not_evaluable"
            with self.assertRaises(ValueError):
                validate_coach_response(prepared.data, invalid)
        prepared.data.moments.pop(0)
        missing = simulated_response(prepared)
        self.assertEqual(missing["stages"][0]["assessment"], "not_evaluable")
        validate_coach_response(prepared.data, missing)

    def test_not_evaluable_moment_cannot_invent_strengths_areas_practice_or_evidence(self):
        prepared = self.prepared()
        for metric in prepared.data.moments[0].metrics:
            metric.difference, metric.samples = None, 0
        valid = simulated_response(prepared)
        validate_coach_response(prepared.data, valid)
        changes = ({"strengths": ["Inventado"]}, {"areas_to_review": ["Inventado"]},
                   {"recommended_drill": "Práctica inventada", "success_check": "Éxito inventado"},
                   {"assessment": "evaluated"}, {"evidence": [{"evidence_id": "address.position", "difference": 0}]})
        for change in changes:
            raw = copy.deepcopy(valid)
            raw["stages"][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_coach_response(prepared.data, raw)

    def test_practice_requires_a_success_check_and_texts_have_finite_nonempty_limits(self):
        prepared = self.prepared()
        valid = simulated_response(prepared)
        valid["stages"][0].update(recommended_drill="Comparar las posturas guardadas.", success_check="Repetir la comparación en la misma vista.")
        validate_coach_response(prepared.data, valid)
        for field, value in (("summary", " "), ("summary", "x" * 1201),
                             ("strengths", ["x" * 401]), ("areas_to_review", ["a", "b", "c"]),
                             ("recommended_drill", "x" * 601), ("success_check", None)):
            raw = copy.deepcopy(valid)
            raw["stages"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_coach_response(prepared.data, raw)
        for change in ({"general_summary": "x" * 2001}, {"limitations": ["x" * 801]}, {"limitations": [" "]}):
            with self.assertRaises(ValueError):
                validate_coach_response(prepared.data, {**valid, **change})

    def test_seven_ordered_stages_and_unique_stage_evidence_are_required(self):
        prepared = self.prepared()
        valid = simulated_response(prepared)
        for mode in ("missing", "order", "duplicate_evidence", "cross_moment", "overall"):
            raw = copy.deepcopy(valid)
            if mode == "missing":
                raw["stages"].pop()
            elif mode == "order":
                raw["stages"][0], raw["stages"][1] = raw["stages"][1], raw["stages"][0]
            elif mode == "duplicate_evidence":
                raw["stages"][0]["evidence"] *= 2
            elif mode == "cross_moment":
                raw["stages"][2]["evidence"] = raw["stages"][4]["evidence"]
            else:
                raw["stages"][0]["evidence"][0]["evidence_id"] = "overall.position"
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                validate_coach_response(prepared.data, raw)
        with self.assertRaises(ValueError):
            validate_coach_response(prepared.data, {"general_summary": "Antiguo", "phases": [], "review_points": [], "limitations": ["2D"]})

    def test_provider_timeout_invalid_response_and_errors_do_not_expose_sensitive_details(self):
        prepared = self.prepared()
        for failure, code in ((TimeoutError("private-key-value"), 504), (RuntimeError("private-key-value"), 502)):
            provider = Mock()
            provider.generate.side_effect = failure
            with self.subTest(code=code), self.assertRaises(ProcessingError) as caught:
                generate_report(prepared, provider)
            self.assertEqual(caught.exception.status_code, code)
            self.assertNotIn("private-key-value", str(caught.exception))
        provider = Mock()
        provider.generate.return_value = {"bad": "private-key-value"}
        with self.assertRaises(ProcessingError) as caught:
            generate_report(prepared, provider)
        self.assertEqual(caught.exception.status_code, 502)
        self.assertNotIn("private-key-value", str(caught.exception))

    def test_langchain_adapter_is_deferred_and_can_be_checked_with_a_simulated_sdk(self):
        prepared = self.prepared()
        constructor = Mock()
        constructor.return_value.with_structured_output.return_value.invoke.return_value = simulated_response(prepared)
        module = types.ModuleType("langchain_google_genai")
        module.ChatGoogleGenerativeAI = constructor
        with patch.dict("sys.modules", {"langchain_google_genai": module}), patch.dict(os.environ, {
            "GOLF_COACH_AI_MODEL": "test-only-model", "GOLF_COACH_AI_API_KEY": "test-only-key",
        }):
            generated = generate_report(prepared, LangChainGeminiProvider())
        self.assertEqual(generated.report_id, prepared.report_id)
        self.assertEqual(constructor.call_args.kwargs["max_retries"], 0)
        self.assertEqual(constructor.call_args.kwargs["timeout"], 60)
        self.assertEqual(constructor.call_args.kwargs["max_tokens"], 8192)
        constructor.return_value.with_structured_output.assert_called_once_with(CoachResponseV3, method="json_schema")
        self.assertFalse(constructor.call_args.kwargs["vertexai"])
        with patch.dict("sys.modules", {"langchain_google_genai": None}), self.assertRaises(ProcessingError) as caught:
            LangChainGeminiProvider().generate([])
        self.assertEqual(caught.exception.status_code, 503)


class RecommendationApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.patches = [patch("app.services.storage.RESULT_DIR", self.root),
                        patch("app.services.storage.REFERENCE_DIR", self.root / "references"),
                        patch.dict(os.environ, {"GOLF_COACH_AI_ENABLED": "false", "GOLF_COACH_AI_PROVIDER": "disabled",
                                                "GOLF_COACH_AI_MODEL": "", "GOLF_COACH_AI_API_KEY": ""})]
        for item in self.patches:
            item.start()
        self.client = TestClient(app)
        self.swing = make_swing(hidden=(15,))
        self.swing.filename = "PRIVATE_VIDEO_NAME.mp4"
        self.swing.frames[0].preview_jpeg = "data:image/jpeg;base64,PRIVATE_PIXELS"
        (self.root / f"{self.swing.id}.json").write_text(self.swing.model_dump_json(), encoding="utf-8")
        self.capture = setup()
        self.capture.club = "PRIVATE_CLUB_TEXT"
        response = self.client.post("/api/references", json={"swing_id": self.swing.id, "name": "PRIVATE_REFERENCE_NAME",
                                                           "setup": self.capture.model_dump(), "anchors": marks().model_dump()})
        self.assertEqual(response.status_code, 201, response.text)
        self.reference_id = response.json()["id"]
        self.body = {"swing_id": self.swing.id, "reference_id": self.reference_id,
                     "setup": self.capture.model_dump(), "anchors": marks().model_dump()}

    def tearDown(self):
        self.client.close()
        for item in reversed(self.patches):
            item.stop()
        self.temporary.cleanup()

    def test_preview_is_local_without_provider_inference_or_private_content(self):
        with patch("app.services.coach_provider.LangChainGeminiProvider") as provider, \
                patch("app.services.video_processing.process_video") as inference:
            response = self.client.post("/api/recommendations/preview", json=self.body)
        self.assertEqual(response.status_code, 200, response.text)
        provider.assert_not_called()
        inference.assert_not_called()
        data = response.json()
        self.assertEqual(data["status"], "prepared")
        self.assertFalse(data["generated_by_ai"])
        self.assertTrue(data["local_only"])
        payload = json.dumps(data["data"])
        for private in ("PRIVATE_", self.swing.id, self.reference_id, "data:image", '"landmarks"', '"frames"', '"preview_jpeg"'):
            self.assertNotIn(private, payload)
        self.assertEqual(len(data["data"]["phases"]), 3)
        self.assertEqual(len(data["data"]["moments"]), 4)
        self.assertTrue(data["data"]["warnings"])

    def test_status_and_generation_are_disabled_even_with_a_key_present(self):
        with patch.dict(os.environ, {"GOLF_COACH_AI_API_KEY": "test-only-key"}), \
                patch("app.services.coach_provider.LangChainGeminiProvider") as provider:
            status = self.client.get("/api/recommendations/status")
            generated = self.client.post("/api/recommendations", json=self.body)
        self.assertEqual(status.status_code, 200)
        self.assertFalse(status.json()["enabled"])
        self.assertEqual(generated.status_code, 503)
        provider.assert_not_called()
        self.assertNotIn("test-only-key", status.text + generated.text)

    def test_preview_never_calls_a_provider_even_if_future_generation_is_configured(self):
        with patch.dict(os.environ, {"GOLF_COACH_AI_ENABLED": "true", "GOLF_COACH_AI_PROVIDER": "gemini",
                                     "GOLF_COACH_AI_MODEL": "test-model", "GOLF_COACH_AI_API_KEY": "test-only-key"}), \
                patch("app.services.coach_provider.LangChainGeminiProvider") as provider:
            response = self.client.post("/api/recommendations/preview", json=self.body)
        self.assertEqual(response.status_code, 200)
        provider.assert_not_called()

    def test_missing_records_invalid_marks_and_client_supplied_metrics_are_rejected(self):
        invalid = copy.deepcopy(self.body)
        invalid["anchors"]["top_ms"] = invalid["anchors"]["impact_ms"]
        self.assertEqual(self.client.post("/api/recommendations/preview", json=invalid).status_code, 422)
        self.assertEqual(self.client.post("/api/recommendations/preview", json={**self.body, "swing_id": str(uuid4())}).status_code, 404)
        self.assertEqual(self.client.post("/api/recommendations/preview", json={**self.body, "metrics": [{"score": 100}]}).status_code, 422)
        incompatible = {**self.body, "setup": {**self.body["setup"], "view": "down_the_line"}}
        self.assertEqual(self.client.post("/api/recommendations/preview", json=incompatible).status_code, 422)

    def test_report_id_is_stable_and_changes_with_the_selected_movement(self):
        first = self.client.post("/api/recommendations/preview", json=self.body).json()
        second = self.client.post("/api/recommendations/preview", json=self.body).json()
        self.assertEqual(first["report_id"], second["report_id"])
        modified = copy.deepcopy(self.body)
        modified["anchors"]["top_ms"] += 100
        third = self.client.post("/api/recommendations/preview", json=modified).json()
        self.assertNotEqual(first["report_id"], third["report_id"])

    def test_generation_contract_can_be_exercised_with_a_test_provider_only(self):
        prepared = self.client.post("/api/recommendations/preview", json=self.body).json()
        from app.schemas.recommendation import PreparedRecommendation
        provider = Mock()
        provider.generate.return_value = simulated_response(PreparedRecommendation.model_validate(prepared))
        with patch("app.api.recommendations.require_enabled_provider", return_value=provider):
            response = self.client.post("/api/recommendations", json=self.body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["report_id"], prepared["report_id"])
        self.assertTrue(response.json()["generated_by_ai"])


if __name__ == "__main__":
    unittest.main()
