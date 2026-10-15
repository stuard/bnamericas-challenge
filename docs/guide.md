# Step-by-step guide

From an empty computer to the app running, a project edited and saved, and a conflict solved. Copy each command exactly as written, compare what you get with **You should see**, and move on. It takes about 30 minutes. You do not need any programming knowledge.

## Before you start

You will use a **terminal** (a window where you type commands) and a **browser**. On a Mac open the app called "Terminal". On Windows open "PowerShell". On Linux open "Terminal".

At the end you will have **3 terminals open**, one for each part of the app, and they must stay open while you work:

| Terminal | What runs there | Port |
|---|---|---|
| Terminal 1 | the records API (called "upstream") | 8081 |
| Terminal 2 | our backend | 8000 |
| Terminal 3 | the web page (frontend) | 5173 |

### Words you will meet

- **Terminal**: a window where you type a command and press Enter. The program answers with text.
- **Port**: a numbered door on your computer. Each program listens at its own door, for example 8081. Two programs cannot use the same door at the same time.
- **API**: a program that other programs talk to, instead of people. It answers questions like "give me project P-1001".
- **Backend**: the program between the web page and the records API. The web page only talks to the backend, and the backend talks to the records API.
- **Upstream**: the records API owned by "another team". It holds about 30 example projects and forgets any change when you stop it.
- **Frontend**: the web page you see in the browser.
- **Conflict**: two people changed the same thing in the same project. The app never picks a winner by itself, the second person to save decides.

---

## Step 1. Install uv and Node, and check their versions

**What you are doing:** installing the two tools the app needs. `uv` runs the Python parts (upstream and backend). Node runs the web page. Git downloads the code.

Install `uv`. On macOS and Linux:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

On Windows (PowerShell):

```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Install Node.js: go to https://nodejs.org, download the **LTS** version (it must be 20 or newer) and click "Next" until it finishes. Install Git from https://git-scm.com if the check below does not find it.

**Close the terminal, open a new one**, and check that all three are installed:

<!-- run -->
```bash
uv --version
node --version
git --version
```

**You should see** (your numbers can be different, Node must start with v20 or higher):

```text
uv 0.11.32 (x86_64-unknown-linux-gnu)
v22.22.0
git version 2.43.0
```

> **If you see this error**
> `command not found: uv` (or `node`, or `git`; on Windows: `'uv' is not recognized`)
>
> The terminal was opened before the install, so it does not know the new program yet. Close it and open a new one. If `uv` is still not found, run `source $HOME/.local/bin/env` and try again.

## Step 2. Get the code

**What you are doing:** downloading the project to a folder in your home directory.

```bash
cd ~
git clone <REPO-URL> bnamericas-editor
cd bnamericas-editor
```

Replace `<REPO-URL>` with the address of the repository you were given (it starts with `https://github.com/`).

**You should see:**

```text
Cloning into 'bnamericas-editor'...
done.
```

> **If you see this error**
> `fatal: destination path 'bnamericas-editor' already exists and is not an empty directory`
>
> You already downloaded it. Just run `cd ~/bnamericas-editor` and go on to step 3.

## Step 3. Start the records API (Terminal 1)

**What you are doing:** starting the "upstream", the records API with ~30 example projects. Leave this terminal open for the whole guide.

<!-- run server 8081 -->
```bash
cd upstream && uv run upstream
```

The first time it downloads what it needs, which takes a few seconds.

**You should see** (the last line is the important one):

```text
INFO:     Started server process [17868]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8081 (Press CTRL+C to quit)
```

To check it, open http://127.0.0.1:8081/docs in your browser: you see the API's own documentation page.

> **If you see this error**
> `ERROR:    [Errno 98] error while attempting to bind on address ('127.0.0.1', 8081): address already in use`
>
> Port 8081 is taken, usually by another upstream you left open. Find that terminal and press **Ctrl + C** in it, then run the command again. (On Windows the same message says `[Errno 10048]`.)

