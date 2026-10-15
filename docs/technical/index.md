# Technical documentation

What every file of the project editor does and how the parts fit together, explained for someone who has never seen this repo. It has recipes you can copy to change the app, and it tells you where to look when something breaks.

**How the technical docs are split.** This page is the map. The detail of every function lives in two other pages:

- [Backend functions, explained](backend.md): every function and class of `backend/app/`.
- [Frontend functions, explained](frontend.md): every function, component and hook of `frontend/src/`.

Read this page first, then jump to those two when you need the detail of one function.

## Overview

**What the app is.** A small web tool to edit projects (a name, a sector, a country, a stage, a list of key dates). Two people may edit the same project at the same time. The app must never lose either person's work in silence: changes to different fields are both kept, and a change to the *same* field asks the second person to decide.

**The three moving parts.**

1. **The browser** runs the React app in `frontend/`. It shows the list, the edit form and the conflict dialog.
2. **Our backend** is a FastAPI app in `backend/`. We run **three copies** of it at the same time (three instances) behind the same address. It validates what comes in, merges concurrent edits and talks to the upstream.
3. **The upstream** is a third-party records API in `upstream/`. It stores the projects in memory. Another team owns it: we call it, we never change it.

A fourth actor does not go through our code: a **nightly import** writes new data straight into the upstream while people are working.

```
                      our code                                  not ours
   ┌───────────────────────────────────────────────┐   ┌─────────────────────────┐
   │                                               │   │                         │
   │   Browser         Backend  x3 instances       │   │  Upstream records API   │
   │   (React)  ───►   (FastAPI, no memory   ──────┼──►│  (upstream/, port 8081) │
   │   port 5173       kept between calls)         │   │  data lives in memory   │
   │                   port 8000                   │   │                         │
   │        ◄───  JSON  ◄───                       │   │            ▲            │
   └───────────────────────────────────────────────┘   └────────────┼────────────┘
                                                                    │
                                                    Nightly import ─┘
                                                    (writes here directly,
                                                     skipping our backend)
```

> **Note** The golden rule: **the browser never calls the upstream.** Every request from the browser goes to `/api/...` on our backend (`frontend/src/api.ts` refuses any other path), and only `backend/app/upstream_client.py` talks to the upstream. This is why the upstream's key (`X-Api-Key`) never reaches a browser.

**Three facts about the upstream you must know.** They explain most of the code:

- **The last save wins.** It has no version number, so on its own it silently overwrites a colleague's change. Our backend adds the missing protection.
- **A save replaces whole lists.** If you send one key date, the others are deleted. So the backend always sends the complete, merged project.
- **It sometimes fails.** About 1 in 10 saves answers `504`, and a `504` does not say whether the save happened. About 1 in 10 reads takes 2 seconds.

**Why the backend keeps nothing in memory.** Three instances run side by side, and the nightly import changes data behind our back. If an instance remembered "the project as I last saw it", another instance or the import would make that memory wrong. Instead the browser sends the version it loaded (`base`) with every save, and the backend reads the current upstream data fresh each time. Any instance gives the same answer. The test `backend/tests/test_stateless.py` proves it.

## File map

Every file and folder that matters. If a path is not here, you can ignore it (for example `node_modules/`, `.venv/` and `dist/` are generated).

**Backend (`backend/`)**

