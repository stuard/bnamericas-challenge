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

## Honest limits

- The first proxy tests ran against a stand-in merge, because the merge branch had not joined yet; the log marks "real merge.py run still owed". Check that the full suite passes on the final line.
- Some screens were refused by the automatic measure gate when the log was written (page route names differ from the mockup, and the guide page is much longer than its mockup). The gate had not been satisfied for them at that time.
- A separate audit of the merge code for lost-data risks was planned. It is not recorded in the log as done when this was written.
- The upstream folder was copied from the challenge starter without changes.
- Choices such as the merge rules were proposed by the AI and are defended in DECISIONS.md. A person should read them and the code before relying on them.
