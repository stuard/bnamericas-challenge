# Backend functions, explained

This page documents every public function and class of the FastAPI backend in `backend/app/`. It is written for a junior developer who has never opened this repo.

**How to read an entry.** Each entry is a `###` heading with the file and the name, then four labels: **What it does** (in plain words and why it exists), **Takes** (each parameter with a type and an example value), **Returns** (the shape, with an example) and **Example** (code that really runs).

**Run any Example yourself.** Open a terminal in `backend/`, run `uv run python`, and paste the code block. Every Example on this page is executed by `backend/tests/test_docs_coverage.py`, and the lines marked `# ->` are compared with what the code really prints. The route examples use `FakeUpstream`, a pretend upstream that lives in `backend/tests/conftest.py`, so you do not need a server running.

**The three ideas to keep in your head.**

1. The browser never talks to the upstream (the third-party records API in `upstream/`). It talks only to this backend, which talks to the upstream.
2. The backend keeps nothing in memory between requests. The browser sends the version it loaded (`base`) with every save, so any of the three backend instances can answer.
3. A save is a three-way merge: `base` (what the person opened), `mine` (what they want) and `current` (what the upstream holds now). Fields changed by only one side survive; a field changed differently by both is a conflict and the person who saves second decides.

**Gotchas you will meet below.** The upstream replaces whole lists (`key_dates`, `linked_companies`) on every PUT, it answers `504` on about 1 in 10 writes, and a `504` may or may not have saved. A nightly import writes straight to the upstream without going through this backend.

## Backend · app/main.py

The web layer: it builds the FastAPI app, defines the `/api/...` routes, and runs the save procedure (re-read, merge, write, verify) around the merge and the upstream client.

### `backend/app/main.py::create_app`

**What it does:** Builds one complete FastAPI application. It creates one `UpstreamClient` (one shared HTTP connection pool to the upstream), registers the error handlers that turn failures into `application/problem+json` answers, and registers the four routes. There is no global state: calling it twice gives two independent apps, which is how the tests simulate three backend instances. The module-level variable `app = create_app()` at the bottom of the file is the one `uvicorn app.main:app` starts.

**Takes:**

- `transport`: `httpx.AsyncBaseTransport | None`, default `None`. A fake network layer for tests, for example `TimeoutAwareTransport(app=fake.app)`. `None` means real network.
- `base_url`: `str | None`, for example `"http://upstream.test"`. `None` uses `UPSTREAM_URL` from `app/config.py`.
- `api_key`: `str | None`, for example `"secret"`. `None` uses `UPSTREAM_API_KEY`.

**Returns:** a `FastAPI` instance. The client is reachable as `app.state.upstream`.

**Example:**

```python
from app.main import create_app
from tests.conftest import FakeUpstream, TimeoutAwareTransport

fake = FakeUpstream()
app = create_app(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test")
print(app.title)  # -> BNamericas project editor
print(sorted({r.path for r in app.routes if r.path.startswith("/api") or r.path == "/health"}))  # -> ['/api/projects', '/api/projects/{project_id}', '/health']
print(type(app.state.upstream).__name__)  # -> UpstreamClient
other = create_app(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test")
print(other.state.upstream is app.state.upstream)  # -> False
```

### `backend/app/main.py::health`

**What it does:** The route `GET /health`. It answers `{"ok": true}` without calling the upstream, so a load balancer can ask "is this instance alive?" cheaply.

**Takes:** nothing (no parameters, no body).

**Returns:** JSON `{"ok": true}` with status 200.

**Example:**

```python
import asyncio
import httpx
from app.main import create_app
from tests.conftest import FakeUpstream, TimeoutAwareTransport


async def main():
    fake = FakeUpstream()
    app = create_app(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://backend.test") as web:
        r = await web.get("/health")
        print(r.status_code, r.json())  # -> 200 {'ok': True}

asyncio.run(main())
```

### `backend/app/main.py::list_projects`

**What it does:** The route `GET /api/projects`. It asks the upstream for all projects and cuts each one down to five short fields, so the list screen does not download long descriptions it never shows.

**Takes:** nothing (no parameters, no body).

**Returns:** a JSON list of `ProjectSummary` objects, for example `[{"id": "P-1", "name": "Solar Park Alpha", "sector": "energy", "country": "Chile", "stage": "feasibility"}]`. A `502` or `504` problem body if the upstream is down or slow (the client already retried the GET once).

**Example:**

```python
import asyncio
import httpx
from app.main import create_app
from tests.conftest import FakeUpstream, TimeoutAwareTransport


async def main():
    fake = FakeUpstream()
    app = create_app(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://backend.test") as web:
        rows = (await web.get("/api/projects")).json()
        print(len(rows))  # -> 2
        print(rows[0])  # -> {'id': 'P-1', 'name': 'Solar Park Alpha', 'sector': 'energy', 'country': 'Chile', 'stage': 'feasibility'}

asyncio.run(main())
```

### `backend/app/main.py::get_project`