| Path | What it is |
|---|---|
| `backend/app/main.py` | The web layer: builds the FastAPI app with `create_app()`, defines the `/api/...` routes and runs the save procedure `save_project`. |
| `backend/app/merge.py` | The heart of the project: the field-by-field three-way merge (`three_way_merge`) and the rule that decides what a conflict is. Pure functions, no I/O. |
| `backend/app/upstream_client.py` | The only code that talks to the upstream: GET with one retry, PUT without retry, and the error type `UpstreamError`. |
| `backend/app/models.py` | The data shapes (Pydantic): `Editable`, the save request, the 409 conflict body. Mirrored by `frontend/src/types.ts`. |
| `backend/app/config.py` | Settings read from environment variables (upstream address and key, timeouts, number of retries) with local defaults. |
| `backend/app/__init__.py` | Empty file that makes `app` a Python package. |
| `backend/pyproject.toml` | Python dependencies and the pytest settings. |
| `backend/uv.lock` | Exact pinned versions of the Python dependencies (generated by `uv`, do not edit by hand). |
| `backend/tests/conftest.py` | Test kit: `FakeUpstream`, a pretend upstream running in memory, and the `client` and `make_app` fixtures. |
| `backend/tests/test_merge.py` | Proves the merge rules: different fields survive, same field conflicts, key dates by label. |
| `backend/tests/test_proxy.py` | Proves the routes: list, get, save, the 504 handling, 404 and 422 pass-through. |
| `backend/tests/test_stateless.py` | Proves that two backend instances give the same answers, with the nightly import in between. |
| `backend/tests/test_docs_coverage.py` | Proves the backend docs match the code: no missing or stale entry in `docs/technical/backend.md`, and its examples still run. |
| `backend/tests/__init__.py` | Empty file that lets tests import `tests.conftest`. |

**Frontend (`frontend/`)**

| Path | What it is |
|---|---|
| `frontend/src/main.tsx` | Starts React and mounts the app in the page, inside the router and the theme. |
| `frontend/src/App.tsx` | The route table: `/`, `/projects/:id`, `/docs/general`, `/docs/technical`, `/docs/guide`. |
| `frontend/src/api.ts` | The only place that calls `fetch`: `listProjects`, `getProject`, `saveProject`. Refuses any URL outside `/api/`. |
| `frontend/src/types.ts` | TypeScript types of the data. Mirrors `backend/app/models.py`: change both together. |
| `frontend/src/theme.ts` | The MUI theme: colors, fonts, shapes. |
| `frontend/src/components/AppShell.tsx` | The page frame: top bar, the Documentation menu, and the outlet where each page appears. |
| `frontend/src/components/KeyDatesEditor.tsx` | The list of key dates inside the form: add, remove and edit rows. |
| `frontend/src/components/SaveBar.tsx` | The bar at the bottom of the form that shows every save state (unsaved, saving, saved, error). |
| `frontend/src/components/ConflictDialog.tsx` | The dialog where the person picks "mine" or "theirs" for each conflicting field. |
| `frontend/src/components/Markdown.tsx` | Shows a Markdown text (the docs) styled with MUI. |
| `frontend/src/pages/ProjectList.tsx` | The list page: search, filters, sorting, pagination. |
| `frontend/src/pages/ProjectEdit.tsx` | The edit page: loads a project, tracks changes against the loaded copy, saves, opens the conflict dialog. |
| `frontend/src/pages/DocsPage.tsx` | Shows one of the three documentation pages from the `docs/` folder. |
| `frontend/src/api.test.ts` | Proves `frontend/src/api.ts` calls only `/api/` paths and turns a 409 into a conflict result. |
| `frontend/src/components/AppShell.test.tsx` | Proves the menu, the docs sub-bar and the narrow-screen navigation. |
| `frontend/src/components/KeyDatesEditor.test.tsx` | Proves adding, removing and editing key date rows. |
| `frontend/src/components/SaveBar.test.tsx` | Proves each save state shows the right text and enables the right buttons. |
| `frontend/src/components/ConflictDialog.test.tsx` | Proves the dialog needs a choice for every row before it lets you save. |
| `frontend/src/pages/ProjectList.test.tsx` | Proves search, filters, sorting, pagination and the error state of the list. |
| `frontend/src/pages/ProjectEdit.test.tsx` | Proves loading, change counting, saving with the loaded base, conflict and error flows. |
| `frontend/src/pages/DocsPage.test.tsx` | Proves the Markdown viewer: headings get anchors, the table of contents is built, and the docs pages render. |
| `frontend/src/setupTests.ts` | Loads the test helpers (jest-dom matchers) before every frontend test. |
| `frontend/index.html` | The single HTML page that loads the React app. |
| `frontend/vite.config.ts` | Dev server on port 5173, forwarding `/api` to the backend on port 8000, and the test settings. |
| `frontend/tsconfig.json` | TypeScript settings (strict mode). |
| `frontend/package.json` | JavaScript dependencies (pinned versions) and the scripts `dev`, `build` and `test`. |
| `frontend/package-lock.json` | Exact versions installed by `npm` (generated, do not edit by hand). |

