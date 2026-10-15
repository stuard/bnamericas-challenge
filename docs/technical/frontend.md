# Frontend technical reference

Written for a junior developer who has never opened React or MUI in this repo. The frontend lives in `frontend/src/` (React 18 + MUI 6 + React Router 6, built with Vite, tested with Vitest). `frontend/src/main.tsx` is the entry point: it wraps `<App />` in `ThemeProvider`, `CssBaseline` and `BrowserRouter`; it exports nothing, so it has no entry below. `types.ts` only holds TypeScript types (no runtime code); each type is explained inside the entry of the function that uses it (`Editable`, `KeyDate`, `Project`, `ProjectSummary` in `listProjects`, `getProject` and `saveProject`; `Conflict` in `conflictTitle`; `SaveStatus` in `SaveBar`).

Every **Example** is a complete Vitest file. Its first line says whether it was copied from an existing test or run as a scratch test; both ran green (see `work/c10/` in the task folder). To try one, save it next to the source file as `something.test.tsx` and run `cd frontend && npm test -- --run`.

## Frontend · src/api.ts

The only file that talks to the network. Every other file calls these functions instead of `fetch`. It sends requests to the FastAPI backend under `/api/*` (the Vite dev server forwards `/api` to `http://127.0.0.1:8000`), and turns answers into typed results.

> **Note** Golden rule: only `api.ts` calls `fetch`, and only for URLs that start with `/api/`. The private `request()` helper throws if you ask for anything else. The browser never talks to the upstream project service; if you need new data, add a function here and a route in the backend.

### `frontend/src/api.ts::ApiError`

**What it does:** The one error type the frontend throws for a failed request. It carries the HTTP status as a number so screens can react to it (404 means not found, 504 means the server timed out). A status of 0 means the browser could not reach the server at all.

**Takes:** `status: number` (for example `404`) and `message: string` (for example `'Upstream down'`). You normally do not build it yourself; `request()` and `toError()` inside api.ts do.

**Returns:** An object that is an `Error` (so `instanceof Error` works) with a `.status` field and `.name === 'ApiError'`. Example: `new ApiError(502, 'Upstream down').status` is `502`.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to api.ts)
import { expect, it, vi } from 'vitest';
import { ApiError, getProject } from './api';

it('wraps a failed answer in ApiError', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'nope' }), { status: 404 })));
  await expect(getProject('1')).rejects.toMatchObject({ name: 'ApiError', status: 404, message: 'nope' });
  const e = new ApiError(502, 'Upstream down');
  expect(e).toBeInstanceOf(Error);
  expect(e.status).toBe(502);
  vi.unstubAllGlobals();
});
```

### `frontend/src/api.ts::listProjects`

**What it does:** Asks the backend for the slim list of every project (id, name, sector, country, stage). The list screen calls it once when it opens. It is a thin wrapper: one GET to `/api/projects`.

**Takes:** Nothing.

**Returns:** A promise of `ProjectSummary[]` (see `types.ts`), for example `[{ id: '1', name: 'Solar Atacama', sector: 'energy', country: 'Chile', stage: 'tender' }]`. Throws `ApiError` when the server answers with an error.

**Example:**

```tsx
// Verified: copied from api.test.ts ('lists projects from /api/projects'), run with vitest
import { expect, it, vi } from 'vitest';
import { listProjects } from './api';

it('lists projects from /api/projects', async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: '1' }]), { status: 200 }));
  vi.stubGlobal('fetch', f);
  expect(await listProjects()).toEqual([{ id: '1' }]);
  expect(f.mock.calls[0][0]).toBe('/api/projects');
  vi.unstubAllGlobals();
});
```

### `frontend/src/api.ts::getProject`

**What it does:** Fetches one full project by id: the six editable fields plus read-only extras. The edit screen calls it on open and when you press Retry. The id is URL-encoded, so `'a/b'` cannot escape the path.

**Takes:** `id: string`, for example `'12'`.

**Returns:** A promise of `Project` (the `Editable` fields plus `id` and read-only extras). Throws `ApiError(404, ...)` when the project does not exist, `ApiError(0, 'Could not reach the server.')` when the network is down.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to api.ts)
import { expect, it, vi } from 'vitest';
import { getProject } from './api';

it('gets one project and encodes the id', async () => {
  const body = { id: '12', name: 'Solar', sector: 'energy', country: 'Chile', stage: 'idea', key_dates: [], linked_companies: [] };
  const f = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', f);
  expect((await getProject('12')).name).toBe('Solar');
  expect(f.mock.calls[0][0]).toBe('/api/projects/12');
  await getProject('a/b');
  expect(f.mock.calls[1][0]).toBe('/api/projects/a%2Fb');
  vi.unstubAllGlobals();
});
```