**What it does:** The route `GET /api/projects/{project_id}`. It loads one project from the upstream and splits it into the part a person can edit (`editable`) and the part that is only shown (`readonly`). The browser keeps `editable` as its `base` for the next save. Do not confuse it with `UpstreamClient.get_project`, which is the method this route calls.

**Takes:** `project_id`: `str` taken from the URL, for example `"P-1"`.

**Returns:** `{"id": "P-1", "editable": {...six fields...}, "readonly": {...everything else...}}`. If the upstream has no such project the answer is a `404` problem body.

**Example:**

```python
import asyncio
import httpx
from app.main import create_app
from tests.conftest import FakeUpstream, TimeoutAwareTransport


async def main():
    fake = FakeUpstream()
    app = create_app(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://backend.test") as web:
        body = (await web.get("/api/projects/P-1")).json()
        print(body["editable"]["name"])  # -> Solar Park Alpha
        print(body["readonly"]["capacity"])  # -> 120 MW
        missing = await web.get("/api/projects/NOPE")
        print(missing.status_code, missing.json()["type"])  # -> 404 upstream_error

asyncio.run(main())
```

### `backend/app/main.py::put_project`

**What it does:** The route `PUT /api/projects/{project_id}`, the save button. It checks the body is a valid `SaveRequest` and hands it to `save_project`. If that fails with a 502 or 504 it adds the project's latest data to the error as `current`, so the form is not lost. Gotcha: a `504` here means "we do not know"; the data may or may not be saved, which is why the answer carries `current` to compare.

**Takes:**

- `project_id`: `str` from the URL, for example `"P-1"`.
- `req`: a `SaveRequest` JSON body, for example `{"base": {...}, "mine": {...}, "resolutions": {"stage": "mine"}}` (`resolutions` is optional).

**Returns:** `200 {"project": <same as GET>, "saved": true, "auto_merged": [keys]}` (plus `"confirmed_after_504": true` when a timeout turned out to be a saved write); `409` `ConflictResponse` when the same field changed on both sides; `404`/`422` pass through from the upstream; `502`/`504` with `current`.

**Example:**

```python
import asyncio
import httpx
from app.main import create_app
from tests.conftest import FakeUpstream, TimeoutAwareTransport, editable


async def main():
    fake = FakeUpstream()
    app = create_app(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://backend.test") as web:
        base = editable(fake)
        ok = await web.put("/api/projects/P-1", json={"base": base, "mine": {**base, "name": "Renamed"}})
        print(ok.status_code, ok.json()["project"]["editable"]["name"])  # -> 200 Renamed
        fake.edit_directly("P-2", stage="tender")  # the nightly import changes P-2
        base2 = editable(fake, "P-2")
        base2["stage"] = "idea"  # but this person still holds the old copy
        clash = await web.put("/api/projects/P-2", json={"base": base2, "mine": {**base2, "stage": "financing"}})
        print(clash.status_code, [c["key"] for c in clash.json()["conflicts"]])  # -> 409 ['stage']

asyncio.run(main())
```

### `backend/app/main.py::save_project`

**What it does:** The save procedure itself. It reads the project from the upstream, merges `mine` into it using `base`, and if there are no conflicts writes the result. Then it reads the project once more to check the write really landed. If the upstream answers `504` it does NOT retry blindly: it reads first, and only when the write did not land does it merge again and retry (at most `MAX_PUT_RETRIES` times). If the verification read shows someone else saved at the same moment, it answers `409` with type `concurrent_overwrite_detected`. If the merge changes nothing it skips the write and answers `saved: true`.

**Takes:**

- `client`: an `UpstreamClient`, for example `app.state.upstream`.
- `project_id`: `str`, for example `"P-1"`.
- `req`: a `SaveRequest` (see below), for example `SaveRequest(base=base, mine=mine)`.

**Returns:** a `JSONResponse`: `200` `{"project": ..., "saved": true, "auto_merged": [...]}` or `409` `ConflictResponse`. Raises `UpstreamError` for 404, 422, 502 and for a 504 that could not be confirmed.

**Example:**

```python
import asyncio
import json
from app.main import save_project
from app.models import SaveRequest
from app.upstream_client import UpstreamClient, editable_of
from tests.conftest import FakeUpstream, TimeoutAwareTransport


async def main():
    fake = FakeUpstream()
    client = UpstreamClient(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test")
    base = editable_of(fake.store["P-1"])
    fake.put_script = ["apply_504"]  # the upstream saves, then answers 504
    req = SaveRequest(base=base, mine={**base, "country": "Peru"})
    resp = await save_project(client, "P-1", req)
    body = json.loads(resp.body)
    print(resp.status_code, body["confirmed_after_504"])  # -> 200 True
    print(len(fake.puts))  # -> 1
    await client.close()

asyncio.run(main())
```

### `backend/app/main.py::problem`

**What it does:** Builds an error answer in the "problem" style (`application/problem+json`), so every error from this backend has the same shape: `type`, `status`, `title`, plus anything extra. The frontend can read errors with one piece of code.