**Docs, scripts, upstream and the repo root**

| Path | What it is |
|---|---|
| `docs/technical/index.md` | This page: overview, file map, flow and recipes. |
| `docs/technical/backend.md` | One entry per backend function and class. |
| `docs/technical/frontend.md` | One entry per frontend function, component and hook. |
| `docs/general.md` | The plain-language page: what the tool does and how to use it, with no jargon. |
| `docs/guide.md` | The step-by-step guide for beginners: install, start, edit, solve a conflict. |
| `scripts/docs_coverage.py` | Compares the public functions in the code with the entries in `docs/technical/` and checks that every path on this page exists. |
| `scripts/docs_coverage_ignore.txt` | The few symbols or paths the coverage check may skip, each with a written reason. |
| `scripts/guide_check.sh` | Runs the commands of `docs/guide.md` in a clean copy to prove the guide works. |
| `upstream/` | Third-party records API owned by another team. **Never edit anything inside it.** |
| `README.md` | The front door of the repo: what it is, how to start it, how to run the tests. |
| `DECISIONS.md` | One page with the choices we made, what we cut, and what breaks first with 50 editors. |
| `AI-TRAIL.md` | A note on how AI was used to build this. |
| `.gitignore` | Files git must not track (virtual environments, `node_modules`, build output). |

> **Note** Both lists of functions (`backend.md` and `frontend.md`) are checked by `scripts/docs_coverage.py`. With `--only all` the same script checks this file map: if you rename or delete a file listed above and forget to update this page, the check fails and names the missing path.

## Flow · Save and merge

This is the one flow worth understanding well. Everything else is plumbing around it.

### The five steps

1. **Open.** The browser asks `GET /api/projects/{id}` (`getProject` in `frontend/src/api.ts`). It keeps two copies of the editable fields: **`base`** (what was loaded, never changed) and the **form** values (what the person edits).
2. **Save.** The person presses "Save changes". The browser sends `PUT /api/projects/{id}` with `{ base, mine }`, where `mine` is the form values. If the person is answering a conflict it also sends `resolutions`, for example `{"key_dates:award": "mine"}`, and `seen`, the value each conflict showed as "theirs", for example `{"key_dates:award": "2027-05-01"}`.
3. **Re-read.** The backend (`save_project` in `backend/app/main.py`) does not trust anything it remembers. It asks the upstream for the project **right now**: this is **`current`**.
4. **Merge.** `three_way_merge(base, mine, current, resolutions, seen)` in `backend/app/merge.py` compares the three copies field by field:

   | `mine` vs `base` | `current` vs `base` | Result for that field |
   |---|---|---|
   | same (I did not touch it) | any | keep `current` (this protects the nightly import) |
   | different | same | take `mine` |
   | different | different, but equal to `mine` | no conflict, same value |
   | different | different and not equal to `mine` | **conflict** |

   With no conflicts the backend sends the **full merged project** to the upstream, then reads it back once more to check that the stored data equals what it sent.
5. **New base.** After a successful save the browser replaces `base` with the project the backend returned. After a conflict, the browser keeps the ORIGINAL `base`. The 409 answer carries `current` only so the dialog can show it. The retry sends the same `base`, the person's `resolutions` and `seen`. If `base` were replaced by `current`, every field the other person changed would look untouched by them and be reverted. The backend re-reads `current` itself, and when a field's current value no longer equals `seen`, it ignores that choice and answers a new 409, so a value nobody saw is never overwritten.

### The three outcomes

| Status | When | What the browser does |
|---|---|---|
| **200** | No conflict. Body: `{ project, saved: true, auto_merged: [...] }`. If a `504` happened but a re-read proved the data was stored, the body also has `confirmed_after_504: true`. | Shows "Saved", uses the returned project as the new `base`. |
| **409** | A conflict. Body: `type` is `conflict`, with `current`, `conflicts` and `auto_merged`. Also used with `type` `concurrent_overwrite_detected` when someone else saved between our write and our verification read. For `conflict`, nothing was written upstream. For `concurrent_overwrite_detected` our write DID land and was then overwritten: `conflicts` is empty and `current` is what the upstream holds now (see `save_project` in `backend/app/main.py`). | Opens the conflict dialog; the person picks "mine" or "theirs" for each conflict; the browser saves again with the ORIGINAL `base`, `resolutions` and `seen`. |
| **504** | The upstream timed out on every attempt and the backend could not confirm the data. Body carries the last known `current`. | Shows an error with a Retry button. |

