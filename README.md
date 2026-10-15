# BNamericas Project Editor

A small web tool to edit research projects (name, sector, country, stage and a list of key dates) when several people may edit the same project at once. It was built for the BNamericas technical challenge. Changes to different fields are both kept. A change to the same field never overwrites silently: the person who saves second sees both values and decides.

## How it fits together

```
Browser (React + MUI, :5173)  ->  Backend (FastAPI, :8000)  ->  Upstream records API (:8081)
```

- The browser only talks to our backend (`/api/...`). It never calls the upstream.
- The backend keeps nothing in memory between requests, so several instances can run side by side.
- The upstream in `upstream/` belongs to "another team". It is used as given and must not be changed.

Why it is built this way: see [DECISIONS.md](DECISIONS.md).

## Run it

You need [uv](https://docs.astral.sh/uv/), Node 20 or newer, and Git. Open three terminals from the repo root and leave them open.

```bash
# Terminal 1: the upstream records API (http://127.0.0.1:8081)
cd upstream && uv run upstream

# Terminal 2: our backend (http://127.0.0.1:8000)
cd backend && uv sync && uv run uvicorn app.main:app --port 8000

# Terminal 3: the web page (http://localhost:5173)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. The upstream starts with about 30 example projects and forgets edits when stopped. To make it behave predictably, start it with `UPSTREAM_SLOW_RATE=0 UPSTREAM_TIMEOUT_RATE=0`.

Tests:

```bash
cd backend && uv run pytest -q
cd frontend && npm test -- --run
python3 scripts/docs_coverage.py
```

## Documentation

- Step by step for beginners: [docs/guide.md](docs/guide.md), also in the app at `/docs/guide`.
- What the tool does, without jargon: [docs/general.md](docs/general.md), in the app at `/docs/general`.
- For a junior developer, with every function explained, a file map and recipes to extend the app: [docs/technical/index.md](docs/technical/index.md), in the app at `/docs/technical`.

`scripts/docs_coverage.py` fails when a public function is missing from the technical pages, so the docs and the code stay in step.

## Repo map

| Path | What is there |
|---|---|
| `backend/app/` | FastAPI app: `main.py` (routes, save procedure), `merge.py` (three-way merge), `upstream_client.py` (the only upstream caller), `models.py`, `config.py` |
| `backend/tests/` | pytest suites for merge, proxy and 504 handling, statelessness and docs coverage |
| `frontend/src/` | React app: `pages/` (list, edit, docs), `components/` (shell, key dates editor, save bar, conflict dialog, Markdown), `api.ts`, `types.ts` |
| `docs/` | The three documentation pages as Markdown: `general.md`, `guide.md`, `technical/` |
| `scripts/` | `docs_coverage.py` (docs against code) and `guide_check.sh` (runs the guide on a clean copy) |
| `upstream/` | The records API of the other team, unchanged |
| `DECISIONS.md` | One page of design decisions |
| `AI-TRAIL.md` | How AI was used to build this |

Settings (all optional, with local defaults) are environment variables read in `backend/app/config.py`, for example `UPSTREAM_URL` and `UPSTREAM_API_KEY`.