**Takes:**

- `status`: `int`, for example `404`.
- `kind`: `str`, a short machine word, for example `"upstream_error"`.
- `title`: `str`, a sentence for people, for example `"The upstream answered 404"`.
- `**extra`: any more fields to put in the body, for example `detail="not found"`.

**Returns:** a `JSONResponse` with that status and the content type `application/problem+json`.

**Example:**

```python
from app.main import problem

r = problem(404, "upstream_error", "Not found", detail="nope")
print(r.status_code)  # -> 404
print(r.media_type)  # -> application/problem+json
print(r.body)  # -> b'{"type":"upstream_error","status":404,"title":"Not found","detail":"nope"}'
```

### `backend/app/main.py::display`

**What it does:** Turns a raw upstream project into the shape the browser gets: the six editable fields (validated and cleaned) under `editable`, and every other upstream field under `readonly`. This is how the backend stops the browser from editing fields it should only read.

**Takes:** `raw`: `dict`, one project as the upstream returns it, for example `{"id": "P-2", "name": "Port Beta", ..., "capacity": "2 km"}`. It must contain all six editable keys.

**Returns:** `{"id": ..., "editable": {...}, "readonly": {...}}`.

**Example:**

```python
from app.main import display
from tests.conftest import SEED

out = display(SEED["P-2"])
print(out["id"])  # -> P-2
print(out["editable"]["stage"])  # -> idea
print(out["readonly"])  # -> {'capacity': '2 km', 'description': 'x', 'capex_usd_m': 10}
```

### `backend/app/main.py::norm`

**What it does:** Puts a project's editable fields in one canonical form (through the `Editable` model) so two snapshots can be compared with `==`. It also rejects bad data: an unknown `stage` raises a validation error.

**Takes:** `data`: `dict` with the six editable fields, for example `{"name": "Port Beta", "sector": "transport", "country": "Peru", "stage": "idea", "key_dates": [], "linked_companies": []}`.

**Returns:** a plain `dict` with the same six fields, JSON-ready. Raises `pydantic.ValidationError` if a value is not allowed.

**Example:**

```python
from pydantic import ValidationError
from app.main import norm
from app.upstream_client import editable_of
from tests.conftest import SEED

good = norm(editable_of(SEED["P-2"]))
print(good["sector"])  # -> transport
try:
    norm({**good, "stage": "nope"})
except ValidationError as exc:
    print(type(exc).__name__)  # -> ValidationError
```

### `backend/app/main.py::conflict_response`

**What it does:** Builds the `409` answer. It carries `current` (what the upstream holds now, shown in the dialog; the browser keeps its original `base`), the list of `conflicts` for the dialog, and the keys that merged cleanly.

**Takes:**

- `kind`: `str`, either `"conflict"` or `"concurrent_overwrite_detected"`.
- `title`: `str`, a sentence for people.
- `current`: `dict`, an editable snapshot.
- `conflicts`: `list[Conflict]`, may be empty (the overwrite case).
- `auto_merged`: `list[str]`, for example `["name"]`.

**Returns:** a `JSONResponse` with status 409 and content type `application/problem+json`.

**Example:**

```python
import json
from app.main import conflict_response
from app.models import Conflict
from app.upstream_client import editable_of
from tests.conftest import SEED

c = Conflict(key="stage", field="stage", base="idea", mine="tender", theirs="financing")
r = conflict_response("conflict", "Changed while editing", editable_of(SEED["P-2"]), [c], ["name"])
body = json.loads(r.body)
print(r.status_code, body["type"], body["auto_merged"])  # -> 409 conflict ['name']
print(body["conflicts"][0]["theirs"])  # -> financing
```

## Backend · app/merge.py

The heart of safe concurrent editing: a pure three-way merge (no network, no globals) that decides, field by field, whose change survives.

### `backend/app/merge.py::three_way_merge`

**What it does:** Merges your edit into the latest data. Every project is cut into small fields (`name`, `stage`, one key date, one linked company...). For each field it looks at three values: `base` (what you opened), `mine` and `current` (what the upstream has now). Untouched by you: keep current (this protects the nightly import). Only you changed it: take yours. Only they changed it: keep theirs. Both changed it to the same value: fine. Both changed it differently: a conflict. Gotcha: because the upstream replaces whole lists, the merge works on single list items, then rebuilds the full list, so two people editing different key dates both survive.

**Takes:**

- `base`: `dict`, the editable snapshot the person loaded, for example `{"name": "Solar", "stage": "tender", ...}`.
- `mine`: `dict`, the snapshot with the person's edits.
- `current`: `dict`, the snapshot the upstream holds now.
- `resolutions`: `dict[str, "mine" | "theirs"] | None`, the person's choice per conflicting key, for example `{"stage": "mine"}`.
- `seen`: `dict[str, str | None] | None`, per key the `theirs` value the person saw in the 409, for example `{"stage": "construction"}`. A choice counts only while the current value still equals it; otherwise the conflict stays open.