> **Warning** A `504` from the upstream is not a failure you can simply retry. The upstream may have stored the change before timing out. `save_project` therefore reads the project again **before** doing anything: if the stored data already equals what it wanted to write, it answers 200 (`confirmed_after_504`); if not, it merges again and retries, at most `MAX_PUT_RETRIES` times (default 2, from `backend/app/config.py`). Retrying blindly would duplicate or overwrite someone else's work.

### What "same field" means

The merge cuts a project into small **fields** and gives each one a text key. Two edits conflict only when they touch the same key:

- A simple value is its own key: `name`, `sector`, `country`, `stage`.
- **One key date is one field, identified by its label.** Its key is `key_dates:` plus the label in lower case, for example `key_dates:award` for the date labelled "Award". The value is the date.
- One linked company is one field keyed by its name (`linked_companies:<name>`), and its value is the role.

**Why by label and not as one whole list?** If the whole `key_dates` list were one field, two people editing two different dates of the same project would conflict for nothing, and the challenge says changes to different fields must both survive.

**Why by label and not by position?** Positions move. If someone inserts a new date at the top, every index shifts by one. Then "date number 2" in `base` is a different date from "date number 2" in `current`, and the merge could overwrite the wrong one in silence. The label is what a human recognises, and it does not move. The test `test_insert_upstream_shifts_position_without_wrong_overwrite` in `backend/tests/test_merge.py` locks this in.

### Worked example

The project has two key dates when Ana and Ben open it:

```
base:   Bid close = 2027-01-01     Award = 2027-03-01
```

Ben changes **Award** to `2027-05-01` and saves first. The upstream now holds that (`current`). Then Ana, who still has the old copy open, changes **Bid close** to `2027-01-05` and **Award** to `2027-02-01`, and saves:

| Field key | base | mine (Ana) | current (Ben) | Decision |
|---|---|---|---|---|
| `key_dates:bid close` | 2027-01-01 | 2027-01-05 | 2027-01-01 | Only Ana changed it: take Ana's. Merged cleanly. |
| `key_dates:award` | 2027-03-01 | 2027-02-01 | 2027-05-01 | Both changed it differently: **conflict**. |

The backend answers **409** with this body (shortened) and writes nothing:

```json
{
  "type": "conflict",
  "status": 409,
  "current": { "name": "Solar Park", "key_dates": [ ... ] },
  "conflicts": [
    { "key": "key_dates:award", "field": "key_dates", "label": "Award",
      "base": "2027-03-01", "mine": "2027-02-01", "theirs": "2027-05-01" }
  ],
  "auto_merged": ["key_dates:bid close"]
}
```

Ana's dialog shows one row: "Award: you say 2027-02-01, they say 2027-05-01". She picks "mine". The browser sends the save again, with the same original `base`, `resolutions = {"key_dates:award": "mine"}` and `seen = {"key_dates:award": "2027-05-01"}`. The backend re-reads the upstream, sees that Award is still `2027-05-01`, so the choice applies. The merge now gives Bid close `2027-01-05` and Award `2027-02-01`, the backend stores it and answers 200. If Ben had saved Award again in between (say `2027-06-01`), `seen` would no longer match and Ana would get another 409 showing the new value instead: the loop is safe.

The second case, an insert, shows why labels matter. If instead someone had added "Kickoff 2026-12-01" at the top while Ana edited, the merge keeps "Kickoff" and still applies Ana's two edits to the right dates, because it never looks at positions.

> **Note** Renaming a label counts as deleting one date and adding another. Two people who rename the same label in different ways will not see a conflict. This is a known limit, also in `DECISIONS.md`.

## How to extend · Add an editable field

**Goal.** Add a text field `status_note` ("Waiting for permit") that a person can edit, and that merges like `name`.

