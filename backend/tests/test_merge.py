"""Tests of the field-level three-way merge (pure functions, no upstream needed)."""

import copy

from app.merge import flatten, same_field_key, three_way_merge


def snap(**over):
    data = {
        "name": "Solar Park",
        "sector": "energy",
        "country": "Chile",
        "stage": "tender",
        "key_dates": [
            {"label": "Bid close", "date": "2027-01-01"},
            {"label": "Award", "date": "2027-03-01"},
        ],
        "linked_companies": [{"name": "Acme", "role": "owner"}],
    }
    data.update(over)
    return data


def dates(result):
    return {d["label"]: d["date"] for d in result.merged["key_dates"]}


def test_different_scalar_fields_both_survive():
    base = snap()
    r = three_way_merge(base, snap(name="New name"), snap(country="Peru"))
    assert (r.merged["name"], r.merged["country"]) == ("New name", "Peru")
    assert r.conflicts == []


def test_same_scalar_field_conflicts():
    r = three_way_merge(snap(), snap(stage="financing"), snap(stage="construction"))
    assert [c.key for c in r.conflicts] == ["stage"]
    c = r.conflicts[0]
    assert (c.base, c.mine, c.theirs) == ("tender", "financing", "construction")
    assert r.merged["stage"] == "construction"


def test_two_key_dates_changed_by_two_people_both_survive():
    mine = snap(key_dates=[{"label": "Bid close", "date": "2027-01-05"}, {"label": "Award", "date": "2027-03-01"}])
    cur = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "Award", "date": "2027-04-01"}])
    r = three_way_merge(snap(), mine, cur)
    assert r.conflicts == []
    assert dates(r) == {"Bid close": "2027-01-05", "Award": "2027-04-01"}


def test_same_label_changed_differently_conflicts():
    mine = snap(key_dates=[{"label": "Award", "date": "2027-02-01"}])
    cur = snap(key_dates=[{"label": "Award", "date": "2027-05-01"}])
    r = three_way_merge(snap(), mine, cur)
    keys = [c.key for c in r.conflicts]
    assert "key_dates:award" in keys
    c = next(c for c in r.conflicts if c.key == "key_dates:award")
    assert (c.field, c.label, c.base, c.mine, c.theirs) == ("key_dates", "Award", "2027-03-01", "2027-02-01", "2027-05-01")


def test_same_label_same_value_no_conflict():
    both = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "Award", "date": "2027-06-01"}])
    r = three_way_merge(snap(), both, copy.deepcopy(both))
    assert r.conflicts == []
    assert dates(r)["Award"] == "2027-06-01"


def test_delete_vs_edit_conflicts_both_directions():
    deleted = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}])
    edited = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "Award", "date": "2027-09-01"}])
    r = three_way_merge(snap(), deleted, edited)
    c = r.conflicts[0]
    assert (c.key, c.mine, c.theirs) == ("key_dates:award", None, "2027-09-01")
    r2 = three_way_merge(snap(), edited, deleted)
    c2 = r2.conflicts[0]
    assert (c2.mine, c2.theirs) == ("2027-09-01", None)


def test_delete_when_other_untouched_deletes():
    deleted = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}])
    r = three_way_merge(snap(), deleted, snap())
    assert r.conflicts == [] and "Award" not in dates(r)


def test_add_same_label_different_dates_conflicts():
    base = snap(key_dates=[])
    mine = snap(key_dates=[{"label": "Kickoff", "date": "2027-01-01"}])
    cur = snap(key_dates=[{"label": " kickoff ", "date": "2027-02-01"}])
    r = three_way_merge(base, mine, cur)
    assert [c.key for c in r.conflicts] == ["key_dates:kickoff"]
    assert r.conflicts[0].base is None


def test_insert_upstream_shifts_position_without_wrong_overwrite():
    mine = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "Award", "date": "2027-07-07"}])
    cur = snap(key_dates=[{"label": "Kickoff", "date": "2026-12-01"}, *snap()["key_dates"]])
    r = three_way_merge(snap(), mine, cur)
    assert r.conflicts == []
    assert [d["label"] for d in r.merged["key_dates"]] == ["Kickoff", "Bid close", "Award"]
    assert dates(r) == {"Kickoff": "2026-12-01", "Bid close": "2027-01-01", "Award": "2027-07-07"}


def test_new_labels_go_after_current_order_in_my_order():
    mine = snap(key_dates=[*snap()["key_dates"], {"label": "Z", "date": "2028-01-01"}, {"label": "A", "date": "2028-02-01"}])
    cur = snap(key_dates=[snap()["key_dates"][1], snap()["key_dates"][0]])
    r = three_way_merge(snap(), mine, cur)
    assert [d["label"] for d in r.merged["key_dates"]] == ["Award", "Bid close", "Z", "A"]


def test_label_rename_is_delete_plus_add():
    mine = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "Decision", "date": "2027-03-01"}])
    r = three_way_merge(snap(), mine, snap())
    assert dates(r) == {"Bid close": "2027-01-01", "Decision": "2027-03-01"}
    cur = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "Award", "date": "2027-08-01"}])
    r2 = three_way_merge(snap(), mine, cur)
    assert [c.key for c in r2.conflicts] == ["key_dates:award"]
    assert dates(r2)["Decision"] == "2027-03-01"


