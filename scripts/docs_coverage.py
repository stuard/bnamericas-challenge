#!/usr/bin/env python3
"""Check that every public function/class in the code has an entry in docs/technical/*.md.

Run from the repo root:  uv run python scripts/docs_coverage.py [--only backend|frontend|all] [--root DIR]

Code side
  backend : ast over backend/**/*.py (tests/ ignored). Public = top-level function, async function or
            class whose name does not start with '_' (and is in __all__ when the module has one);
            each public method of a class; route handlers (functions decorated with app.get/post/put/
            patch/delete) even when nested inside create_app.
  frontend: regex over frontend/src/**/*.ts(x), *.test.* excluded: export function/async function/const/
            class, export default function Name, export { A, B }. Types and interfaces are not symbols.
Docs side
  Every H3 of docs/technical/*.md written as  ### `path::symbol`  must have the four labels
  **What it does:**  **Takes:**  **Returns:**  **Example:** (Example needs a non-empty code fence).
Reports MISSING (in code, not in docs), STALE (in docs, not in code), EMPTY (a label with no text).
With --only all it also checks that every `path` in a table cell of docs/technical/index.md exists.
Exit 1 when anything is wrong, else prints  COVERAGE: n/n, 0 missing, 0 stale
"""

import argparse
import ast
import re
import sys
from pathlib import Path

LABELS = ("What it does", "Takes", "Returns", "Example")
ROUTE_VERBS = {"get", "post", "put", "patch", "delete"}
SKIP_DIRS = {".venv", "node_modules", "__pycache__", "tests", ".git", "dist"}
HEADING = re.compile(r"^### `([^`:]+)::([^`]+)`\s*$")
LABEL_LINE = re.compile(r"^\*\*(What it does|Takes|Returns|Example):\*\*\s*(.*)$")


def walk(root: Path, base: str, suffixes: tuple[str, ...]):
    for p in sorted((root / base).rglob("*")):
        rel = p.relative_to(root)
        if p.is_file() and p.suffix in suffixes and not (SKIP_DIRS & set(rel.parts)):
            yield p, rel.as_posix()


def exported_names(tree: ast.Module):
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "__all__" for t in node.targets):
            try:
                return {e.value for e in node.value.elts}
            except AttributeError:
                return None
    return None


def is_route(fn) -> bool:
    for d in fn.decorator_list:
        call = d.func if isinstance(d, ast.Call) else d
        if isinstance(call, ast.Attribute) and call.attr in ROUTE_VERBS:
            return True
    return False


def backend_symbols(root: Path) -> set[str]:
    found: set[str] = set()
    for path, rel in walk(root, "backend", (".py",)):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=rel)
        allowed = exported_names(tree)
        ok = lambda name: not name.startswith("_") and (allowed is None or name in allowed)  # noqa: E731
        funcs = (ast.FunctionDef, ast.AsyncFunctionDef)
        for node in tree.body:
            if isinstance(node, funcs) and ok(node.name):
                found.add(f"{rel}::{node.name}")
            elif isinstance(node, ast.ClassDef) and ok(node.name):
                found.add(f"{rel}::{node.name}")
                for m in node.body:
                    if isinstance(m, funcs) and not m.name.startswith("_"):
                        found.add(f"{rel}::{node.name}.{m.name}")
        for node in ast.walk(tree):  # route handlers nested in a factory such as create_app
            if isinstance(node, funcs) and is_route(node):
                found.add(f"{rel}::{node.name}")
    return found


def split_names(block: str):
    for part in block.split(","):
        part = part.strip()
        if not part or part.startswith("type "):
            continue
        yield part.split(" as ")[-1].strip()


def frontend_symbols(root: Path) -> set[str]:
    found: set[str] = set()
    for path, rel in walk(root, "frontend/src", (".ts", ".tsx")):
        if ".test." in path.name:
            continue
        text = path.read_text(encoding="utf-8")
        pats = (r"^export\s+(?:async\s+)?function\s*\*?\s*(\w+)", r"^export\s+const\s+(\w+)",
                r"^export\s+(?:abstract\s+)?class\s+(\w+)", r"^export\s+default\s+(?:async\s+)?function\s+(\w+)")
        for pat in pats:
            found.update(f"{rel}::{n}" for n in re.findall(pat, text, re.M))
        for block in re.findall(r"^export\s*\{([^}]*)\}", text, re.M | re.S):
            found.update(f"{rel}::{n}" for n in split_names(block))
    return found