> **Warning** The real upstream in `upstream/` only stores the six fields it already knows and ignores every other field in a PUT. With the real upstream this recipe would make the backend answer a 409 `concurrent_overwrite_detected` on every save that changes the note (the stored data never equals what was sent). The recipe works in the tests because `FakeUpstream` stores everything. A new editable field in production first needs the upstream's owner to add it. Use the recipe to learn where the pieces are.

The backend refuses a project without the new field and the merge ignores it, so there are six places to change, plus tests.

**1. Backend model.** In `backend/app/models.py`, add the field to `Editable`:

```python
class Editable(BaseModel):
    name: str = Field(min_length=1)
    sector: Sector
    country: str = Field(min_length=1)
    stage: Stage
    status_note: str            # new
    key_dates: list[KeyDate]
    linked_companies: list[LinkedCompany]
```

**2. Merge.** In `backend/app/merge.py`, add the name to `SCALARS`. This is the list of fields compared as plain values:

```python
SCALARS = ("name", "sector", "country", "stage", "status_note")
```

**3. Upstream client.** In `backend/app/upstream_client.py`, add the name to `EDITABLE_KEYS` so `editable_of` copies it from the upstream's answer and the save sends it:

```python
EDITABLE_KEYS = ("name", "sector", "country", "stage", "status_note", "key_dates", "linked_companies")
```

**4. Backend test data.** In `backend/tests/conftest.py`, give both projects in `SEED` a `"status_note": ""` and add `"status_note"` to the tuple inside the `editable()` helper at the bottom. Without this `editable_of` fails because the fake upstream has no such key.

**5. Frontend type.** In `frontend/src/types.ts`, add `status_note: string;` to `Editable`.

**6. Frontend form.** In `frontend/src/pages/ProjectEdit.tsx` make four small edits:

```tsx
// pickEditable: copy the new field (older data may lack it)
name: p.name, sector: p.sector, country: p.country, stage: p.stage, status_note: p.status_note ?? '',

// countChanges: count it as one change
let n = (['name', 'sector', 'country', 'stage', 'status_note'] as const).filter((k) => base[k] !== mine[k]).length;

// the `mark` helper inside ProjectEdit: accept the new key
const mark = (k: 'name' | 'sector' | 'country' | 'stage' | 'status_note') => ({

// inside the "General data" grid, after the Stage field:
<TextField
  label="Status note" value={form.status_note} onChange={(e) => edit({ status_note: e.target.value })}
  {...mark('status_note')} sx={{ ...mark('status_note').sx, gridColumn: { md: '1 / -1' } }}
/>
```

**7. Tests.** Add the new field to the test objects that TypeScript now flags: `ed` in `frontend/src/api.test.ts` and `project` in `frontend/src/pages/ProjectEdit.test.tsx` (`status_note: ''`). Then add one test per layer:

```python
# backend/tests/test_merge.py
def test_status_note_edit_survives_a_change_to_another_field():
    r = three_way_merge(snap(status_note=""), snap(status_note="Waiting for permit"), snap(status_note="", stage="financing"))
    assert (r.merged["status_note"], r.merged["stage"]) == ("Waiting for permit", "financing")
    assert r.conflicts == []

def test_status_note_changed_by_two_people_conflicts():
    r = three_way_merge(snap(status_note=""), snap(status_note="A"), snap(status_note="B"))
    assert [c.key for c in r.conflicts] == ["status_note"]
```

```python
# backend/tests/test_proxy.py
async def test_status_note_is_saved_through_proxy(client, upstream):
    base = editable(upstream)
    r = await put(client, "P-1", base, {**base, "status_note": "Waiting for permit"})
    assert r.status_code == 200
    assert upstream.store["P-1"]["status_note"] == "Waiting for permit"
```

```tsx
// frontend/src/pages/ProjectEdit.test.tsx
describe('status note', () => {
  it('counts a typed status note as one change', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue(project);
    renderPage();
    await userEvent.type(await screen.findByLabelText('Status note'), 'Waiting for permit');
    expect(bar()).toBe('dirty:1');
  });
});
```

**Check it.** Run the backend tests (`cd backend && uv run pytest -q`) and the frontend type check and tests (`cd frontend && npx tsc --noEmit && npm test -- --run`). Everything is green when the new tests pass and no old test broke.

