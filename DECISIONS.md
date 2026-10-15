# Decisions

## Stack
FastAPI, httpx and pydantic v2 for the backend, run with uv. React 18, TypeScript, Vite and MUI v6 for the frontend. The challenge asks for FastAPI and React/MUI, and the starter upstream already uses uv, so one toolchain covers everything. There is no database of our own: the upstream is the only store of truth.

## Merge field by field
A save sends `base` (the project as the person loaded it), `mine` (their edit) and the backend reads `current` (the upstream now). For each field, a three-way compare in `backend/app/merge.py` decides:

- I did not change it: keep `current`. This protects the nightly import.
- Only I changed it, or both made the same change: take mine.
- Both changed it, differently: conflict.

Different fields therefore both survive. Values are normalised first (trimmed text, ISO dates) so formatting never causes a false conflict.

**Key dates are matched by label, not by position.** Each date is its own field, keyed `key_dates:<label>` in lower case. Treating the whole list as one field would make any two date edits collide. Position would be unsafe: an inserted date shifts every index and the merge could overwrite the wrong date without a sound. A label is what a person recognises and it does not move. Cost: renaming a label looks like delete plus add.

## 409 on the same field
When both sides changed the same field, nothing is written. The backend answers 409 with `current` and the list of conflicts. The person saving second chooses "mine" or "theirs" per field, and the browser retries with the ORIGINAL `base` it loaded, never `base = current` (that would revert the other person's fields). The retry sends `resolutions` plus `seen`, the value the 409 showed. If that field changed again, a new 409 comes back, so nobody overwrites a value they never saw.

## Stateless backend
Three instances run side by side and the nightly import writes straight into the upstream. Any memory kept in an instance would be wrong sooner or later. So the merge base travels with the client on every save, and the backend re-reads the upstream each time. Any instance gives the same answer; `backend/tests/test_stateless.py` proves it with two instances and an import in between.

## 504 handling
About 1 in 10 upstream saves answers 504, and a 504 does not say whether the write happened. Retrying blindly could duplicate or overwrite. On a 504 the backend reads the project again first. If the stored data already equals what we meant to write, it answers 200 (`confirmed_after_504`). If not, it merges again and retries, at most twice. If the re-read shows someone else changed the data meanwhile, it answers 409.

## The browser never calls the upstream
The upstream has one shared API key, so the key must never reach a browser. The backend is also the one place where merging and the 504 check live.

## What breaks first with 50 editors
The upstream has no compare-and-swap, so read, merge and write is not atomic. Another save can land between our read and our write. Our verification read afterwards can detect it and answer 409 (`concurrent_overwrite_detected`), but the overwrite has already happened, so a small window remains. Fix: a version number or ETag in the upstream. After that, the single shared API key (no audit of who changed what) and the 2-second slow reads.

## Cut on purpose
No login, no database, no live updates, no merge inside a text field (whole-field compare only), and linked companies are shown read-only.