### `frontend/src/api.ts::saveProject`

**What it does:** Sends your edits to the backend with `PUT /api/projects/{id}`. It sends three things so the backend can merge safely without remembering anything: `base` (what you loaded), `mine` (what you want now) and, after a conflict, `resolutions` (for each conflicting field, `'mine'` or `'theirs'`) plus `seen` (for each of those fields, the `theirs` value the 409 showed; it is only sent together with `resolutions`). `base` stays the ORIGINAL loaded copy on every retry. A 409 answer is not an error here: it becomes a normal `{ kind: 'conflict' }` result so the screen can open the conflict dialog. `SaveResult` is the union `{ kind: 'saved', project, autoMerged } | { kind: 'conflict', current, conflicts, autoMerged }` (in `types.ts`).

**Takes:** `id: string` (`'12'`); `base: Editable` (the six fields as loaded); `mine: Editable` (the six fields as edited); `resolutions?: Record<string, 'mine' | 'theirs'>` (for example `{ name: 'mine' }`, optional); `seen?: Record<string, string | null>` (for example `{ name: 'Solar B' }`, optional, sent only with `resolutions`).

**Returns:** A promise of `SaveResult`. Saved: `{ kind: 'saved', project, autoMerged: ['name'] }`, where `autoMerged` lists fields the backend merged for you. Conflict: `{ kind: 'conflict', current, conflicts: [{ key: 'name', field: 'name', ... }], autoMerged }`, where `current` is the newest server data. It is shown in the dialog but is NOT used as the next `base`. Any other failure (404, 422, 502, 504) throws `ApiError`.

**Example:**

```tsx
// Verified: copied from api.test.ts ('saves and reports saved', 'turns 409 into a conflict result'), run with vitest
import { expect, it, vi } from 'vitest';
import { saveProject } from './api';
import type { Editable } from './types';

const ed: Editable = { name: 'P', sector: 'water', country: 'Peru', stage: 'idea', key_dates: [], linked_companies: [] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

it('saved and conflict are both normal results', async () => {
  const f = vi.fn().mockResolvedValueOnce(json(200, { project: { id: '1', ...ed }, auto_merged: ['name'] }));
  vi.stubGlobal('fetch', f);
  const r = await saveProject('1', ed, ed);
  expect(r.kind).toBe('saved');
  if (r.kind === 'saved') expect(r.autoMerged).toEqual(['name']);
  expect(f.mock.calls[0][1].method).toBe('PUT');

  f.mockResolvedValueOnce(json(409, { type: 'conflict', status: 409, title: 't', current: ed, conflicts: [{ key: 'name', field: 'name' }], auto_merged: [] }));
  const c = await saveProject('1', ed, ed);
  expect(c).toMatchObject({ kind: 'conflict', current: ed, conflicts: [{ key: 'name' }] });
  vi.unstubAllGlobals();
});
```

## Frontend · src/App.tsx

The map of the app: which URL shows which screen.

### `frontend/src/App.tsx::App`

**What it does:** The route table. It decides which screen shows for which URL, and puts every screen inside `AppShell` so the top bar is always present. Routes: `/` the project list, `/projects/:id` the edit form, `/docs/general`, `/docs/technical` and `/docs/guide` the documentation pages, anything else shows `Page not found.`. To add a screen, add one `<Route>` here.

**Takes:** No props. It must be rendered inside a router (`BrowserRouter` in production, `MemoryRouter` in tests).

**Returns:** The React element tree of the whole app. At `/nope` it renders the text `Page not found.` inside the shell.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to App.tsx)
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