> **Note** Do not forget the docs: the frontend entries for `pickEditable` and `countChanges` in [frontend.md](frontend.md) and the `Editable` entry in [backend.md](backend.md) should mention the new field. A list field (like `key_dates`) is more work: it needs its own key rule in `flatten` in `backend/app/merge.py`.

## How to extend · Add an endpoint

**Goal.** Add `GET /api/projects/{id}/summary` that returns a short overview of one project: its name, stage, how many key dates it has and the earliest one. Then call it from the frontend.

**1. Describe the answer.** In `backend/app/models.py`, add a model next to `ProjectSummary`. Pydantic checks the shape and FastAPI documents it:

```python
class ProjectOverview(BaseModel):
    """Body of GET /api/projects/{id}/summary."""

    id: str
    name: str
    stage: str
    key_date_count: int
    first_key_date: KeyDate | None = None
```

**2. Add the route.** In `backend/app/main.py`, import `ProjectOverview` and add the route **inside `create_app`**, next to the other `@app.get` routes (so it uses the same `client` and shares the same error handling):

```python
@app.get("/api/projects/{project_id}/summary")
async def project_overview(project_id: str):
    raw = await client.get_project(project_id)
    dates = sorted(raw["key_dates"], key=lambda d: d["date"])
    return ProjectOverview(id=raw["id"], name=raw["name"], stage=raw["stage"],
                           key_date_count=len(dates), first_key_date=dates[0] if dates else None).model_dump()
```

Two rules to keep: the route talks to the upstream **only through `client`** (never with `httpx` directly), and it keeps **nothing in memory** between calls. An unknown id gives a 404 for free because `UpstreamError` is turned into a problem answer by the handler in `create_app`.

**3. Backend test.** In `backend/tests/test_proxy.py` (it already has the `client` fixture and the two seeded projects):

```python
async def test_summary_has_count_and_earliest_date(client):
    body = (await client.get("/api/projects/P-1/summary")).json()
    assert body == {"id": "P-1", "name": "Solar Park Alpha", "stage": "feasibility", "key_date_count": 2,
                    "first_key_date": {"label": "Tender launch", "date": "2027-01-01"}}

async def test_summary_of_unknown_project_is_404(client):
    assert (await client.get("/api/projects/NOPE/summary")).status_code == 404
```

**4. Frontend type.** In `frontend/src/types.ts`:

```ts
/** Body of GET /api/projects/{id}/summary. */
export interface ProjectOverview {
  id: string;
  name: string;
  stage: string;
  key_date_count: number;
  first_key_date: KeyDate | null;
}
```

**5. Call it from `api.ts`.** In `frontend/src/api.ts`, add `ProjectOverview` to the type import and a function that uses the private `request` helper (that is what keeps the "only `/api/`" rule):

```ts
/** Returns the short overview of one project (name, stage, number of key dates, earliest key date). */
export async function getProjectOverview(id: string): Promise<ProjectOverview> {
  const res = await request(`/api/projects/${encodeURIComponent(id)}/summary`);
  if (!res.ok) throw await toError(res);
  return res.json();
}
```

**6. Frontend test.** In `frontend/src/api.test.ts`, import `getProjectOverview` and add inside `describe('api', ...)`:

```ts
it('reads the overview from /api/projects/{id}/summary', async () => {
  const f = stub(json(200, { id: '1', name: 'P', stage: 'idea', key_date_count: 0, first_key_date: null }));
  expect((await getProjectOverview('1')).key_date_count).toBe(0);
  expect(f.mock.calls[0][0]).toBe('/api/projects/1/summary');
});
```

**Check it.** `cd backend && uv run pytest -q` and `cd frontend && npx tsc --noEmit && npm test -- --run`. To see it for real, start the three parts as in [the step-by-step guide](../guide.md) and open `http://127.0.0.1:8000/api/projects/<an id>/summary`; FastAPI also lists the route at `http://127.0.0.1:8000/docs`.

