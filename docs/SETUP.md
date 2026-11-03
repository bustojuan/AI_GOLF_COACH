# Local setup (Windows, VS Code)

Use PowerShell in two VS Code terminals. The verified development environment uses **64-bit Python 3.14.3** and **Node.js 22.23.4**. Node 22.12 or newer is needed for the frontend test command. Check `python --version`, `node --version` and `npm.cmd --version` first.

## Backend — terminal 1

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/download_model.py
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --reload-dir app --host 127.0.0.1 --port 8000
```

The model downloader retrieves the official MediaPipe Pose Landmarker Full file and verifies its SHA-256 hash. It is needed for video analysis, but is not stored in Git. The backend creates `backend/data/` as needed. Do not copy development results or reference JSON files into a public repository.

## Frontend — terminal 2

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open <http://127.0.0.1:5173/>. The Vite development proxy forwards `/api` to <http://127.0.0.1:8000>. Check <http://127.0.0.1:8000/api/health> and <http://127.0.0.1:5173/api/health>; both should report `status: ok`. Set `AIGOLF_BACKEND_URL` in the frontend terminal only if the backend uses a different address; restart Vite after changing it. The servers bind to `127.0.0.1`.

The root `.env.example` is documentation, **not automatically loaded** by Python or Vite. To set optional variables for a terminal session, use PowerShell, for example `$env:AIGOLF_BACKEND_URL='http://127.0.0.1:8000'`. Do not commit `.env` files or keys.

## Tests and production build

```powershell
cd frontend
npm.cmd test
npm.cmd run build
```

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The frontend tests exercise upload, timing, comparison, report illustration and motion utilities. The backend tests cover API/analysis/comparison/report behavior. See [validation notes](VALIDATION.md) for the checks actually run on this distribution.

## AI reports

Local comparison, scoring and the report input/preview work without an external API. Generating prose through Gemini is an **optional explicit action**. To enable it, install `backend/requirements-ai.txt` and set `GOLF_COACH_AI_ENABLED=true`, `GOLF_COACH_AI_PROVIDER=gemini`, a valid `GOLF_COACH_AI_MODEL`, and `GOLF_COACH_AI_API_KEY` in the backend process environment. The example variables are blank by design. No model call occurs merely by preparing the report.