## Step 4. Start our backend (Terminal 2)

**What you are doing:** starting the backend, the only program that talks to the records API. Open a **new terminal** (a second window or tab), go to the folder, and run:

```bash
cd ~/bnamericas-editor
```

<!-- run server 8000 -->
```bash
cd backend && uv sync && uv run uvicorn app.main:app --port 8000
```

`uv sync` downloads the backend's libraries the first time (about 10 seconds). No settings file is needed: it already looks for the records API at port 8081.

**You should see:**

```text
INFO:     Started server process [17865]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Check it by opening http://127.0.0.1:8000/health in the browser. You see `{"ok":true}`.

> **If you see this error**
> `ERROR:    [Errno 98] error while attempting to bind on address ('127.0.0.1', 8000): address already in use`
>
> Port 8000 is taken by another program. Press **Ctrl + C** in the terminal that has it. If you do not know which one, close all your terminals and start again from step 3.

## Step 5. Start the web page (Terminal 3)

**What you are doing:** starting the frontend, the page you will see in the browser. Open a **third terminal**, go to the folder, and run:

```bash
cd ~/bnamericas-editor
```

<!-- run server 5173 -->
```bash
cd frontend && npm install && npm run dev
```

`npm install` downloads the page's libraries the first time (about 20 seconds; warnings in yellow are normal).

**You should see** (the last lines are the important ones):

```text
> bnamericas-frontend@0.1.0 dev
> vite

  VITE v5.4.10  ready in 297 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

> **If you see this error**
> `Port 5173 is in use, trying another one...` and the address shown is 5174
>
> An old copy of the page is still open somewhere. Press **Ctrl + C** in that older terminal and start this one again, so the page is at 5173 like the rest of this guide.

## Step 6. Open the page and find a project

**What you are doing:** looking at the app for the first time. Open http://localhost:5173 in your browser.

1. You see a table called **Projects**.
2. Click the search box (it says "Search by name or country") and type `Lumbara`.
3. Click **Paso Lumbara Transmission Line**. The edit form opens.

**You should see:** the list with 10 projects per page, and after your search a single row, "Paso Lumbara Transmission Line", with sector Energy, country Chile and stage Tender.

> **If you see this error**
> **Could not load projects** (a red box with a Retry button)
>
> The backend is not running or has stopped. Look at Terminal 2 (step 4): if it shows an error or is gone, run the step 4 command again. In Terminal 3 you will see `http proxy error: /api/projects` and `connect ECONNREFUSED 127.0.0.1:8000`, which means the same thing. Then press **Retry**.
>
> If Terminal 2 is fine, check Terminal 1 (step 3): the backend needs the records API.

## Step 7. Edit a project and save it

**What you are doing:** changing a project and saving it.

1. In the form of "Paso Lumbara Transmission Line", change **Stage** from Tender to **Financing**. The field gets a blue border: that marks an unsaved change.
2. Press **Save changes** at the bottom.

**You should see:** the bar at the bottom says `Saved` with the time. Go back to the list and open the project again: the stage is still Financing.

About 1 time in 10 the records API answers slowly or fails on purpose (it imitates a flaky service). Then the page shows **"Checking whether it was saved…"**. This is normal: do not press Save again. The backend reads the project again to find out whether your change went through, and tells you the result.

> **If you see this error**
> **The server took too long to answer. We are checking whether your changes were saved before trying again.** (it can last a few seconds)
>
> Wait. It ends in `Saved`, or in `Could not save` with a **Retry** button. If it says `Could not save`, press **Retry** once. Your edits stay in the form, nothing is lost.

> **If you see this error**
> **We could not load this project.** (red box with a Retry button) or **Could not save.** and nothing else happens
>
> The backend (Terminal 2) or the records API (Terminal 1) stopped. Start it again with the command in step 3 or 4, then press Retry. Remember that stopping the records API makes it forget all your saves.

