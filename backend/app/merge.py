"""Field-level three-way merge of a project's editable data.

Three snapshots go in: ``base`` (what the person loaded), ``mine`` (what the person wants to
save) and ``current`` (what the upstream holds right now). Every snapshot is cut into small
"fields", each with a string key, and every key is decided on its own:

* I did not touch it            -> keep current (this protects the nightly import)
* only current changed it       -> keep current
* only I changed it             -> take mine
* both changed it the same way  -> no conflict
* both changed it differently   -> conflict (a person must choose)

Everything here is a pure function: no I/O, no module state, same inputs give same output.

Field keys
----------
* A scalar is its own key: ``name``, ``sector``, ``country``, ``stage``.
* One key date is one field: ``key_dates:<label>``, label trimmed and lower-cased for the key.
  The value is the date ``YYYY-MM-DD``. A label used twice gets ``#2``, ``#3``... by order.
* One linked company is one field: ``linked_companies:<name>``, the value is its role. If a
  name has several different roles, each role is a presence-only key ``linked_companies:<name>|<role>``.
"""

from dataclasses import dataclass
from datetime import date

from pydantic import BaseModel

from app.models import Conflict

SCALARS = ("name", "sector", "country", "stage")
PRESENT = "present"


@dataclass(frozen=True)
class FlatField:
    """One comparable field: its key, the editable field it belongs to, a label and a value."""

    key: str
    field: str
    label: str | None
    value: str
    role: str | None = None  # only for linked companies


class MergeResult(BaseModel):
    """merged = the full Editable to PUT; conflicts = still undecided; auto_merged = clean keys."""

    merged: dict
    conflicts: list[Conflict]
    auto_merged: list[str]


def normalise_text(value) -> str:
    """Trim a value and turn it into a string (None becomes an empty string)."""
    return "" if value is None else str(value).strip()


def normalise_date(value) -> str:
    """Return a date as ``YYYY-MM-DD``; a full timestamp keeps only its date part.

    Text that is not a date is returned trimmed, so a bad value still compares sanely.
    """
    text = normalise_text(value)
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return text


def normalise_key(key: str) -> str:
    """Make a field key comparable: trim it and lower-case the part after the first colon."""
    key = key.strip()
    if ":" not in key:
        return key
    field, rest = key.split(":", 1)
    return f"{field.strip()}:{rest.strip().casefold()}"


def same_field_key(a: str, b: str) -> bool:
    """True when two keys name the same field (``key_dates: Award`` equals ``key_dates:award``)."""
    return normalise_key(a) == normalise_key(b)


def key_date_key(label: str, occurrence: int = 1) -> str:
    """Build the key of a key date; the second use of a label in one project gets ``#2``."""
    key = f"key_dates:{normalise_text(label).casefold()}"
    return key if occurrence == 1 else f"{key}#{occurrence}"


def flatten(snapshot: dict) -> dict[str, FlatField]:
    """Cut an Editable snapshot into ``{key: FlatField}``.

    Example: ``{"stage": "tender", "key_dates": [{"label": "Award", "date": "2027-01-01"}]}``
    gives the keys ``stage`` and ``key_dates:award``.
    """
    flat: dict[str, FlatField] = {}
    for name in SCALARS:
        if name in snapshot and snapshot[name] is not None:
            flat[name] = FlatField(name, name, None, normalise_text(snapshot[name]))
    seen: dict[str, int] = {}
    for item in snapshot.get("key_dates") or []:
        label = normalise_text(item.get("label"))
        base_key = key_date_key(label)
        seen[base_key] = seen.get(base_key, 0) + 1
        key = key_date_key(label, seen[base_key])
        flat[key] = FlatField(key, "key_dates", label, normalise_date(item.get("date")))
    roles: dict[str, list[tuple[str, str]]] = {}
    for item in snapshot.get("linked_companies") or []:
        name, role = normalise_text(item.get("name")), normalise_text(item.get("role"))
        found = roles.setdefault(name.casefold(), [])
        if (name, role) not in [(n, r) for n, r in found]:
            found.append((name, role))
    for name_key, entries in roles.items():
        if len(entries) == 1:
            name, role = entries[0]
            key = f"linked_companies:{name_key}"
            flat[key] = FlatField(key, "linked_companies", name, role, role)
        else:
            for name, role in entries:
                key = f"linked_companies:{name_key}|{role.casefold()}"
                flat[key] = FlatField(key, "linked_companies", name, PRESENT, role)
    return flat


