"""The docs coverage check: it passes on the real docs, and fails on a doc with a gap or a stale entry."""

import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
ROOT = BACKEND.parent
SCRIPT = ROOT / "scripts" / "docs_coverage.py"
DOC = ROOT / "docs" / "technical" / "backend.md"


def run_script(root: Path, *extra: str):
    return subprocess.run([sys.executable, str(SCRIPT), "--only", "backend", "--root", str(root), *extra],
                          capture_output=True, text=True)


@pytest.fixture
def copy_root(tmp_path):
    """A scratch repo: the real backend code and the real backend docs, safe to damage."""
    shutil.copytree(BACKEND / "app", tmp_path / "backend" / "app", ignore=shutil.ignore_patterns("__pycache__"))
    (tmp_path / "docs" / "technical").mkdir(parents=True)
    shutil.copy(DOC, tmp_path / "docs" / "technical" / "backend.md")
    (tmp_path / "scripts").mkdir()
    shutil.copy(ROOT / "scripts" / "docs_coverage_ignore.txt", tmp_path / "scripts")
    return tmp_path


def test_real_docs_cover_the_backend():
    done = subprocess.run([sys.executable, str(SCRIPT), "--only", "backend"], capture_output=True, text=True, cwd=ROOT)
    assert done.returncode == 0, done.stdout
    assert re.search(r"COVERAGE: (\d+)/\1, 0 missing, 0 stale", done.stdout)


def test_copy_is_clean_before_damage(copy_root):
    assert run_script(copy_root).returncode == 0


def test_deleted_entry_is_reported_missing(copy_root):
    doc = copy_root / "docs" / "technical" / "backend.md"
    text = doc.read_text()
    start = text.index("### `backend/app/merge.py::decide`")
    end = text.index("### `backend/app/merge.py::apply_resolutions`")
    doc.write_text(text[:start] + text[end:])
    bad = run_script(copy_root)
    assert bad.returncode == 1
    assert "MISSING backend/app/merge.py::decide" in bad.stdout


def test_renamed_function_is_reported_stale(copy_root):
    code = copy_root / "backend" / "app" / "merge.py"
    code.write_text(code.read_text().replace("def decide(", "def decide_field("))
    bad = run_script(copy_root)
    assert bad.returncode == 1
    assert "STALE   backend/app/merge.py::decide" in bad.stdout
    assert "MISSING backend/app/merge.py::decide_field" in bad.stdout


def test_empty_label_is_reported(copy_root):
    doc = copy_root / "docs" / "technical" / "backend.md"
    text = doc.read_text()
    entry = text.index("### `backend/app/merge.py::normalise_key`")
    cut = text.index("**Returns:**", entry)
    end = text.index("**Example:**", cut)
    doc.write_text(text[:cut] + "**Returns:**\n\n" + text[end:])
    bad = run_script(copy_root)
    assert bad.returncode == 1
    assert "EMPTY   backend/app/merge.py::normalise_key" in bad.stdout


def test_ignore_line_is_printed_and_hides_the_gap(copy_root):
    (copy_root / "backend" / "app" / "extra.py").write_text("def helper():\n    return 1\n")
    assert run_script(copy_root).returncode == 1
    (copy_root / "scripts" / "docs_coverage_ignore.txt").write_text("backend/app/extra.py::helper | tiny internal helper\n")
    good = run_script(copy_root)
    assert good.returncode == 0
    assert "IGNORED backend/app/extra.py::helper -- tiny internal helper" in good.stdout


def example_blocks():
    text = DOC.read_text()
    for m in re.finditer(r"### `([^`]+)`.*?\*\*Example:\*\*\s*```python\n(.*?)```", text, re.S):
        yield pytest.param(m.group(2), id=m.group(1).split("::")[1])


@pytest.mark.parametrize("code", list(example_blocks()))
def test_every_example_runs_and_prints_what_the_comments_say(code):
    """Run the block in a fresh Python inside backend/; each '# -> text' must equal a printed line, in order."""
    expected = re.findall(r"# -> (.*)$", code, re.M)
    done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=BACKEND, timeout=60)
    assert done.returncode == 0, done.stderr
    assert done.stdout.splitlines() == expected
