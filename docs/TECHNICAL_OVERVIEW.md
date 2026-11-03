# Technical overview

AI Golf Coach is a local React/TypeScript single-page app backed by FastAPI. The seven screens cover upload, reference selection, timestamp review, synchronized video/pose comparison, equivalent moments, scoring, and report. Six cinematic Three.js transitions are presentation only; they do not generate measurements.

The browser uploads the user and reference recordings separately to `POST /api/swings`. FastAPI validates file type/size/duration, decodes frames with OpenCV, runs MediaPipe Pose Landmarker, and stores time-indexed pose and preview data as local JSON. Source uploads are removed after processing. Four swing timestamps are suggested from observable motion and can be edited; impact is an approximation, not certified ball contact.

The reference is saved through `POST /api/references` with hand, camera view and timestamp anchors. `POST /api/comparisons` checks compatible setups, aligns both swings at equivalent phases, normalizes 2D body coordinates, calculates joint/angle differences and experimental similarity scores. The general score averages available phases; moments have separate scores. These are comparisons to the selected reference, not a universal measure of golf technique.

`POST /api/recommendations/preview` recomputes the comparison from stored IDs and returns structured evidence for an on-screen local preview. The frontend also shows deterministic comparison insights. `POST /api/recommendations` is the optional LangChain/Gemini generation route and requires explicit configuration and user action. The application does not send video, images or skeleton drawings to the AI provider; it sends prepared measurements and context.

Data is stored locally in `backend/data/results` and `backend/data/reference_swings`; the latter includes processed pose frames and small frame previews. They can contain personal information and must remain private. There is no authentication or multi-user isolation. The service is intended for a single local machine; do not expose it publicly without additional design and security work.

The [system architecture](architecture/AI_GOLF_COACH_ARCHITECTURE_OVERVIEW.svg) and [analysis workflow](architecture/AI_GOLF_COACH_ARCHITECTURE.svg) are based on these implemented paths. The dashed AI branch means optional and disabled by default.