**Returns:** a `MergeResult`. `merged` is the full snapshot to write; `conflicts` are the undecided ones (an undecided field keeps the current value in `merged`); `auto_merged` lists keys that merged without a fight.

**Example:**

```python
from app.merge import three_way_merge

base = {"name": "Solar", "sector": "energy", "country": "Chile", "stage": "tender", "key_dates": [], "linked_companies": []}
mine = {**base, "name": "Solar Park"}  # I renamed it
current = {**base, "country": "Peru"}  # someone moved the country
r = three_way_merge(base, mine, current)
print(r.merged["name"], r.merged["country"])  # -> Solar Park Peru
print(r.conflicts)  # -> []
print(r.auto_merged)  # -> ['name', 'country']

clash = three_way_merge(base, {**base, "stage": "financing"}, {**base, "stage": "construction"})
print([(c.key, c.mine, c.theirs) for c in clash.conflicts])  # -> [('stage', 'financing', 'construction')]
print(clash.merged["stage"])  # -> construction
chosen = three_way_merge(base, {**base, "stage": "financing"}, {**base, "stage": "construction"}, {"stage": "mine"})
print(chosen.merged["stage"], chosen.conflicts)  # -> financing []
stale = three_way_merge(base, {**base, "stage": "financing"}, {**base, "stage": "construction"}, {"stage": "mine"}, {"stage": "idea"})
print([c.key for c in stale.conflicts], stale.merged["stage"])  # -> ['stage'] construction
```

### `backend/app/merge.py::flatten`

**What it does:** Cuts a project snapshot into its comparable fields. Scalars (`name`, `sector`, `country`, `stage`) are one field each. Each key date is one field keyed by its label, so "Award" is compared with "Award" even if the list order changed. Each linked company is one field keyed by its name.

**Takes:** `snapshot`: `dict`, an editable snapshot, for example `{"stage": "tender", "key_dates": [{"label": "Award", "date": "2027-01-01"}]}`. Missing keys are skipped.

**Returns:** `dict[str, FlatField]` keyed by the field key, for example `{"stage": ..., "key_dates:award": ...}`.

**Example:**

```python
from app.merge import flatten

flat = flatten({
    "stage": "tender",
    "key_dates": [{"label": "Award", "date": "2027-01-01"}, {"label": "Award", "date": "2027-02-01"}],
    "linked_companies": [{"name": "Acme", "role": "owner"}],
})
print(list(flat))  # -> ['stage', 'key_dates:award', 'key_dates:award#2', 'linked_companies:acme']
print(flat["key_dates:award"].value)  # -> 2027-01-01
print(flat["linked_companies:acme"].value)  # -> owner
```

### `backend/app/merge.py::decide`

**What it does:** The single rule that settles one field. It looks at three values where `None` means "this field does not exist there" (so adding or deleting a field is handled by the same rule).

**Takes:** `base`, `mine`, `current`: each `str | None`, for example `"tender"`, `"financing"`, `"construction"`.

**Returns:** one of the strings `"current"` (keep what the upstream has), `"mine"` (take my value) or `"conflict"`.

**Example:**

```python
from app.merge import decide

print(decide("a", "a", "b"))  # -> current
print(decide("a", "b", "a"))  # -> mine
print(decide("a", "b", "b"))  # -> current
print(decide("a", "b", "c"))  # -> conflict
print(decide(None, "x", None))  # -> mine
```

### `backend/app/merge.py::apply_resolutions`

**What it does:** Takes the conflicts and the person's choices from the dialog and splits them into "decided" and "still open". A choice only counts if it is exactly `"mine"` or `"theirs"`. Keys are matched ignoring case after the colon, so `key_dates:Award` finds `key_dates:award`.

**Takes:**

- `conflicts`: `list[Conflict]`.
- `resolutions`: `dict[str, str] | None`, for example `{"stage": "mine"}`.
- `seen`: `dict[str, str | None] | None`, the `theirs` value the person saw per key, for example `{"stage": "z"}`.

**Returns:** a tuple `(chosen, unresolved)`: `chosen` is `{"stage": "mine"}`-shaped, `unresolved` is the list of conflicts with no valid choice. A choice whose key is in `seen` is valid only while the conflict's current (`theirs`) value still equals the seen value; if the other person changed it again, the conflict stays unresolved so the person decides again.

**Example:**

```python
from app.merge import apply_resolutions
from app.models import Conflict

a = Conflict(key="stage", field="stage", base="x", mine="y", theirs="z")
b = Conflict(key="country", field="country", base="x", mine="y", theirs="z")
chosen, left = apply_resolutions([a, b], {"stage": "mine", "country": "maybe"})
print(chosen)  # -> {'stage': 'mine'}
print([c.key for c in left])  # -> ['country']
chosen, left = apply_resolutions([a], {"stage": "mine"}, {"stage": "old"})
print(chosen, [c.key for c in left])  # -> {} ['stage']
```

### `backend/app/merge.py::normalise_text`

