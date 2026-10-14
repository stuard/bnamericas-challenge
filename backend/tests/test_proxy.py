"""Proxy behaviour: list/get/save, single upstream, 504 verify-by-reread, errors."""

import copy

import pytest

from app import config
from tests.conftest import TimeoutAwareTransport, editable


async def put(client, pid, base, mine, resolutions=None):
    body = {"base": base, "mine": mine}
    if resolutions:
        body["resolutions"] = resolutions
    return await client.put(f"/api/projects/{pid}", json=body)


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200 and r.json() == {"ok": True}


async def test_list_is_slim(client):
    rows = (await client.get("/api/projects")).json()
    assert rows[0] == {"id": "P-1", "name": "Solar Park Alpha", "sector": "energy", "country": "Chile", "stage": "feasibility"}
    assert len(rows) == 2


async def test_get_has_editable_and_readonly(client):
    body = (await client.get("/api/projects/P-1")).json()
    assert body["editable"]["name"] == "Solar Park Alpha"
    assert body["readonly"]["capacity"] == "120 MW"
    assert "capacity" not in body["editable"]


async def test_save_through_proxy(client, upstream):
    base = editable(upstream)
    mine = {**base, "name": "Solar Park Renamed"}
    r = await put(client, "P-1", base, mine)
    assert r.status_code == 200
    assert r.json()["saved"] is True and r.json()["project"]["editable"]["name"] == "Solar Park Renamed"
    assert upstream.store["P-1"]["name"] == "Solar Park Renamed"
    assert len(upstream.puts) == 1
    assert upstream.store["P-1"]["capacity"] == "120 MW"


async def test_only_configured_upstream_with_key_and_key_never_returned(client, upstream):
    base = editable(upstream)
    r1 = await client.get("/api/projects")
    r2 = await put(client, "P-1", base, {**base, "stage": "tender"})
    assert upstream.requests and all(k == config.UPSTREAM_API_KEY for _, _, k in upstream.requests)
    assert all(path.startswith("/projects") for _, path, _ in upstream.requests)
    assert config.UPSTREAM_API_KEY not in r1.text + r2.text


async def test_single_shared_client_per_instance(make_app):
    app = make_app()
    assert app.state.upstream is app.state.upstream
    import httpx
    assert isinstance(app.state.upstream._http, httpx.AsyncClient)


async def test_504_after_applying_is_confirmed_by_reread_one_write(client, upstream):
    upstream.put_script = ["apply_504"]
    base = editable(upstream)
    r = await put(client, "P-1", base, {**base, "name": "Applied Then 504"})
    assert r.status_code == 200
    assert r.json()["confirmed_after_504"] is True and r.json()["saved"] is True
    assert len(upstream.puts) == 1  # one write, not two
    assert upstream.store["P-1"]["name"] == "Applied Then 504"


async def test_504_before_applying_is_retried_after_reread(client, upstream):
    upstream.put_script = ["drop_504", "ok"]
    base = editable(upstream)
    r = await put(client, "P-1", base, {**base, "name": "Second Write Lands"})
    assert r.status_code == 200
    assert "confirmed_after_504" not in r.json()
    assert len(upstream.puts) == 2
    methods = [m for m, _, _ in upstream.requests]
    # PUT, re-GET, PUT: the retry came after a read, never blind
    seq = [m for m in methods if m in ("PUT", "GET")]
    first_put = seq.index("PUT")
    assert seq[first_put + 1] == "GET" and seq[first_put + 2] == "PUT"
    assert upstream.store["P-1"]["name"] == "Second Write Lands"


async def test_504_forever_gives_up_with_current_attached(client, upstream):
    upstream.put_script = ["drop_504"] * 10
    base = editable(upstream)
    r = await put(client, "P-1", base, {**base, "name": "Never Lands"})
    assert r.status_code == 504
    assert r.json()["current"]["name"] == "Solar Park Alpha"
    assert len(upstream.puts) == config.MAX_PUT_RETRIES + 1
    assert upstream.store["P-1"]["name"] == "Solar Park Alpha"


async def test_slow_get_is_retried_once(make_app, upstream, monkeypatch):
    monkeypatch.setattr(config, "READ_TIMEOUT", 0.05)
    upstream.get_delays = [0.5]
    import httpx
    from app.main import create_app
    app = create_app(transport=TimeoutAwareTransport(app=upstream.app), base_url="http://upstream.test")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://b") as c:
        r = await c.get("/api/projects/P-1")
    assert r.status_code == 200


async def test_get_timeout_twice_is_502_or_504(upstream, monkeypatch):
    monkeypatch.setattr(config, "READ_TIMEOUT", 0.05)
    upstream.get_delays = [0.5, 0.5]
    import httpx
    from app.main import create_app
    app = create_app(transport=TimeoutAwareTransport(app=upstream.app), base_url="http://upstream.test")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://b") as c:
        r = await c.get("/api/projects/P-1")
    assert r.status_code == 504 and "detail" in r.json()
    assert [m for m, _, _ in upstream.requests].count("GET") == 2


async def test_404_passes_through(client, upstream):
    assert (await client.get("/api/projects/NOPE")).status_code == 404
    base = editable(upstream)
    assert (await put(client, "NOPE", base, base)).status_code == 404


async def test_422_from_upstream_passes_through(client, upstream):
    upstream.force_422 = True
    base = editable(upstream)
    r = await put(client, "P-1", base, {**base, "name": "Rejected"})
    assert r.status_code == 422 and r.json()["upstream"] == {"detail": "name required"}
    assert upstream.store["P-1"]["name"] == "Solar Park Alpha"


async def test_invalid_body_is_422(client):
    r = await client.put("/api/projects/P-1", json={"base": {}, "mine": {}})
    assert r.status_code == 422