def parse_docs(root: Path):
    """Return ({'path::symbol': [problems]}, [(file, 'path::symbol') duplicates])."""
    entries: dict[str, list[str]] = {}
    for path in sorted((root / "docs" / "technical").glob("*.md")):
        current, sections, fenced = None, {}, False
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("```"):
                fenced = not fenced
            if not fenced and line.startswith("#"):
                m = HEADING.match(line)
                current = None
                if m:
                    current = f"{m.group(1)}::{m.group(2)}"
                    sections[current] = []
                continue
            if current:
                sections[current].append(line)
        for key, lines in sections.items():
            entries[key] = check_entry(lines)
    return entries


def check_entry(lines: list[str]) -> list[str]:
    chunks: dict[str, list[str]] = {}
    label, fenced = None, False
    for line in lines:
        m = None if fenced else LABEL_LINE.match(line)
        if m:
            label = m.group(1)
            chunks[label] = [m.group(2)]
            continue
        if line.startswith("```"):
            fenced = not fenced
        if label:
            chunks[label].append(line)
    problems = []
    for name in LABELS:
        body = "\n".join(chunks.get(name, [])).strip()
        if name not in chunks:
            problems.append(f"label **{name}:** is missing")
        elif name == "Example":
            code = re.search(r"```[^\n]*\n(.*?)```", body, re.S)
            if not code or not code.group(1).strip():
                problems.append("**Example:** has no non-empty code block")
        elif not body:
            problems.append(f"**{name}:** is empty")
    return problems


PATHLIKE = re.compile(r"^[\w.@-]+(/[\w.@-]+)*/?$")


def index_paths(root: Path) -> list[str]:
    index = root / "docs" / "technical" / "index.md"
    if not index.exists():
        return []
    paths = []
    for line in index.read_text(encoding="utf-8").splitlines():
        if not line.lstrip().startswith("|"):
            continue
        for span in re.findall(r"`([^`]+)`", line):
            span = span.strip()
            if "::" in span or "*" in span or not PATHLIKE.match(span):
                continue
            if "/" in span or re.search(r"\.\w{1,5}$", span):
                paths.append(span)
    return paths


def read_ignores(root: Path) -> dict[str, str]:
    ignores, bad = {}, []
    f = root / "scripts" / "docs_coverage_ignore.txt"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            key, _, reason = line.partition("|")
            if reason.strip():
                ignores[key.strip()] = reason.strip()
            else:
                bad.append(line)
    if bad:
        print("IGNORE LINES WITHOUT A REASON:", *bad, sep="\n  ")
        sys.exit(1)
    return ignores


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", choices=("backend", "frontend", "all"), default="all")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    args = ap.parse_args()
    root = Path(args.root).resolve()
    sides = ("backend", "frontend") if args.only == "all" else (args.only,)

    ignores = read_ignores(root)
    for key, reason in ignores.items():
        print(f"IGNORED {key} -- {reason}")

    code: set[str] = set()
    if "backend" in sides:
        code |= backend_symbols(root)
    if "frontend" in sides:
        code |= frontend_symbols(root)
    code -= set(ignores)
    entries = {k: v for k, v in parse_docs(root).items() if k.split("/")[0] in sides and k not in ignores}

    missing = sorted(code - set(entries))
    stale = sorted(set(entries) - code)
    empty = {k: v for k, v in sorted(entries.items()) if v and k in code}
    bad_paths = []
    if args.only == "all":
        bad_paths = [p for p in dict.fromkeys(index_paths(root)) if p not in ignores and not (root / p).exists()]

    for k in missing:
        print(f"MISSING {k}  (in code, no entry in docs/technical)")
    for k in stale:
        print(f"STALE   {k}  (in docs, no longer in code)")
    for k, probs in empty.items():
        print(f"EMPTY   {k}  ({'; '.join(probs)})")
    for p in bad_paths:
        print(f"BADPATH {p}  (named in docs/technical/index.md, not on disk)")

    total = len(code)
    done = total - len(missing) - len(empty)
    if missing or stale or empty or bad_paths:
        print(f"COVERAGE: {done}/{total}, {len(missing)} missing, {len(stale)} stale, "
              f"{len(empty)} empty, {len(bad_paths)} bad paths")
        return 1
    print(f"COVERAGE: {total}/{total}, 0 missing, 0 stale")
    return 0


if __name__ == "__main__":
    sys.exit(main())