**What it does:** Makes any value a trimmed string, so `" Chile "`, `"Chile"` and `None` compare predictably (`None` becomes an empty string).

**Takes:** `value`: anything, for example `"  Chile "`, `None`, `42`.

**Returns:** `str`.

**Example:**

```python
from app.merge import normalise_text

print(repr(normalise_text("  Chile ")))  # -> 'Chile'
print(repr(normalise_text(None)))  # -> ''
print(repr(normalise_text(42)))  # -> '42'
```

### `backend/app/merge.py::normalise_date`

**What it does:** Makes dates comparable. The upstream may hand back `2027-01-01T00:00:00Z`; the form sends `2027-01-01`. Both must count as the same date, or a harmless re-format would look like a conflict.

**Takes:** `value`: a date-like value, for example `"2027-01-01T08:30:00Z"` or `"2027-01-01"`.

**Returns:** `str` `YYYY-MM-DD`. Text that is not a date comes back trimmed and unchanged.

**Example:**

```python
from app.merge import normalise_date

print(normalise_date("2027-01-01T08:30:00Z"))  # -> 2027-01-01
print(normalise_date(" 2027-01-01 "))  # -> 2027-01-01
print(normalise_date("soon"))  # -> soon
```

### `backend/app/merge.py::normalise_key`

**What it does:** Makes a field key safe to compare: trims it, and lower-cases the part after the first colon (the label). This is the rule that makes "Award" and "award" the same key date.

**Takes:** `key`: `str`, for example `"key_dates: Award "` or `"stage"`.

**Returns:** `str`, for example `"key_dates:award"`. A key without a colon is only trimmed.

**Example:**

```python
from app.merge import normalise_key

print(normalise_key("key_dates: Award "))  # -> key_dates:award
print(normalise_key(" stage "))  # -> stage
```

### `backend/app/merge.py::same_field_key`

**What it does:** Answers "do these two keys point to the same field?". Use it whenever you compare keys that came from a person or from the browser, instead of `==`.

**Takes:** `a`, `b`: `str` keys, for example `"key_dates:Award"` and `"key_dates:award"`.

**Returns:** `bool`.

**Example:**

```python
from app.merge import same_field_key

print(same_field_key("key_dates:Award", "key_dates:award"))  # -> True
print(same_field_key("stage", "country"))  # -> False
```

### `backend/app/merge.py::key_date_key`

**What it does:** Builds the key of one key date from its label. This is where the rule "key dates are compared by label" lives, so changing how two dates count as "the same" starts here. If one project has the same label twice, the second one becomes `#2`, so neither is lost.

**Takes:**

- `label`: `str`, for example `"Award"`.
- `occurrence`: `int`, default `1`; pass `2` for the second use of the label.

**Returns:** `str`, for example `"key_dates:award"` or `"key_dates:award#2"`.

**Example:**

```python
from app.merge import key_date_key

print(key_date_key("Award"))  # -> key_dates:award
print(key_date_key("  AWARD ", 2))  # -> key_dates:award#2
```

### `backend/app/merge.py::FlatField`

**What it does:** A small frozen record for one comparable field, produced by `flatten`: its `key`, which editable `field` it belongs to, a human `label` (a key date's label or a company's name, `None` for scalars), its `value` as a string, and for linked companies the `role`.

**Takes:** `key: str` (`"key_dates:award"`), `field: str` (`"key_dates"`), `label: str | None` (`"Award"`), `value: str` (`"2027-01-01"`), `role: str | None = None`.

**Returns:** an immutable dataclass instance (you cannot change its attributes after creating it).

**Example:**

```python
from app.merge import FlatField

f = FlatField("key_dates:award", "key_dates", "Award", "2027-01-01")
print(f)  # -> FlatField(key='key_dates:award', field='key_dates', label='Award', value='2027-01-01', role=None)
```

### `backend/app/merge.py::MergeResult`

**What it does:** What `three_way_merge` returns, as a pydantic model: `merged` is the whole snapshot ready to PUT, `conflicts` the fields nobody has decided, `auto_merged` the keys that changed on one side only. If `conflicts` is not empty, do not save `merged`; show the dialog.

**Takes:** `merged: dict` (`{"name": "Solar", ...}`), `conflicts: list[Conflict]` (`[]`), `auto_merged: list[str]` (`["country"]`).

**Returns:** a `MergeResult`; `model_dump_json()` gives the JSON.

**Example:**

```python
from app.merge import MergeResult

r = MergeResult(merged={"stage": "tender"}, conflicts=[], auto_merged=["stage"])
print(r.model_dump_json())  # -> {"merged":{"stage":"tender"},"conflicts":[],"auto_merged":["stage"]}
```

## Backend · app/upstream_client.py

The only code that talks to the upstream records API: one shared HTTP client, the API key header, timeouts, one retry for reads, and none for writes.

### `backend/app/upstream_client.py::UpstreamClient`