it('shows the shell and the not-found text for an unknown path', () => {
  render(<MemoryRouter initialEntries={['/nope']}><App /></MemoryRouter>);
  expect(screen.getByText('BNamericas')).toBeInTheDocument();
  expect(screen.getByText('Page not found.')).toBeInTheDocument();
});
```

## Frontend · src/theme.ts

The shared look (colours, spacing, font).

> **Note** MUI basics used in this repo. MUI is the component library (`Button`, `TextField`, `Dialog`...). Two ideas appear everywhere. The `sx` prop is a style object on any MUI component: `sx={{ px: 2, color: 'primary.main' }}` means padding left and right of 2 x 8 px = 16 px and the theme's primary colour. Responsive values use breakpoints: `{ xs: '1fr', md: '1fr 1fr' }` is one column on phones and two from 900 px. Theme tokens such as `primary.main`, `text.secondary`, `divider`, `background.paper` come from this file, so prefer tokens over hard-coded hex colours.

> The theme is the file's default export (`export default theme`), a value rather than a named symbol, so it has no entry of its own. Pass it to `<ThemeProvider theme={theme}>`; `theme.palette.primary.main` is `'#1565C0'` and `theme.spacing(2)` is `'16px'`.

## Frontend · src/components/AppShell.tsx

The frame (top bar, docs bar, outlet) that wraps every screen.

### `frontend/src/components/AppShell.tsx::AppShell`

**What it does:** The frame around every screen: a dark top bar with the BNamericas brand link, a Projects link and a Documentation menu (General, Technical, Step-by-step guide). Under 600 px wide the links collapse into one menu button with 44 px or larger tap targets. On `/docs/*` pages a second bar with the three doc pages is shown. It renders `<Outlet />`, which is where React Router puts the current screen.

**Takes:** No props. It reads the current URL with `useLocation()` and the screen width with `useMediaQuery('(max-width:599.95px)')`. It is used as a layout route in `App.tsx`.

**Returns:** The top bar, the optional docs bar and the matched screen. Wide screens show a `navigation` named `Main`; narrow screens show a button named `Open menu` whose menu has `Projects` plus the three docs links.

**Example:**

```tsx
// Verified: copied from AppShell.test.tsx ('shows the Documentation menu with its three pages'), run with vitest
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

it('shows the Documentation menu with its three pages', async () => {
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  expect(screen.getByText('BNamericas')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /documentation/i }));
  for (const n of ['General', 'Technical', 'Step-by-step guide'])
    expect(await screen.findByRole('menuitem', { name: n })).toBeInTheDocument();
});
```

## Frontend · src/components/SaveBar.tsx

The save status strip with the Save, Discard and Retry buttons.

### `frontend/src/components/SaveBar.tsx::SaveBar`

**What it does:** The one place that shows the state of saving, next to the buttons that cause it: how many unsaved changes, a spinner while saving, the saved time, an amber warning while we check a timed-out save, and an error with Retry. It sticks to the bottom of the screen. It has no logic of its own: the edit screen decides the `status`, this component only draws it. The exported types are `SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'verifying' | 'error'` and `SaveBarProps`.

**Takes:** `dirtyCount: number` (for example `3`); `status: SaveStatus` (for example `'dirty'`); `savedAt?: Date` (shown as `Saved · 22:41`); `onSave`, `onDiscard`, `onRetry: () => void`.

**Returns:** A `section` named `Save status`. With `status='dirty'` and `dirtyCount=3` it shows `3 unsaved changes` and both buttons (`Discard changes`, `Save changes`) enabled. With `'clean'` both buttons are disabled; with `'saving'` or `'verifying'` they are disabled too.

**Example:**

```tsx
// Verified: copied from SaveBar.test.tsx ('dirty: counts changes, buttons enabled'), run with vitest
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { SaveBar } from './SaveBar';

it('dirty: counts changes, buttons enabled', () => {
  render(<SaveBar dirtyCount={3} status="dirty" onSave={vi.fn()} onDiscard={vi.fn()} onRetry={vi.fn()} />);
  expect(screen.getByText('3 unsaved changes')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled();
});
```

## Frontend · src/components/ConflictDialog.tsx

The dialog where a person decides which value stays when two people edited the same field, plus two small formatting helpers.

### `frontend/src/components/ConflictDialog.tsx::formatValue`

**What it does:** Turns a raw value from the backend into text a person reads in the conflict dialog. A date `'2026-12-15'` becomes `15 Dec 2026`; other text has underscores replaced by spaces and a capital first letter (`'oil_and_gas'` becomes `Oil and gas`); empty or missing becomes `(none)`. An impossible date such as `'2026-13-45'` is not a date, so it is shown as text.

**Takes:** `value?: string | null`, for example `'2026-12-15'`, `'oil_and_gas'` or `null`.

**Returns:** A `string`: `'15 Dec 2026'`, `'Oil and gas'` or `'(none)'`.

**Example:**

```tsx
// Verified: copied from ConflictDialog.test.tsx ('formats dates for people and keeps other text'), run with vitest
import { formatValue } from './ConflictDialog';

it('formats dates for people and keeps other text', () => {
  expect(formatValue('2026-12-15')).toBe('15 Dec 2026');
  expect(formatValue('oil_and_gas')).toBe('Oil and gas');
  expect(formatValue(null)).toBe('(none)');
  expect(formatValue('2026-13-45')).toBe('2026-13-45');
});
```

### `frontend/src/components/ConflictDialog.tsx::conflictTitle`

**What it does:** Builds the heading of one conflict row: the readable field name, plus the key-date label when the conflict is about a key date. Unknown fields fall back to the raw field name.

**Takes:** `c: Conflict` (see `types.ts`), for example `{ key: 'key_date:cierre financiero', field: 'key_dates', label: 'Cierre financiero' }`.

**Returns:** A `string`, for example `'Key date · Cierre financiero'`, or `'Stage'` for `{ key: 'stage', field: 'stage' }`.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to ConflictDialog.tsx)
import { conflictTitle } from './ConflictDialog';

it('names the field, and the label for key dates', () => {
  expect(conflictTitle({ key: 'stage', field: 'stage' })).toBe('Stage');
  expect(conflictTitle({ key: 'key_date:cierre financiero', field: 'key_dates', label: 'Cierre financiero' })).toBe('Key date · Cierre financiero');
});
```

### `frontend/src/components/ConflictDialog.tsx::mergedLabel`

**What it does:** Turns one entry of the "Merged without conflict" list into text a person reads. The entry is a field key, optionally followed by `:label` (a key date or linked company) and `|mine` or `|theirs` (who changed it). `name` becomes `Name`; `key_date:tender launch` becomes `Date "tender launch"`; `|mine` adds `(your change)` and `|theirs` adds `(their change)`.

**Takes:** `entry: string`, for example `'name|mine'` or `'key_date:tender launch|theirs'`.

**Returns:** A `string`, for example `'Name (your change)'` or `'Date "tender launch" (their change)'`.

**Example:**

```tsx
// Verified: copied from ConflictDialog.test.tsx, run with vitest
import { mergedLabel } from './ConflictDialog';

it('labels merged entries with the field and who changed it', () => {
  expect(mergedLabel('name')).toBe('Name');
  expect(mergedLabel('name|mine')).toBe('Name (your change)');
  expect(mergedLabel('country|theirs')).toBe('Country (their change)');
  expect(mergedLabel('key_date:tender launch|theirs')).toBe('Date "tender launch" (their change)');
});
```

### `frontend/src/components/ConflictDialog.tsx::ConflictDialog`

**What it does:** The dialog that opens when two people changed the same field. For every conflict it shows two radio choices, `Your value` and `Current value · saved by someone else`. `Save my selection` stays disabled until every row has a choice, then calls `onResolve` with one answer per conflict key. `Choose for all` buttons pick every row at once, and `Back to the form` closes it without saving. Fields that merged without conflict are listed at the bottom. On phones it fills the screen.

**Takes:** `open: boolean`; `conflicts: Conflict[]` (rows to decide, from `saveProject`); `autoMerged: string[]` (fields merged for you, for example `['name', 'country']`); `onResolve: (resolutions: Record<string, 'mine' | 'theirs'>) => void`; `onBack: () => void`.

**Returns:** A modal dialog. After choosing `mine` for the stage row and `theirs` for the key date row and pressing `Save my selection`, `onResolve` receives `{ stage: 'mine', 'key_date:cierre financiero': 'theirs' }`.

**Example:**

```tsx
// Verified: copied from ConflictDialog.test.tsx ('enables only when every row is chosen and resolves with exactly the keys'), run with vitest
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ConflictDialog } from './ConflictDialog';
import type { Conflict } from '../types';

const conflicts: Conflict[] = [
  { key: 'stage', field: 'stage', base: 'tender', mine: 'financing', theirs: 'construction' },
  { key: 'key_date:cierre financiero', field: 'key_dates', label: 'Cierre financiero', base: '2026-10-01', mine: '2026-12-15', theirs: '2027-01-30' },
];

it('resolves with exactly the keys', async () => {
  const onResolve = vi.fn();
  render(<ConflictDialog open conflicts={conflicts} autoMerged={[]} onResolve={onResolve} onBack={vi.fn()} />);
  const primary = screen.getByRole('button', { name: 'Save my selection' });
  expect(primary).toBeDisabled();
  await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Stage' })).getAllByRole('radio')[0]);
  await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Key date · Cierre financiero' })).getAllByRole('radio')[1]);
  expect(primary).toBeEnabled();
  await userEvent.click(primary);
  expect(onResolve).toHaveBeenCalledWith({ stage: 'mine', 'key_date:cierre financiero': 'theirs' });
});
```

## Frontend · src/components/KeyDatesEditor.tsx

The editable list of key dates used inside the edit form.

### `frontend/src/components/KeyDatesEditor.tsx::KeyDatesEditor`

**What it does:** A controlled list editor for key dates. Each row has a label field, a date field and a remove button; `Add date` appends a blank row; an empty list shows `No key dates`. It never stores anything itself: every edit calls `onChange` with a new array, and the parent keeps the state (this is the standard React 'controlled component' pattern). Rows whose label is in `changedLabels` get a blue border; with `showErrors` blank cells show `Required`. The exported `KeyDatesEditorProps` describes these four props.

**Takes:** `value: KeyDate[]` (for example `[{ label: 'Award', date: '2027-01-01' }]`); `onChange: (next: KeyDate[]) => void`; `changedLabels?: string[]` (default `[]`); `showErrors?: boolean` (default `false`).

**Returns:** One row per key date, each marked `data-testid="key-date-row"`, plus the Add button. Typing `X` in the label `Award` calls `onChange([{ label: 'AwardX', date: '2027-01-01' }])`.

**Example:**

```tsx
// Verified: copied from KeyDatesEditor.test.tsx ('reports edits through onChange and marks changed labels'), run with vitest
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { KeyDatesEditor } from './KeyDatesEditor';

it('reports edits through onChange and marks changed labels', async () => {
  const onChange = vi.fn();
  render(<KeyDatesEditor value={[{ label: 'Award', date: '2027-01-01' }]} onChange={onChange} changedLabels={['Award']} />);
  await userEvent.type(screen.getByLabelText('Date label'), 'X');
  expect(onChange).toHaveBeenLastCalledWith([{ label: 'AwardX', date: '2027-01-01' }]);
  expect(screen.getByLabelText('Date label').closest('[data-changed]')).toHaveAttribute('data-changed', 'true');
});
```

## Frontend · src/components/Markdown.tsx

Markdown renderer for the documentation pages.

### `frontend/src/components/Markdown.tsx::Markdown`

**What it does:** Renders a Markdown text (GitHub flavour) with the app's styling: headings with `#` anchors, copyable code blocks, coloured callouts, tables that scroll sideways inside their own box, and links with a 44 px tap area.

**Takes:** `{ source: string }`, for example `<Markdown source={'## Hi'} />`.

**Returns:** The rendered React elements; each heading carries the id `extractToc` gives it.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to Markdown.tsx)
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Markdown } from './Markdown';

it('renders a heading with its id', () => {
  render(<MemoryRouter><Markdown source={'## Hello world'} /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 2 }).id).toBe('hello-world');
});
```

### `frontend/src/components/Markdown.tsx::slugify`

**What it does:** Turns a heading text into the id used in its `#anchor`: lowercase, accents removed, anything that is not a letter or digit becomes one dash, dashes at the ends are trimmed. An empty result becomes `section`.

**Takes:** `text: string`, for example `'Case 1: same field'`.

**Returns:** A string such as `'case-1-same-field'`.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to Markdown.tsx)
import { slugify } from './Markdown';

it('makes anchor ids', () => {
  expect(slugify('Case 1: same field')).toBe('case-1-same-field');
  expect(slugify('Año nuevo')).toBe('ano-nuevo');
  expect(slugify('???')).toBe('section');
});
```

### `frontend/src/components/Markdown.tsx::extractToc`

**What it does:** Lists the `##` and `###` headings of a Markdown text for the 'On this page' list and the jump menu. Lines inside code fences are skipped, and repeated headings get `-2`, `-3`... so every id is unique.

**Takes:** `markdown: string`, the whole source.

**Returns:** An array of `{ level: 2 | 3, text, id, line }`, `line` counted from 1. Empty when there are no such headings.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to Markdown.tsx)
import { extractToc } from './Markdown';

it('lists headings with unique ids', () => {
  const toc = extractToc('# T\n## One\n### Sub\n## One\n');
  expect(toc.map((t) => t.id)).toEqual(['one', 'sub', 'one-2']);
  expect(toc[1]).toMatchObject({ level: 3, text: 'Sub', line: 3 });
});
```

### `frontend/src/components/Markdown.tsx::calloutKind`

**What it does:** Decides whether a quote is a coloured callout. It looks at the first bold word of the quote (`> **Note** ...`) and accepts `note`, `tip`, `warning` and `danger`, in any letter case.

**Takes:** `firstBold: string | null`, the text of the first bold word, or `null` when the quote does not start with one.

**Returns:** The kind as a lowercase string, or `null` for an ordinary quote.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to Markdown.tsx)
import { calloutKind } from './Markdown';

it('recognises callout words', () => {
  expect(calloutKind('Warning')).toBe('warning');
  expect(calloutKind(' TIP ')).toBe('tip');
  expect(calloutKind('Hello')).toBeNull();
  expect(calloutKind(null)).toBeNull();
});
```

## Frontend · src/pages/DocsPage.tsx

The screen behind the three documentation URLs .

### `frontend/src/pages/DocsPage.tsx::DocsPage`

**What it does:** The screen behind `/docs/general`, `/docs/technical` and `/docs/guide`: the rendered text, a 'Jump to section' menu on phones (guide and technical), a sticky 'On this page' list of `##` entries on wide screens, the FAQ as an accordion, and previous/next cards.

**Takes:** `{ page, sources? }` where `page: 'general' | 'technical' | 'guide'`; `sources` replaces the real `docs/` files (used by tests).

**Returns:** The page. When no file exists it shows 'This page is not written yet'.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to DocsPage.tsx)
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DocsPage from './DocsPage';

it('shows the empty message', () => {
  render(<MemoryRouter><DocsPage page="guide" sources={{}} /></MemoryRouter>);
  expect(screen.getByText('This page is not written yet')).toBeInTheDocument();
});
```

### `frontend/src/pages/DocsPage.tsx::pageSource`

**What it does:** Joins the Markdown files of one documentation page, in order (`technical` is index, backend, frontend). Files that are missing or empty are skipped.

**Takes:** `page: 'general' | 'technical' | 'guide'` and `sources`, an object from file path to text (the real files come from `import.meta.glob`).

**Returns:** The joined text, or an empty string when no file exists.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to DocsPage.tsx)
import { pageSource } from './DocsPage';

it('joins technical files in order and skips missing ones', () => {
  const sources = { '../../../docs/technical/backend.md': 'B', '../../../docs/technical/index.md': 'I' };
  expect(pageSource('technical', sources)).toBe('I\n\nB');
  expect(pageSource('guide', {})).toBe('');
});
```

### `frontend/src/pages/DocsPage.tsx::splitFaq`

**What it does:** Finds the `## Frequently asked questions` section of a Markdown text and cuts it into its questions (each `###` heading with the answer below it), so the page can show them as an accordion. The Markdown file itself is not changed.

**Takes:** `source: string`, the whole page text.

**Returns:** `{ before, heading, items: { q, a }[], after }`, or `null` when there is no FAQ section with questions.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to DocsPage.tsx)
import { splitFaq } from './DocsPage';

it('splits the FAQ', () => {
  const r = splitFaq('## Frequently asked questions\n\n### Q1?\n\nA1.\n');
  expect(r?.items).toEqual([{ q: 'Q1?', a: 'A1.' }]);
  expect(splitFaq('## Other')).toBeNull();
});
```

## Frontend · src/pages/ProjectList.tsx

The home screen: the table of all projects, with search, filters, sorting and paging.

### `frontend/src/pages/ProjectList.tsx::label`

**What it does:** Makes an API code readable: underscores become spaces and the first letter is capitalised (`'oil_and_gas'` becomes `Oil and gas`). `'ict'` is special-cased to `ICT`. Used for sector and stage chips and the filter menus.

**Takes:** `code: string`, for example `'oil_and_gas'`, `'ict'`, `'construction'`.

**Returns:** A `string`: `'Oil and gas'`, `'ICT'`, `'Construction'`.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to ProjectList.tsx)
import { label } from './ProjectList';

it('turns codes into text', () => {
  expect(label('oil_and_gas')).toBe('Oil and gas');
  expect(label('ict')).toBe('ICT');
  expect(label('construction')).toBe('Construction');
});
```

### `frontend/src/pages/ProjectList.tsx::filterProjects`

**What it does:** The search and filter rule of the list, as a pure function (no React, easy to test). A project stays when it matches the chosen sector, the chosen stage, and EVERY word typed in the search box in its name or country. Search ignores capitals and accents, so `peru` finds `Perú`. Empty sector or stage means no filter.

**Takes:** `rows: ProjectSummary[]`; `search: string` (for example `'chile desal'`); `sector: string` (for example `'water'` or `''`); `stage: string` (`''` for any).

**Returns:** A new array with the matching rows, in the original order. Example: searching `'colombia solar'` over the three test projects returns `[]` because no single project has both words.

**Example:**

```tsx
// Verified: copied from ProjectList.test.tsx ('search needs all terms and matches name or country'), run with vitest
import { filterProjects } from './ProjectList';
import type { ProjectSummary } from '../types';

const P = (id: string, name: string, sector: string, country: string, stage: string): ProjectSummary => ({ id, name, sector, country, stage });
const FEW = [
  P('1', 'Solar Atacama', 'Energy', 'Chile', 'Financing'),
  P('2', 'Metro Bogota', 'Transport', 'Colombia', 'Tender'),
  P('3', 'Desalination Sur', 'Water', 'Chile', 'Construction'),
];

it('needs all the words', () => {
  expect(filterProjects(FEW, 'colombia solar', '', '')).toHaveLength(0);
  expect(filterProjects(FEW, 'chile desal', '', '').map((p) => p.id)).toEqual(['3']);
});
```

### `frontend/src/pages/ProjectList.tsx::ProjectList`

**What it does:** The home screen. It loads the list once with `listProjects()` (a grey skeleton while waiting, an error with Retry if it fails), then shows a searchable, filterable, sortable table, 10 rows per page by default (the page-size menu offers 10, 25 and 50). Clicking a column header sorts (a second click reverses). Changing a filter returns to page one. On phones (under 600 px) the table becomes a list of cards. Clicking a row goes to `/projects/:id`. Sector and Stage menus are built from the values present in the data.

**Takes:** No props. It needs a router (it calls `useNavigate`) and the MUI theme. All data comes from `listProjects` in `api.ts`.

**Returns:** A page titled `Projects` with `3 projects` beside it, the filter row and a table of rows. Empty results show `No projects match` with a `Clear filters` button.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to ProjectList.tsx); modelled on ProjectList.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { vi } from 'vitest';
import theme from '../theme';
import * as api from '../api';
import ProjectList from './ProjectList';

vi.mock('../api');

it('loads the list and filters by search text', async () => {
  vi.mocked(api.listProjects).mockResolvedValue([
    { id: '1', name: 'Solar Atacama', sector: 'energy', country: 'Chile', stage: 'financing' },
    { id: '2', name: 'Metro Bogota', sector: 'transport', country: 'Colombia', stage: 'tender' },
  ]);
  render(<ThemeProvider theme={theme}><MemoryRouter><ProjectList /></MemoryRouter></ThemeProvider>);
  expect(await screen.findByText('Solar Atacama')).toBeInTheDocument();
  expect(screen.getByText('2 projects')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Search by name or country'), 'bogota');
  expect(screen.queryByText('Solar Atacama')).toBeNull();
  expect(screen.getByText('Metro Bogota')).toBeInTheDocument();
});
```

## Frontend · src/pages/ProjectEdit.tsx

The edit screen for one project, with change tracking, saving and the conflict flow.

### `frontend/src/pages/ProjectEdit.tsx::pickEditable`

**What it does:** Copies only the six fields a person may edit (name, sector, country, stage, key_dates, linked_companies) out of a project, dropping `id` and the read-only extras. It makes a deep copy through JSON, so changing the form never changes the saved snapshot (`base`). The backend only accepts these six fields, so everything sent to it goes through here first.

**Takes:** `p: Editable` (a `Project` also works), for example `{ id: '12', name: 'Solar', sector: 'energy', country: 'Chile', stage: 'idea', key_dates: [], linked_companies: [], extra: 'x' }`.

**Returns:** A new `Editable` with only the six fields: `{ name: 'Solar', sector: 'energy', country: 'Chile', stage: 'idea', key_dates: [], linked_companies: [] }`.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to ProjectEdit.tsx)
import { pickEditable } from './ProjectEdit';

it('keeps only the six editable fields, as a copy', () => {
  const p = { id: '12', name: 'Solar', sector: 'energy', country: 'Chile', stage: 'idea', key_dates: [{ label: 'Award', date: '2027-01-01' }], linked_companies: [], extra: 'x' } as any;
  const e = pickEditable(p);
  expect(Object.keys(e).sort()).toEqual(['country', 'key_dates', 'linked_companies', 'name', 'sector', 'stage']);
  e.key_dates[0].date = '2030-01-01';
  expect(p.key_dates[0].date).toBe('2027-01-01');
});
```

### `frontend/src/pages/ProjectEdit.tsx::changedDateLabels`

**What it does:** Finds which key-date rows differ from the saved version, so the form can mark them with a blue border. Rows are matched by LABEL (the label is the identity of a key date, the same rule the backend merge uses). A row is changed when it is new or has another date than in `base`.

**Takes:** `base: KeyDate[]` (saved version); `mine: KeyDate[]` (current form), for example `[{ label: 'Award', date: '2027-02-01' }]`.

**Returns:** `string[]` of changed labels, for example `['Award']`. Unchanged rows are not listed.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to ProjectEdit.tsx)
import { changedDateLabels } from './ProjectEdit';

it('lists new and re-dated rows by label', () => {
  const base = [{ label: 'Award', date: '2027-01-01' }, { label: 'Close', date: '2027-03-01' }];
  const mine = [{ label: 'Award', date: '2027-02-01' }, { label: 'Close', date: '2027-03-01' }, { label: 'Start', date: '2027-09-01' }];
  expect(changedDateLabels(base, mine)).toEqual(['Award', 'Start']);
});
```

### `frontend/src/pages/ProjectEdit.tsx::countChanges`

**What it does:** Counts the changes shown in the save bar (`2 unsaved changes`). Each of name, sector, country and stage that differs counts once; each key date that was added, removed or given another date counts once (matched by label). When it returns 0 the form is clean and Save is disabled.

**Takes:** `base: Editable` (as loaded or last saved); `mine: Editable` (the form now).

**Returns:** A `number`. Example: changing the name and removing one key date returns `2`.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to ProjectEdit.tsx)
import { countChanges } from './ProjectEdit';
import type { Editable } from '../types';

it('counts scalar changes and key date changes once each', () => {
  const base: Editable = { name: 'Solar', sector: 'energy', country: 'Chile', stage: 'idea', key_dates: [{ label: 'Award', date: '2027-01-01' }], linked_companies: [] };
  expect(countChanges(base, base)).toBe(0);
  expect(countChanges(base, { ...base, name: 'Solar II', key_dates: [] })).toBe(2);
});
```

### `frontend/src/pages/ProjectEdit.tsx::ProjectEdit`

**What it does:** The edit screen for one project at `/projects/:id`. It loads the project, keeps two copies (`base` = as loaded, `form` = what you type), marks changed fields with a blue border and counts them. `Save` sends `base` and `form` to `saveProject`. If the answer is a conflict it opens `ConflictDialog`; when you choose, it re-sends the ORIGINAL `base` (never the newest server data) with your `resolutions` and `seen` (the `theirs` value each conflict showed). If the other person changed that field again meanwhile, the backend answers a new 409 and the dialog opens again with the fresh value. If the server times out (504) and returned the current data, it checks whether your change already landed, and retries once if not (the 'verifying' state), again with the original `base`. It also warns before you leave with unsaved changes. Linked companies are shown read-only.

**Takes:** No props. The id comes from the URL (`useParams`). Needs a router; it calls `getProject` and `saveProject` from `api.ts` and renders `KeyDatesEditor`, `SaveBar` and `ConflictDialog`.

**Returns:** While loading: a spinner. On success: the form with sections `General data`, `Key dates` and `Linked companies` and the save bar. A missing project shows `This project does not exist.` with a `Back to projects` link; other load failures show an error with Retry.

**Example:**

```tsx
// Verified: run with vitest (scratch test next to ProjectEdit.tsx); modelled on ProjectEdit.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import ProjectEdit from './ProjectEdit';
import * as api from '../api';

it('loads the project and counts one unsaved change', async () => {
  vi.spyOn(api, 'getProject').mockResolvedValue({
    id: '12', name: 'Solar Atacama', sector: 'energy', country: 'Chile', stage: 'tender',
    key_dates: [{ label: 'Award', date: '2027-01-01' }], linked_companies: [{ name: 'Atacama SpA', role: 'owner' }],
  });
  render(
    <MemoryRouter initialEntries={['/projects/12']}>
      <Routes><Route path="/projects/:id" element={<ProjectEdit />} /></Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByDisplayValue('Solar Atacama')).toBeInTheDocument();
  expect(screen.getByText('Atacama SpA · Owner')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Name'), ' II');
  expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
});
```
