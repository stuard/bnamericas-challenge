"""A resolution only applies while the current value is still the one the person saw."""

import httpx
import pytest

from app import merge


def http(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://backend.test")


async def conflict_then_third_writer(c, upstream):
    base = (await c.get("/api/projects/P-1")).json()["editable"]
    upstream.edit_directly("P-1", name="v2 import")
    mine = {**base, "name": "My Name"}
    first = await c.put("/api/projects/P-1", json={"base": base, "mine": mine})
    assert first.status_code == 409 and first.json()["conflicts"][0]["theirs"] == "v2 import"
    upstream.edit_directly("P-1", name="v3 colleague")
    return base, mine


@pytest.mark.parametrize("choice", ["mine", "theirs"])
async def test_changed_current_stays_a_conflict_and_nothing_is_written(make_app, upstream, choice):
    async with http(make_app()) as c:
        base, mine = await conflict_then_third_writer(c, upstream)
        r = await c.put("/api/projects/P-1", json={"base": base, "mine": mine,
                                                    "resolutions": {"name": choice}, "seen": {"name": "v2 import"}})
    assert r.status_code == 409 and r.json()["conflicts"][0]["theirs"] == "v3 colleague"
    assert upstream.store["P-1"]["name"] == "v3 colleague"


async def test_unchanged_current_applies_mine(make_app, upstream):
    async with http(make_app()) as c:
        base, mine = await conflict_then_third_writer(c, upstream)
        r = await c.put("/api/projects/P-1", json={"base": base, "mine": mine,
                                                    "resolutions": {"name": "mine"}, "seen": {"name": "v3 colleague"}})
    assert r.status_code == 200 and upstream.store["P-1"]["name"] == "My Name"


async def test_without_seen_old_behaviour_is_kept(make_app, upstream):
    async with http(make_app()) as c:
        base, mine = await conflict_then_third_writer(c, upstream)
        r = await c.put("/api/projects/P-1", json={"base": base, "mine": mine, "resolutions": {"name": "mine"}})
    assert r.status_code == 200 and upstream.store["P-1"]["name"] == "My Name"


def test_seen_is_normalised_and_null_means_absent():
    base = {"name": "A", "key_dates": [{"label": "Award", "date": "2027-01-01"}], "linked_companies": []}
    mine = {**base, "key_dates": [{"label": "Award", "date": "2027-02-02"}]}
    cur = {**base, "key_dates": [{"label": "Award", "date": "2027-03-03T10:00:00Z"}]}
    ok = merge.three_way_merge(base, mine, cur, {"key_dates:award": "mine"}, {"key_dates:award": "2027-03-03T00:00:00"})
    assert not ok.conflicts and ok.merged["key_dates"][0]["date"] == "2027-02-02"
    stale = merge.three_way_merge(base, mine, cur, {"key_dates:award": "mine"}, {"key_dates: Award": "2027-01-05"})
    assert [x.key for x in stale.conflicts] == ["key_dates:award"]
    gone = {**base, "key_dates": []}
    absent = merge.three_way_merge(base, mine, gone, {"key_dates:award": "mine"}, {"key_dates:award": None})
    assert not absent.conflicts
    shown = merge.three_way_merge(base, mine, cur, {"key_dates:award": "mine"}, {"key_dates:award": None})
    assert shown.conflicts