**What it does:** The class that holds the one HTTP connection pool to the upstream. It adds the `X-Api-Key` header to every request, applies the connect and read timeouts from `config.py`, logs every call with its duration, and turns every failure into an `UpstreamError` with the status the browser should see. Create one per app, never one per request. Keep any new upstream call inside this class; no other file should import `httpx` for the upstream.

**Takes:**

- `transport`: `httpx.AsyncBaseTransport | None`, a fake network for tests, default `None` (real network).
- `base_url`: `str | None`, for example `"http://127.0.0.1:8081"`; `None` reads `UPSTREAM_URL`.
- `api_key`: `str | None`; `None` reads `UPSTREAM_API_KEY`.

**Returns:** a client with the methods `list_projects`, `get_project`, `put_project` and `close`.

**Example:**

```python
import asyncio
from app.upstream_client import UpstreamClient
from tests.conftest import FakeUpstream, TimeoutAwareTransport


async def main():
    fake = FakeUpstream()
    client = UpstreamClient(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test", api_key="k1")
    await client.list_projects()
    print(fake.requests)  # -> [('GET', '/projects', 'k1')]
    await client.close()

asyncio.run(main())
```

### `backend/app/upstream_client.py::UpstreamClient.list_projects`

**What it does:** Fetches every project from the upstream (`GET /projects`). A timeout or a 5xx is retried once because a read is safe to repeat; the upstream is sometimes slow (about 2 seconds).

**Takes:** nothing besides `self`.

**Returns:** `list[dict]`, each a full raw project. Raises `UpstreamError` (status 502 or 504) if both tries fail.

**Example:**

```python
import asyncio
from app.upstream_client import UpstreamClient
from tests.conftest import FakeUpstream, TimeoutAwareTransport


async def main():
    fake = FakeUpstream()
    client = UpstreamClient(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test")
    rows = await client.list_projects()
    print([r["id"] for r in rows])  # -> ['P-1', 'P-2']
    await client.close()

asyncio.run(main())
```

### `backend/app/upstream_client.py::UpstreamClient.get_project`

**What it does:** Fetches one project (`GET /projects/{id}`) with the same one-retry rule as the list. A `404` or `422` is final and not retried: the answer will not change.

**Takes:** `project_id`: `str`, for example `"P-1"`.

**Returns:** `dict`, the raw project. Raises `UpstreamError(404, ...)` if it does not exist.

**Example:**

```python
import asyncio
from app.upstream_client import UpstreamClient, UpstreamError
from tests.conftest import FakeUpstream, TimeoutAwareTransport


async def main():
    fake = FakeUpstream()
    client = UpstreamClient(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test")
    print((await client.get_project("P-1"))["name"])  # -> Solar Park Alpha
    try:
        await client.get_project("NOPE")
    except UpstreamError as exc:
        print(exc.status)  # -> 404
    await client.close()

asyncio.run(main())
```

### `backend/app/upstream_client.py::UpstreamClient.put_project`

**What it does:** Writes the six editable fields (`PUT /projects/{id}`). It is never retried here, on purpose: after a `504` the write may already be applied, so only the caller, who can re-read first, may decide to retry. The upstream needs all six fields and replaces the lists whole.

**Takes:**

- `project_id`: `str`, for example `"P-1"`.
- `editable`: `dict` with all six editable fields (see `editable_of`).

**Returns:** `dict`, the project as the upstream stored it. Raises `UpstreamError` (504 on timeout, 502 if unreachable, 422 if the values are invalid).

**Example:**

```python
import asyncio
from app.upstream_client import UpstreamClient, UpstreamError, editable_of
from tests.conftest import FakeUpstream, TimeoutAwareTransport


async def main():
    fake = FakeUpstream()
    client = UpstreamClient(transport=TimeoutAwareTransport(app=fake.app), base_url="http://upstream.test")
    data = editable_of(fake.store["P-1"])
    fake.put_script = ["drop_504"]  # the upstream fails and does not save
    try:
        await client.put_project("P-1", {**data, "name": "New"})
    except UpstreamError as exc:
        print(exc.status, len(fake.puts))  # -> 504 1
    print(fake.store["P-1"]["name"])  # -> Solar Park Alpha
    await client.close()

asyncio.run(main())
```

### `backend/app/upstream_client.py::UpstreamClient.close`

**What it does:** Closes the shared HTTP connection pool. `create_app` calls it for you when the app shuts down; call it yourself only in scripts and tests that build a client by hand.

**Takes:** nothing besides `self`.

**Returns:** `None` (it is `async`, so write `await client.close()`).

**Example:**

```python
import asyncio
from app.upstream_client import UpstreamClient
from tests.conftest import FakeUpstream, TimeoutAwareTransport


async def main():
    client = UpstreamClient(transport=TimeoutAwareTransport(app=FakeUpstream().app), base_url="http://upstream.test")
    print(client._http.is_closed)  # -> False
    await client.close()
    print(client._http.is_closed)  # -> True

asyncio.run(main())
```

### `backend/app/upstream_client.py::UpstreamError`