## Step 8. Cause a conflict and solve it

**What you are doing:** pretending that two people edit the same project at once, using two browser tabs. The app must never lose one of the changes silently.

1. Open the project "Paso Lumbara Transmission Line" in **tab A**. Open the **same** project in **tab B** (copy the address bar, open a new tab, paste).
2. In tab A change the date of **Tender launch** to a new day, then press **Save changes**. It says `Saved`.
3. In tab B change **the same** date, **Tender launch**, to a different day, then press **Save changes**.

**You should see** in tab B a window titled **Someone else saved this project while you were editing**. It shows two values for Tender launch: "Your value" and "Current value · saved by someone else". Pick one and press **Save my selection**. The bar says `Saved`, and the date is the one you picked.

Try also this: reload both tabs, change **Country** in tab A and save, then change **Name** in tab B and save. No window appears and the project keeps **both** changes, because they were different fields.

> **If you see this error**
> No window appears and the second save just says `Saved`, but you expected a conflict
>
> You changed different fields in the two tabs (or tab B was opened after tab A saved). A conflict only happens when both tabs started from the same version of the project and changed the same field. Reload both tabs and repeat the steps exactly, changing the same date in both.

> **If you see this error**
> The window says `Choose 1 more field` and **Save my selection** is grey
>
> You must choose one of the two values in every conflict before the **Save my selection** button turns on. **Back to the form** closes the window without saving anything.

## Glossary

Short meanings of the words used in this guide, each with an example from this project. Come back here whenever a word is not clear.

- **API**: a program that other programs ask for data, instead of people. *Example: our backend asks the records API for project P-1001.*
- **Backend**: the program that sits between the web page and the data and does the careful work. *Example: our FastAPI backend in `backend/` runs on port 8000 (Terminal 2).*
- **Frontend**: the part of the app you see and click in the browser. *Example: the project list and the edit form at http://localhost:5173 (Terminal 3).*
- **Upstream**: a service owned by another team that we use as it is and must not change. *Example: the records API in `upstream/` (Terminal 1) holds about 30 example projects.*
- **Endpoint**: one address of an API that does one job. *Example: `GET /api/projects` returns the list of projects and `PUT /api/projects/P-1001` saves one.*
- **Merge**: joining two sets of changes into one result. *Example: if you edit the name and someone else edits the budget of the same project, the backend merges both changes.*
- **Conflict**: two people changed the same field of the same project, so the app cannot choose for you. *Example: Step 8 makes one on purpose and you pick a value in the "Save my selection" window.*
- **Terminal**: a window where you type a command and press Enter. *Example: the 3 terminals you keep open, one per program.*
- **uv**: the tool that installs and runs the Python parts. *Example: `uv run upstream` starts the records API.*
- **Node**: the tool that runs JavaScript on your computer, needed to start the web page. *Example: `npm run dev` in `frontend/` uses Node to serve the page.*
- **Port**: a numbered door on your computer where a program listens. *Example: 8081 is the records API, 8000 the backend and 5173 the web page.*
- **JSON**: a plain-text way to write data as `name: value` pairs. *Example: the backend answers with `{"id": "P-1001", "name": "..."}`.*

---

## When you finish

Stop each program with **Ctrl + C** in its terminal (3, 2 and 1). The records API forgets all its changes when it stops, so the next start gives you the original 30 projects again.

To change the code, continue with the technical documentation (Documentation, then Technical).

## How this guide is tested

`scripts/guide_check.sh` copies the repository into an empty folder, runs every command in a block marked above (the ones that start with `uv --version` and the three servers), then saves a project through the backend and forces a conflict. It turns off the random slowness and 504 errors of the records API for that run only (`UPSTREAM_SLOW_RATE=0 UPSTREAM_TIMEOUT_RATE=0`), so the test is not random. You keep them on, and now you know why they appear.