def decide(base: str | None, mine: str | None, current: str | None) -> str:
    """Decide one key from its three values (None = absent): ``current``, ``mine`` or ``conflict``."""
    if mine == base or current == mine:
        return "current"
    if current == base:
        return "mine"
    return "conflict"


def apply_resolutions(conflicts: list[Conflict], resolutions: dict[str, str] | None) -> tuple[dict[str, str], list[Conflict]]:
    """Split conflicts using the person's choices.

    Returns ``(chosen, unresolved)``: ``chosen`` maps a conflict key to ``"mine"`` or
    ``"theirs"``; ``unresolved`` keeps the conflicts with no valid choice.
    """
    wanted = {normalise_key(k): v for k, v in (resolutions or {}).items() if v in ("mine", "theirs")}
    chosen: dict[str, str] = {}
    unresolved: list[Conflict] = []
    for conflict in conflicts:
        choice = wanted.get(normalise_key(conflict.key))
        if choice:
            chosen[conflict.key] = choice
        else:
            unresolved.append(conflict)
    return chosen, unresolved


def _build_list(field: str, keys: list[str], winners: dict[str, FlatField]) -> list[dict]:
    """Turn the winning FlatFields of one list field back into ordered dicts, without duplicates."""
    out: list[dict] = []
    for key in keys:
        item = winners[key]
        if field == "key_dates":
            out.append({"label": item.label, "date": item.value})
        else:
            entry = {"name": item.label, "role": item.role}
            if entry not in out:
                out.append(entry)
    return out


def three_way_merge(base: dict, mine: dict, current: dict, resolutions: dict[str, str] | None = None) -> MergeResult:
    """Merge ``mine`` into ``current`` using ``base`` as the common ancestor.

    ``resolutions`` maps a conflict key to ``"mine"`` or ``"theirs"``. A conflict without a
    choice stays in ``.conflicts`` and the merged value keeps the current (theirs) side.
    """
    fb, fm, fc = flatten(base), flatten(mine), flatten(current)
    keys = list(dict.fromkeys([*fc, *fm, *fb]))
    value = lambda flat, k: flat[k].value if k in flat else None  # noqa: E731

    winners: dict[str, FlatField] = {}
    conflicts: list[Conflict] = []
    clean: list[str] = []
    for key in keys:
        b, m, c = value(fb, key), value(fm, key), value(fc, key)
        verdict = decide(b, m, c)
        if verdict == "conflict":
            template = fm.get(key) or fc.get(key) or fb[key]
            conflicts.append(Conflict(key=key, field=template.field, label=template.label, base=b, mine=m, theirs=c))
            continue
        if len({b, m, c}) > 1:
            clean.append(key)
        source = fm if verdict == "mine" else fc
        if key in source:
            winners[key] = source[key]

    chosen, unresolved = apply_resolutions(conflicts, resolutions)
    for conflict in conflicts:
        pick = chosen.get(conflict.key)
        source = fm if pick == "mine" else fc  # unresolved falls back to theirs
        if conflict.key in source:
            winners[conflict.key] = source[conflict.key]

    merged: dict = {}
    for name in SCALARS:
        if name in winners:
            merged[name] = winners[name].value
        elif name in mine:
            merged[name] = mine[name]
    for field in ("key_dates", "linked_companies"):
        ordered = [k for k in fc if k in winners and winners[k].field == field]
        ordered += [k for k in fm if k in winners and winners[k].field == field and k not in ordered]
        merged[field] = _build_list(field, ordered, winners)
    return MergeResult(merged=merged, conflicts=unresolved, auto_merged=clean)