**What it does:** The one exception type for anything that goes wrong with the upstream. It carries the status the browser should see, so `create_app`'s error handler can turn it into a JSON answer without more logic. The mapping: upstream 404 and 422 pass through, a timeout or an upstream 504 becomes 504, everything else becomes 502.

**Takes:** `status: int` (`504`), `detail: str` (`"The upstream did not answer in time"`), `body: object = None` (the upstream's JSON error, or `{"current": {...}}` added by the save procedure).

**Returns:** an exception with the attributes `.status`, `.detail`, `.body`.

**Example:**

```python
from app.upstream_client import UpstreamError

try:
    raise UpstreamError(504, "The upstream did not answer in time")
except UpstreamError as exc:
    print(exc.status, exc.detail, exc.body)  # -> 504 The upstream did not answer in time None
```

### `backend/app/upstream_client.py::editable_of`

**What it does:** Keeps only the six fields the upstream PUT accepts (`EDITABLE_KEYS`), dropping `id`, `capacity`, `description` and every read-only field. To make another field editable, add it to `EDITABLE_KEYS` and to the `Editable` model.

**Takes:** `project`: `dict`, a raw upstream project that has all six keys, for example `{"id": "P-2", "name": "Port Beta", ..., "capacity": "2 km"}`.

**Returns:** `dict` with exactly `name`, `sector`, `country`, `stage`, `key_dates`, `linked_companies`. Raises `KeyError` if one is missing.

**Example:**

```python
from app.upstream_client import editable_of
from tests.conftest import SEED

print(sorted(editable_of(SEED["P-2"])))  # -> ['country', 'key_dates', 'linked_companies', 'name', 'sector', 'stage']
```

## Backend · app/models.py

The data shapes (pydantic models) that the routes accept and return; they reject invalid values before any code runs.

### `backend/app/models.py::KeyDate`

**What it does:** One milestone of a project: a label ("Award") and a date. The label is what identifies the key date during a merge.

**Takes:** `label: str` (at least 1 character, `"Award"`), `date: str` (format `YYYY-MM-DD`, `"2027-03-01"`).

**Returns:** a `KeyDate`; as JSON `{"label": "Award", "date": "2027-03-01"}`. A bad date such as `"01/03/2027"` raises `ValidationError`.

**Example:**

```python
from app.models import KeyDate

print(KeyDate(label="Award", date="2027-03-01").model_dump_json())  # -> {"label":"Award","date":"2027-03-01"}
```

### `backend/app/models.py::LinkedCompany`

**What it does:** A company attached to a project, with its role. The company name identifies it during a merge.

**Takes:** `name: str` (`"Varelo SA"`), `role`: one of `owner`, `developer`, `epc_contractor`, `financier`, `consultant`.

**Returns:** a `LinkedCompany`; as JSON `{"name": "Varelo SA", "role": "owner"}`. An unknown role raises `ValidationError`.

**Example:**

```python
from app.models import LinkedCompany

print(LinkedCompany(name="Varelo SA", role="owner").model_dump_json())  # -> {"name":"Varelo SA","role":"owner"}
```

### `backend/app/models.py::Editable`

**What it does:** The six fields a person may change; exactly what the upstream PUT accepts. It is both the validation gate and the definition of "editable". To add an editable field, add it here, in `EDITABLE_KEYS` and in `merge.flatten`.

**Takes:** `name: str` (`"Port Beta"`), `sector` (`energy`, `mining`, `water`, `transport`, `oil_and_gas` or `ict`), `country: str` (`"Peru"`), `stage` (`idea`, `feasibility`, `tender`, `financing`, `construction`, `operation` or `cancelled`), `key_dates: list[KeyDate]`, `linked_companies: list[LinkedCompany]`.

**Returns:** an `Editable`; as JSON `{"name": "Port Beta", "sector": "transport", "country": "Peru", "stage": "idea", "key_dates": [], "linked_companies": []}`.

**Example:**

```python
from app.models import Editable

e = Editable(name="Port Beta", sector="transport", country="Peru", stage="idea", key_dates=[], linked_companies=[])
print(e.model_dump_json())  # -> {"name":"Port Beta","sector":"transport","country":"Peru","stage":"idea","key_dates":[],"linked_companies":[]}
```

### `backend/app/models.py::SaveRequest`

**What it does:** The body of `PUT /api/projects/{id}`. It carries the three things the stateless backend needs: `base` (the snapshot the browser loaded), `mine` (the values to save) and, after a conflict, `resolutions` (the person's choice for each conflicting key) plus `seen` (the `theirs` value each conflict showed). The client keeps the ORIGINAL `base` on the retry, never `base = current`.

**Takes:** `base: Editable`, `mine: Editable`, `resolutions: dict[str, "mine" | "theirs"] | None = None`, for example `{"stage": "mine"}`; `seen: dict[str, str | None] | None = None`, for example `{"stage": "construction"}` (the `theirs` value the 409 showed for that key). Without `seen` a choice is applied as given.

**Returns:** a `SaveRequest`; example JSON `{"base": {...}, "mine": {...}, "resolutions": {"stage": "mine"}, "seen": {"stage": "construction"}}`.

**Example:**

```python
from app.models import Editable, SaveRequest

e = Editable(name="Port Beta", sector="transport", country="Peru", stage="idea", key_dates=[], linked_companies=[])
req = SaveRequest(base=e, mine=e, resolutions={"stage": "mine"})
print(req.resolutions)  # -> {'stage': 'mine'}
print(SaveRequest(base=e, mine=e).resolutions)  # -> None
print(SaveRequest(base=e, mine=e, seen={"stage": "construction"}).seen)  # -> {'stage': 'construction'}
```

### `backend/app/models.py::Conflict`

**What it does:** One field that both sides changed differently. The conflict dialog shows one of these per row, with the three values side by side.

**Takes:** `key: str` (`"key_dates:award"`), `field: str` (`"key_dates"`), `label: str | None` (`"Award"`), `base`, `mine`, `theirs`: each `str | None` (`"2027-01-01"`, `"2027-02-01"`, `"2027-03-01"`; `None` means the field does not exist on that side).

**Returns:** a `Conflict`; as JSON `{"key": "stage", "field": "stage", "label": null, "base": "idea", "mine": "tender", "theirs": "financing"}`.

**Example:**

```python
from app.models import Conflict

c = Conflict(key="stage", field="stage", base="idea", mine="tender", theirs="financing")
print(c.model_dump_json())  # -> {"key":"stage","field":"stage","label":null,"base":"idea","mine":"tender","theirs":"financing"}
```

### `backend/app/models.py::ConflictResponse`

**What it does:** The body of every `409`. `current` is the project as the upstream holds it now; the browser shows it and the `conflicts` in the dialog (it does not become the new `base`; the browser keeps the ORIGINAL one) and sends the choices back as `resolutions` plus `seen`. `type` is `conflict` normally, or `concurrent_overwrite_detected` when someone saved between our write and our check (our write landed and was overwritten; `conflicts` is empty).

**Takes:** `current: Editable`, `conflicts: list[Conflict]`, `auto_merged: list[str] = []` (`["name"]`), `type: str = "conflict"`, `status: int = 409`, `title: str` (default "The project changed while you were editing").

**Returns:** a `ConflictResponse`; example JSON `{"type": "conflict", "status": 409, "title": "...", "current": {...}, "conflicts": [...], "auto_merged": []}`.

**Example:**

```python
from app.models import ConflictResponse, Editable

e = Editable(name="Port Beta", sector="transport", country="Peru", stage="idea", key_dates=[], linked_companies=[])
r = ConflictResponse(current=e, conflicts=[])
print(r.type, r.status)  # -> conflict 409
print(r.title)  # -> The project changed while you were editing
```

### `backend/app/models.py::ProjectSummary`

**What it does:** One row of the project list: only the five short fields the list screen shows.

**Takes:** `id: str` (`"P-1"`), `name: str`, `sector: str`, `country: str`, `stage: str` (plain strings here, no validation of allowed values).

**Returns:** a `ProjectSummary`; as JSON `{"id": "P-1", "name": "Solar Park Alpha", "sector": "energy", "country": "Chile", "stage": "feasibility"}`.

**Example:**

```python
from app.models import ProjectSummary

s = ProjectSummary(id="P-1", name="Solar Park Alpha", sector="energy", country="Chile", stage="feasibility")
print(s.model_dump_json())  # -> {"id":"P-1","name":"Solar Park Alpha","sector":"energy","country":"Chile","stage":"feasibility"}
```

## Backend · app/config.py

Settings read from environment variables once, when the module is imported. It has no functions, so there is nothing for the coverage script to list, but you will edit it often.

| Setting | Environment variable | Default | What it controls |
|---|---|---|---|
| `UPSTREAM_URL` | `UPSTREAM_URL` | `http://127.0.0.1:8081` | Where the upstream API lives (trailing `/` removed). |
| `UPSTREAM_API_KEY` | `UPSTREAM_API_KEY` | `local-dev-key` | Sent as the `X-Api-Key` header. A local development key, never a real secret. |
| `CONNECT_TIMEOUT` | `UPSTREAM_CONNECT_TIMEOUT` | `2` seconds | How long to wait to open a connection. |
| `READ_TIMEOUT` | `UPSTREAM_READ_TIMEOUT` | `5` seconds | How long to wait for an answer; above the upstream's usual 2 s delay. |
| `MAX_PUT_RETRIES` | `UPSTREAM_MAX_PUT_RETRIES` | `2` | How many times a save is merged and retried after a confirmed-not-saved `504`. |

Example: `UPSTREAM_READ_TIMEOUT=10 uv run uvicorn app.main:app --port 8000` waits up to 10 seconds for the upstream.

## Backend · app/__init__.py

An empty file that makes `app` a Python package so `from app.merge import three_way_merge` works. It defines no functions.