> **Note** The new public functions (`project_overview`, `ProjectOverview`, `getProjectOverview`) need an entry in [backend.md](backend.md) and [frontend.md](frontend.md). Run `python3 scripts/docs_coverage.py --only all` from the repo root: it lists any public function that has no entry.

## How to extend · Change the conflict rule

**Goal.** Change what counts as "the same field" or "a conflict". The rule lives in **one place**: `backend/app/merge.py`. Two functions decide it:

- `decide(base, mine, current)` says what to do with one key, once the keys are matched: keep `current`, take `mine`, or conflict.
- `key_date_key(label)` and `normalise_key(key)` decide **which key dates are the same field**.

Everything else (the routes, the frontend) just carries the result.

**Example: compare key dates case-sensitively**, so "Award" and "AWARD" are two different dates instead of one.

Today `key_date_key` lower-cases the label (`casefold()`), so "Award", "AWARD" and " award " all become the key `key_dates:award`. To make the case matter, remove `casefold()` in the two places that build or compare a key date key:

```python
def normalise_key(key: str) -> str:
    key = key.strip()
    if ":" not in key:
        return key
    field, rest = key.split(":", 1)
    return f"{field.strip()}:{rest.strip()}"      # was: rest.strip().casefold()

def key_date_key(label: str, occurrence: int = 1) -> str:
    key = f"key_dates:{normalise_text(label)}"    # was: normalise_text(label).casefold()
    return key if occurrence == 1 else f"{key}#{occurrence}"
```

Now the key of the date labelled "Award" is `key_dates:Award` (the case is kept) and `same_field_key("key_dates:AWARD", "key_dates:Award")` is `False`. Trimming spaces still applies. (Linked companies still compare names ignoring case; they use their own lines in `flatten`.)

**Tests to change.** Run `cd backend && uv run pytest -q` and nine tests in `backend/tests/test_merge.py` fail. They all fail for one reason: they write the key in lower case. Fix them in this order:

1. Replace `key_dates:award` with `key_dates:Award` everywhere in `backend/tests/test_merge.py` (a search and replace). Six tests go green.
2. `test_add_same_label_different_dates_conflicts`: the other person's label is written `" kickoff "`. Write it `" Kickoff "` (only the spaces are trimmed now) and expect the key `key_dates:Kickoff`.
3. `test_label_key_is_trimmed_case_insensitive_and_keeps_original_label`: its name is now a lie. Rename it `test_label_key_is_trimmed_and_case_sensitive` and assert the new behaviour:

   ```python
   assert same_field_key("key_dates: Award ", "key_dates:Award")
   assert not same_field_key("key_dates:AWARD", "key_dates:Award")
   ```

4. `test_duplicate_labels_get_suffix`: "X" and "x" are no longer duplicates. Use two labels that are both `"X"` and expect `key_dates:X` and `key_dates:X#2`.

**Example: compare by list position** (not recommended). You would build the key from the index in `flatten` (`key_dates:0`, `key_dates:1`, ...) instead of the label. Then `test_insert_upstream_shifts_position_without_wrong_overwrite` fails, and it should: it is the test that proves why we use labels. A rule change that makes this test fail has to come with a new test that explains what you gain and what you lose.

> **Warning** The conflict rule decides whether somebody's work is lost. Never change `decide` or the keys without a test that fails *before* your change and passes *after* it. Also read `DECISIONS.md`: it says why the rule is this one.

## Tests

