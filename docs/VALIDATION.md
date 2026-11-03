# Distribution validation

This file records checks against the standalone folder, not against the original development workspace. Validation was run on Windows on 3 November 2026.

## Executed checks

- A fresh `npm.cmd ci` installed 29 packages from the frontend lockfile; npm reported zero vulnerabilities. `npm.cmd test` passed **52/52** tests. `npm.cmd run build` passed TypeScript and Vite production compilation. Vite reported one chunk over 500 kB; this is a performance warning, not a build failure.
- A new Python 3.14 virtual environment installed `backend/requirements-dev.txt` and its runtime dependencies. `scripts/download_model.py` downloaded the Pose Landmarker Full file and passed its SHA-256 check. `python -m unittest discover -s tests -v` passed **67/67** tests.
- FastAPI and Vite started from the distribution on isolated local ports 18000 and 15173. Direct `/api/health`, proxied `/api/health`, and the initial browser page responded successfully.
- A real 14.16-second Pexels user clip produced 354 analyzed frames and four suggested marks. A different 11.76-second Pexels reference clip produced 282 analyzed frames and four suggested marks. A reference was saved; the comparison returned 91 aligned frames, three phases, four moments and an experimental similarity score. The local report preview returned `prepared`. The explicit AI-generation endpoint returned 503 while disabled, as expected; no external model was called.
- Chrome headless traversed all seven screens using these real processing results. The user upload response was replayed from the saved output of the same test clip to avoid reprocessing it for screenshots; reference selection, comparison and report calls used the actual distribution backend. Screenshots were inspected for visible user/reference overlays, scores and report content.
- Relative README links, source-file scans for obvious secrets/absolute user paths, and presence of the required app resources were checked. No hard-coded user paths or embedded keys were found in the distribution source. This is a targeted scan, not an exhaustive security audit.

## Distribution contents

- The completed 88-second Product Demo V2 MP4 is included alongside its thumbnail and Spanish SRT. The source cut was copied unchanged from the development workspace.
- Application screenshots use the two Pexels recordings from the fresh smoke test. The demo thumbnail contains the generated Studio Dark athlete.
- No source video examples are bundled. See [sample instructions](../assets/samples/README.md).
- No code license has been granted in this folder; the code remains under default copyright.

## Known product limits

- 2D single-camera comparison with matching dominant hand and view. Estimates depend on framing, occlusion and lighting.
- Ball/club detection and similarity scores are experimental. Timestamp suggestions, especially impact, should be checked manually.
- AI generation is disabled by default; the local report preview does not require a provider. The Product Demo's report is an illustrative example.
- Live Gemini generation was not exercised: no API key or paid account was configured for this distribution check.
- Local single-user storage only; no deployment/authentication configuration is supplied.
