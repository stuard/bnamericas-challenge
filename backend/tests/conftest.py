"""Test kit: an in-memory fake upstream (ASGI, no network) and helpers to build app instances."""

import copy
import importlib
import sys
import types

import httpx
import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

try:
    importlib.import_module("app.merge")
except ImportError:  # cell 1 has not joined yet: stand-in with the same interface
    from app.models import Conflict

    def _flat(d):
        out = {k: d[k] for k in ("name", "sector", "country", "stage")}
        out.update({f"key_dates:{x['label']}": x["date"] for x in d["key_dates"]})
        out.update({f"companies:{x['name']}": x["role"] for x in d["linked_companies"]})
        return out

    def three_way_merge(base, mine, current, resolutions=None):
        b, m, c = _flat(base), _flat(mine), _flat(current)
        res, conflicts, auto = {}, [], []
        for k in list(dict.fromkeys([*c, *m, *b])):
            bv, mv, cv = b.get(k), m.get(k), c.get(k)
            if mv == bv:
                v = cv
            elif cv == bv or cv == mv:
                v = mv
                if cv == bv:
                    auto.append(k)
            else:
                pick = (resolutions or {}).get(k)
                if pick is None:
                    conflicts.append(Conflict(key=k, field=k.split(":")[0], label=k.split(":", 1)[-1],
                                              base=bv, mine=mv, theirs=cv))
                    continue
                v = mv if pick == "mine" else cv
            if v is not None:
                res[k] = v
        merged = {k: res.get(k, current[k]) for k in ("name", "sector", "country", "stage")}
        merged["key_dates"] = [{"label": k.split(":", 1)[1], "date": v} for k, v in res.items() if k.startswith("key_dates:")]
        merged["linked_companies"] = [{"name": k.split(":", 1)[1], "role": v} for k, v in res.items() if k.startswith("companies:")]
        return types.SimpleNamespace(merged=merged, conflicts=conflicts, auto_merged=auto)

    mod = types.ModuleType("app.merge")
    mod.three_way_merge = three_way_merge
    sys.modules["app.merge"] = mod
    import app
    app.merge = mod

from app import config  # noqa: E402
from app.main import create_app  # noqa: E402

SEED = {
    "P-1": {
        "id": "P-1", "name": "Solar Park Alpha", "sector": "energy", "country": "Chile", "stage": "feasibility",
        "key_dates": [{"label": "Tender launch", "date": "2027-01-01"}, {"label": "Award", "date": "2027-03-01"}],
        "linked_companies": [{"name": "Varelo SA", "role": "owner"}],
        "capacity": "120 MW", "description": "Read-only text", "capex_usd_m": 300,
    },
    "P-2": {
        "id": "P-2", "name": "Port Beta", "sector": "transport", "country": "Peru", "stage": "idea",
        "key_dates": [], "linked_companies": [], "capacity": "2 km", "description": "x", "capex_usd_m": 10,
    },
}


class TimeoutAwareTransport(httpx.ASGITransport):
    """ASGITransport ignores timeouts; this one raises ReadTimeout like a real network would."""

    async def handle_async_request(self, request):
        import asyncio
        limit = request.extensions.get("timeout", {}).get("read")
        try:
            return await asyncio.wait_for(super().handle_async_request(request), limit)
        except asyncio.TimeoutError as exc:
            raise httpx.ReadTimeout("read timeout", request=request) from exc


class FakeUpstream:
    """Records every request; put_script is consumed one entry per PUT: ok | apply_504 | drop_504."""

    def __init__(self):
        self.store = copy.deepcopy(SEED)
        self.put_script: list[str] = []
        self.get_delays: list[float] = []
        self.requests: list[tuple[str, str, str | None]] = []
        self.puts: list[dict] = []
        self.force_422 = False
        self.app = self._build()

    def edit_directly(self, project_id: str, **fields):
        """What the nightly import does: write upstream without going through the backend."""
        self.store[project_id].update(fields)

    def _build(self) -> FastAPI:
        fake, app = self, FastAPI()

        @app.middleware("http")
        async def log(request: Request, call_next):
            fake.requests.append((request.method, request.url.path, request.headers.get("x-api-key")))
            return await call_next(request)

        @app.get("/projects")
        async def lst():
            return copy.deepcopy(list(fake.store.values()))

        @app.get("/projects/{pid}")
        async def get(pid: str):
            if fake.get_delays:
                import asyncio
                await asyncio.sleep(fake.get_delays.pop(0))
            if pid not in fake.store:
                raise HTTPException(404, "not found")
            return copy.deepcopy(fake.store[pid])

        @app.put("/projects/{pid}")
        async def put(pid: str, request: Request):
            if pid not in fake.store:
                raise HTTPException(404, "not found")
            body = await request.json()
            if fake.force_422:
                return JSONResponse({"detail": "name required"}, status_code=422)
            fake.puts.append(body)
            mode = fake.put_script.pop(0) if fake.put_script else "ok"
            if mode in ("ok", "apply_504"):
                fake.store[pid].update(copy.deepcopy(body))
            if mode in ("apply_504", "drop_504"):
                raise HTTPException(504, "Gateway timeout")
            return copy.deepcopy(fake.store[pid])

        return app


@pytest.fixture
def upstream() -> FakeUpstream:
    return FakeUpstream()


@pytest.fixture
def make_app(upstream):
    """Each call builds an independent create_app() instance sharing only the fake upstream."""
    def build():
        return create_app(transport=TimeoutAwareTransport(app=upstream.app), base_url="http://upstream.test")
    return build


@pytest.fixture
async def client(make_app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=make_app()), base_url="http://backend.test") as c:
        yield c


def editable(upstream: FakeUpstream, pid: str = "P-1") -> dict:
    return {k: copy.deepcopy(upstream.store[pid][k])
            for k in ("name", "sector", "country", "stage", "key_dates", "linked_companies")}