**Run the backend tests** (about 2 seconds, needs [uv](https://docs.astral.sh/uv/)):

```bash
cd backend
uv run pytest -q
```

**Run the frontend tests** (about 10 seconds, needs Node):

```bash
cd frontend
npm install
npm test -- --run
```

`--run` makes the tests run once and stop. Without it, `npm test` stays open and re-runs the tests every time you save a file. To check the types too, run `npx tsc --noEmit` (or `npm run build`).

No test needs the upstream, a browser or the network: the backend tests use `FakeUpstream` from `backend/tests/conftest.py`, and the frontend tests replace `fetch` and the API functions.

| Test file | What it proves |
|---|---|
| `backend/tests/test_merge.py` | The merge rules on plain data: different fields both survive, the same field conflicts, key dates match by label, an insert does not shift anything, the nightly import is kept when you did not touch the field. |
| `backend/tests/test_proxy.py` | The routes: the list is slim, a save goes through, a 504 is verified by re-reading before any retry, a slow GET is retried once, 404 and 422 pass through. |
| `backend/tests/test_stateless.py` | Saving through one instance and reading through another works; a change made directly in the upstream merges field by field; a same-field change is a 409 and nothing is written. |
| `backend/tests/test_docs_coverage.py` | The backend docs match the code: no missing or stale entry, and the examples in `docs/technical/backend.md` still run. |
| `frontend/src/api.test.ts` | `frontend/src/api.ts` only calls `/api/` URLs, and turns a 409 into a conflict result. |
| `frontend/src/pages/ProjectEdit.test.tsx` | The edit page: change counting, saving with the loaded `base`, conflict dialog and re-send, 504 verification, error and 404 states. |
| `frontend/src/pages/ProjectList.test.tsx` | The list: loading, search, filters, sorting, pagination, empty and error states. |
| `frontend/src/components/SaveBar.test.tsx`, `frontend/src/components/ConflictDialog.test.tsx`, `frontend/src/components/KeyDatesEditor.test.tsx`, `frontend/src/components/AppShell.test.tsx` | Each component alone: every save state, the "choose every row" rule, the key date rows, and the menu at narrow and wide widths. |
| `frontend/src/pages/DocsPage.test.tsx` | The documentation pages render their Markdown. |

> **Note** A test you edit only to make it pass proves nothing. When a test fails, first decide whether the code or the test is wrong. After you add a rule, check that your new test **fails** when you remove the rule (comment out the guard, run the test, see it go red, put the guard back).

## Where to look when something breaks

| What you see | Look at |
|---|---|
| The browser shows "Could not reach the server" | The backend is not running on port 8000, or `frontend/vite.config.ts` has a different proxy target. Check `GET /health`. |
| Every request answers 502 | The upstream is not running or the address is wrong: `backend/app/config.py` (`UPSTREAM_URL`) and `backend/app/upstream_client.py`. |
| The upstream answers 401 | The key does not match: `UPSTREAM_API_KEY` in `backend/app/config.py`. |
| A save answers 409 and you think there is no conflict | `flatten` and `decide` in `backend/app/merge.py`. Print the three copies and compare the keys. |
| Two people's edits to different fields lost one of them | `three_way_merge` in `backend/app/merge.py`, then `save_project` in `backend/app/main.py` (is the full merged project what gets sent?). |
| A key date was overwritten after someone added another date | The key rule in `key_date_key` in `backend/app/merge.py` (is it by label, not by position?). |
| A save answers 504 | `save_project` in `backend/app/main.py` (the re-read after a 504) and `MAX_PUT_RETRIES` in `backend/app/config.py`. The upstream times out on purpose about 1 in 10 saves. |
| A save answers 422 | The shape of the body: `backend/app/models.py` against `frontend/src/types.ts`. They must stay in step. |
| The page is blank or a route shows "Page not found" | `frontend/src/App.tsx` (routes) and `frontend/src/components/AppShell.tsx`. |
| A field you edited does not show as changed | `countChanges` and `pickEditable` in `frontend/src/pages/ProjectEdit.tsx`. |
| The conflict dialog does not open or lists the wrong rows | `saveProject` in `frontend/src/api.ts` (409 handling), then `frontend/src/components/ConflictDialog.tsx`. |
| The form loses your edits on a failed save | The `send` function in `frontend/src/pages/ProjectEdit.tsx` and `frontend/src/components/SaveBar.tsx`. |
| The docs pages are empty or old | `frontend/src/pages/DocsPage.tsx` and the files in `docs/`. |
| The docs coverage check fails | Run `python3 scripts/docs_coverage.py --only all` from the repo root: it prints each missing, stale or empty entry and each bad path. Fix the page it names. |
| The nightly import "overwrites" a user's change | It cannot through our backend: it writes to the upstream, and the next save merges it as `current`. Look at `test_nightly_import_kept_when_mine_untouched` in `backend/tests/test_merge.py`. |

> **Note** For anything about the upstream itself (its rules, its slow reads, its 504s) read `upstream/README.md`. It is the only documentation of that service, and you must not change its code.