def test_label_key_is_trimmed_case_insensitive_and_keeps_original_label():
    assert same_field_key("key_dates: AWARD ", "key_dates:award")
    mine = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "  AWARD ", "date": "2027-03-09"}])
    r = three_way_merge(snap(), mine, snap())
    assert dates(r)["AWARD"] == "2027-03-09" and "Award" not in dates(r)


def test_values_are_normalised():
    mine = snap(name="  Solar Park ", key_dates=[{"label": "Bid close", "date": "2027-01-01T00:00:00"}, {"label": "Award", "date": "2027-03-01"}])
    r = three_way_merge(snap(), mine, snap(country="Peru"))
    assert r.conflicts == [] and r.merged["name"] == "Solar Park" and r.merged["country"] == "Peru"
    assert dates(r)["Bid close"] == "2027-01-01"


def test_duplicate_labels_get_suffix():
    flat = flatten(snap(key_dates=[{"label": "X", "date": "2027-01-01"}, {"label": "x", "date": "2027-01-02"}]))
    assert {"key_dates:x", "key_dates:x#2"} <= set(flat)


def test_linked_companies_add_remove_and_role_change():
    base = snap(linked_companies=[{"name": "Acme", "role": "owner"}, {"name": "Beta", "role": "consultant"}])
    mine = snap(linked_companies=[{"name": "Acme", "role": "developer"}, {"name": "Beta", "role": "consultant"}])
    cur = snap(linked_companies=[{"name": "Acme", "role": "owner"}, {"name": "Gamma", "role": "financier"}])
    r = three_way_merge(base, mine, cur)
    assert r.conflicts == []
    assert r.merged["linked_companies"] == [{"name": "Acme", "role": "developer"}, {"name": "Gamma", "role": "financier"}]


def test_linked_companies_order_ignored_and_role_conflict():
    base = snap(linked_companies=[{"name": "Acme", "role": "owner"}, {"name": "Beta", "role": "consultant"}])
    reordered = snap(linked_companies=[{"name": "Beta", "role": "consultant"}, {"name": "Acme", "role": "owner"}])
    r = three_way_merge(base, reordered, base)
    assert r.conflicts == [] and r.auto_merged == []
    r2 = three_way_merge(snap(), snap(linked_companies=[{"name": "Acme", "role": "developer"}]), snap(linked_companies=[{"name": "Acme", "role": "financier"}]))
    assert [c.key for c in r2.conflicts] == ["linked_companies:acme"]


def test_same_company_two_roles_is_presence_only():
    mine = snap(linked_companies=[{"name": "Acme", "role": "owner"}, {"name": "Acme", "role": "developer"}])
    r = three_way_merge(snap(), mine, snap())
    assert r.conflicts == []
    assert {(c["name"], c["role"]) for c in r.merged["linked_companies"]} == {("Acme", "owner"), ("Acme", "developer")}


def test_nightly_import_kept_when_mine_untouched():
    imported = snap(stage="financing", key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "Award", "date": "2027-11-11"}])
    r = three_way_merge(snap(), snap(name="Renamed"), imported)
    assert r.conflicts == []
    assert (r.merged["stage"], r.merged["name"]) == ("financing", "Renamed")
    assert dates(r)["Award"] == "2027-11-11"
    assert {"stage", "name", "key_dates:award"} <= set(r.auto_merged)


def test_resolutions_mine_and_theirs():
    mine = snap(stage="financing", key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "Award", "date": "2027-02-01"}])
    cur = snap(stage="construction", key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "Award", "date": "2027-05-01"}])
    r = three_way_merge(snap(), mine, cur, {"stage": "mine", "key_dates:Award": "theirs"})
    assert r.conflicts == []
    assert r.merged["stage"] == "financing" and dates(r)["Award"] == "2027-05-01"
    r2 = three_way_merge(snap(), mine, cur, {"stage": "theirs", "key_dates:award": "mine"})
    assert r2.merged["stage"] == "construction" and dates(r2)["Award"] == "2027-02-01"


def test_unresolved_conflict_stays_and_resolution_for_missing_key_ignored():
    r = three_way_merge(snap(), snap(stage="idea"), snap(stage="operation"), {"name": "mine"})
    assert [c.key for c in r.conflicts] == ["stage"]


def test_resolve_mine_for_deleted_key_removes_it_and_adds_it_back():
    deleted = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}])
    edited = snap(key_dates=[{"label": "Bid close", "date": "2027-01-01"}, {"label": "Award", "date": "2027-09-01"}])
    assert "Award" not in dates(three_way_merge(snap(), deleted, edited, {"key_dates:award": "mine"}))
    assert dates(three_way_merge(snap(), deleted, edited, {"key_dates:award": "theirs"}))["Award"] == "2027-09-01"


def test_idempotent_and_inputs_not_mutated():
    args = (snap(), snap(stage="idea", name="N"), snap(stage="operation", country="Peru"))
    before = copy.deepcopy(args)
    first = three_way_merge(*args)
    second = three_way_merge(*args)
    assert first == second and args == before
    # merging the merged result again against current changes nothing
    again = three_way_merge(args[2], first.merged, args[2], {"stage": "mine"})
    assert again.merged["name"] == "N"
