"""Two independent create_app() instances share nothing but the fake upstream."""

import httpx

from tests.conftest import editable


def http(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://backend.test")


async def test_save_through_a_read_through_b(make_app, upstream):
    a, b = make_app(), make_app()
    assert a is not b and a.state.upstream is not b.state.upstream
    async with http(a) as ca, http(b) as cb:
        loaded = (await ca.get("/api/projects/P-1")).json()["editable"]
        r = await ca.put("/api/projects/P-1", json={"base": loaded, "mine": {**loaded, "stage": "tender"}})
        assert r.status_code == 200
        assert (await cb.get("/api/projects/P-1")).json()["editable"]["stage"] == "tender"


async def test_base_loaded_from_a_merges_when_saved_via_b(make_app, upstream):
    a, b = make_app(), make_app()
    async with http(a) as ca, http(b) as cb:
        base_a = (await ca.get("/api/projects/P-1")).json()["editable"]
        # someone else saves through B, a different field
        other = (await cb.get("/api/projects/P-1")).json()["editable"]
        assert (await cb.put("/api/projects/P-1", json={"base": other, "mine": {**other, "country": "Peru"}})).status_code == 200
        # now save from the base loaded via A, through B
        r = await cb.put("/api/projects/P-1", json={"base": base_a, "mine": {**base_a, "name": "Merged Name"}})
        assert r.status_code == 200
        assert r.json()["project"]["editable"]["name"] == "Merged Name"
        assert r.json()["project"]["editable"]["country"] == "Peru"
    assert upstream.store["P-1"]["name"] == "Merged Name" and upstream.store["P-1"]["country"] == "Peru"


async def test_direct_upstream_edit_between_load_and_save_merges_field_by_field(make_app, upstream):
    async with http(make_app()) as c:
        base = (await c.get("/api/projects/P-1")).json()["editable"]
        upstream.edit_directly("P-1", country="Brazil")  # nightly import
        r = await c.put("/api/projects/P-1", json={"base": base, "mine": {**base, "name": "Mine"}})
        assert r.status_code == 200
    assert upstream.store["P-1"]["name"] == "Mine" and upstream.store["P-1"]["country"] == "Brazil"


async def test_same_field_change_is_409_and_nothing_written(make_app, upstream):
    async with http(make_app()) as c:
        base = (await c.get("/api/projects/P-1")).json()["editable"]
        upstream.edit_directly("P-1", name="Import Name")
        r = await c.put("/api/projects/P-1", json={"base": base, "mine": {**base, "name": "My Name"}})
        assert r.status_code == 409
        assert r.headers["content-type"].startswith("application/problem+json")
        body = r.json()
        assert body["conflicts"][0]["key"] == "name"
        assert (body["conflicts"][0]["mine"], body["conflicts"][0]["theirs"]) == ("My Name", "Import Name")
        assert body["current"]["name"] == "Import Name"
    assert upstream.puts == [] and upstream.store["P-1"]["name"] == "Import Name"


async def test_conflict_resolved_by_second_saver(make_app, upstream):
    async with http(make_app()) as c:
        base = (await c.get("/api/projects/P-1")).json()["editable"]
        upstream.edit_directly("P-1", name="Import Name")
        mine = {**base, "name": "My Name"}
        first = await c.put("/api/projects/P-1", json={"base": base, "mine": mine})
        r = await c.put("/api/projects/P-1", json={"base": first.json()["current"], "mine": mine,
                                                    "resolutions": {"name": "mine"}})
        assert r.status_code == 200 and upstream.store["P-1"]["name"] == "My Name"


async def test_concurrent_overwrite_detected_after_put(make_app, upstream):
    """Another writer lands between our PUT and our verifying re-read: answer 409, not silent success."""
    app = make_app()
    original_put = app.state.upstream.put_project

    async def put_then_import(pid, body):
        out = await original_put(pid, body)
        upstream.edit_directly(pid, name="Import Wins")
        return out

    app.state.upstream.put_project = put_then_import
    async with http(app) as c:
        base = editable(upstream)
        r = await c.put("/api/projects/P-1", json={"base": base, "mine": {**base, "name": "Mine"}})
    assert r.status_code == 409 and r.json()["type"] == "concurrent_overwrite_detected"
    assert r.json()["current"]["name"] == "Import Wins"
