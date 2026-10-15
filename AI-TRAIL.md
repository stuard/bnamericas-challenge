# AI trail

This project was built with AI. This note says what was done, by what, and what was and was not checked. It is written from the task log and the git history, not from memory.

## What was used

- Claude (model Claude Sonnet 5.5) running in Claude Code.
- A "trio" of Claude agents with fixed roles: a PM that turns the request into a frozen list of 8 done items and routes the work, a Dev that is the only one writing code, and a Designer that made mockups. The agents record their steps as signals in a task file.

## How the work went

1. Planning. Dev agents wrote the stack and data choices for the editor and the docs. The Designer made mockups for the list, edit form, 504 state, conflict dialog and the three docs pages. The plan put two decisions to the owner: the language of the deliverables (D1) and what counts as the "same field" for key dates (D2, recommended: by label).
2. Build in 13 cells (cell 0 to cell 12), each on its own git branch and then joined into one line. The git history before this cell shows 31 commits: 17 by Claude on cell branches and 14 by the Trio runner that started the project and joined branches.
   - 22:43 cell 0: upstream copy, models, config.
   - 22:45 to 22:47 cells 1, 2, 3: three-way merge, proxy with 504 handling, frontend shell.
   - 22:49 to 22:53 cells 4, 5, 6: list, edit form, save bar and conflict dialog.
   - 23:02 to 23:09 cells 7 to 11 and fix F1: docs app, docs, guide, and a fix that stopped the top bar scrolling sideways on phones.
   - Cell 12 (this file, README, DECISIONS) is the last one.
3. Recorded checks, as logged by the agents:
   - merge: 22 tests passed; proxy and 504: 14 passed; statelessness: 6 passed; whole backend suite: 42 passed on the line.
   - one mutation test: skipping the re-read confirmation after a 504 made `test_504_after_applying` fail.
   - docs coverage: 35 of 35 backend functions documented, 0 missing, 0 stale; a deliberately broken case was reported as missing and stale.
   - the guide: `scripts/guide_check.sh` built a clean copy from the guide's own commands, saved a project, read it back and got a 409 conflict.

## After the first build: review, audit and fixes

From the task log and git history (`git log`), in order:

- Designer reviews of the screens found that the edit page crashed on the real API (the backend answers `{id, editable, readonly}` and the page read a flat project), that resolving a conflict or retrying after a 504 sent a stale base, and that the 504 "verifying" state never showed. Fix F2 (commit 2fe480e, 64 frontend tests passed) corrected the page and the original base is now kept. The unit tests had passed before because they mocked the API in the wrong shape; only the measure on the running app showed the crash.
- Fixes F1 (top bar overflow at 390 and 320 px), F3 (save bar and conflict dialog), F4 (project list), F5 and F6 (docs app and coverage entries) and F7 (16 px body text, 10 rows per page by default) were joined into the line.
- An auditor reviewed the concurrent-edit code and found a blocking data-loss bug (audit F1): after a 409, picking "mine" could overwrite a value the person never saw, if a colleague saved again between the 409 and the retry. It was fixed in two parts: F8 (commit babc3d4, backend, 88 tests passed) added `seen` to the save request, and F9 (commit 970dc87, client, 80 tests passed) sends it. A changed value now gives a new 409.
- The same audit found that the docs told readers to retry with `base = current`, which would revert the other person's fields. F10 corrected DECISIONS.md and the technical docs, and fixed the statement that nothing was written upstream on `concurrent_overwrite_detected` (our write landed and was overwritten).

## Honest limits

- The first proxy tests ran against a stand-in merge because the merge branch had not joined yet; the log marked "real merge.py run still owed". The suites were later run on the joined line.
- Remaining audit findings are recorded but not fixed: the upstream has no version check, so a write between our read and our write can still be overwritten (named in DECISIONS.md); renaming a key date only by letter case is dropped silently; duplicate key-date labels are matched by position.
- Some screens could not satisfy the automatic measure gate at first (route names differ from the mockup, and the guide page is much longer than its mockup); the Designer review judged the length acceptable.
- The upstream folder was copied from the challenge starter without changes.
- Choices such as the merge rules were proposed by the AI and are defended in DECISIONS.md. A person should read them and the code before relying on them.
