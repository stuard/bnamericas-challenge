import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectEdit from './ProjectEdit';
import * as api from '../api';
import type { Project } from '../types';

vi.mock('../components/SaveBar', () => ({
  SaveBar: (p: { dirtyCount: number; status: string; onSave: () => void; onDiscard: () => void; onRetry: () => void }) => (
    <div>
      <span data-testid="bar">{`${p.status}:${p.dirtyCount}`}</span>
      <button onClick={p.onSave}>Save</button>
      <button onClick={p.onDiscard}>Discard</button>
      <button onClick={p.onRetry}>Retry save</button>
    </div>
  ),
}));
vi.mock('../components/ConflictDialog', () => ({
  ConflictDialog: (p: { open: boolean; conflicts: { key: string }[]; autoMerged: string[]; onResolve: (r: Record<string, 'mine' | 'theirs'>) => void; onBack: () => void }) =>
    p.open ? (
      <div role="dialog">
        <span>{`conflicts:${p.conflicts.map((c) => c.key).join(',')} merged:${p.autoMerged.join(',')}`}</span>
        <button onClick={() => p.onResolve({ name: 'mine' })}>Resolve mine</button>
        <button onClick={p.onBack}>Back</button>
      </div>
    ) : null,
}));

const project: Project = {
  id: 'P-1001',
  name: 'Solar Atacama',
  sector: 'energy',
  country: 'Chile',
  stage: 'tender',
  key_dates: [{ label: 'Award', date: '2027-01-01' }],
  linked_companies: [{ name: 'Atacama SpA', role: 'owner' }],
  extra: 'read-only',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/P-1001']}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}
const bar = () => screen.getByTestId('bar').textContent;
const field = (label: string) => screen.getByLabelText(label).closest('[data-changed]');

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ProjectEdit', () => {
  it('loads and renders the project, key dates and read-only companies', async () => {
    const get = vi.spyOn(api, 'getProject').mockResolvedValue(project);
    renderPage();
    expect(await screen.findByDisplayValue('Solar Atacama')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('P-1001');
    expect(screen.getByDisplayValue('Award')).toBeInTheDocument();
    expect(screen.getByText('Atacama SpA')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText(/Sent unchanged when you save/)).toBeInTheDocument();
    expect(bar()).toBe('clean:0');
  });

  it('marks changed fields in blue and counts them; discard resets', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue(project);
    renderPage();
    const name = await screen.findByLabelText('Name');
    expect(field('Name')).toHaveAttribute('data-changed', 'false');
    await userEvent.type(name, ' II');
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'financing');
    expect(field('Name')).toHaveAttribute('data-changed', 'true');
    expect(field('Stage')).toHaveAttribute('data-changed', 'true');
    expect(field('Country')).toHaveAttribute('data-changed', 'false');
    expect(bar()).toBe('dirty:2');
    await userEvent.click(screen.getByText('Discard'));
    expect(bar()).toBe('clean:0');
    expect(screen.getByLabelText('Name')).toHaveValue('Solar Atacama');
  });

  it('adds and removes key dates and counts them', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue(project);
    renderPage();
    await screen.findByLabelText('Name');
    await userEvent.click(screen.getByRole('button', { name: 'Add date' }));
    const rows = screen.getAllByTestId('key-date-row');
    expect(rows).toHaveLength(2);
    await userEvent.type(within(rows[1]).getByLabelText('Date label'), 'Close');
    await userEvent.type(within(rows[1]).getByLabelText(/^Date for/), '2027-05-01');
    expect(bar()).toBe('dirty:1');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Award' }));
    expect(bar()).toBe('dirty:2');
    expect(screen.getAllByTestId('key-date-row')).toHaveLength(1);
  });

  it('saves with the loaded base and takes the returned project as the new base', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue(project);
    const save = vi.spyOn(api, 'saveProject').mockResolvedValue({
      kind: 'saved', autoMerged: [], project: { ...project, name: 'Solar Atacama II', country: 'Peru' },
    });
    renderPage();
    await userEvent.type(await screen.findByLabelText('Name'), ' II');
    await userEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(bar()).toBe('saved:0'));
    const [id, base, mine] = save.mock.calls[0];
    expect(id).toBe('P-1001');
    expect(base.name).toBe('Solar Atacama');
    expect(mine.name).toBe('Solar Atacama II');
    expect(mine.linked_companies).toEqual(project.linked_companies);
    expect(screen.getByLabelText('Country')).toHaveValue('Peru');
  });

  it('blocks saving a blank key date', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue(project);
    const save = vi.spyOn(api, 'saveProject');
    renderPage();
    await screen.findByLabelText('Name');
    await userEvent.click(screen.getByRole('button', { name: 'Add date' }));
    await userEvent.click(screen.getByText('Save'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
  });

  it('opens the conflict dialog and re-sends with resolutions and the ORIGINAL base', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue(project);
    const theirs = { ...project, name: 'Their name', stage: 'financing' as const };
    const save = vi
      .spyOn(api, 'saveProject')
      .mockResolvedValueOnce({ kind: 'conflict', current: theirs, conflicts: [{ key: 'name', field: 'name' }], autoMerged: ['stage'] })
      .mockResolvedValueOnce({ kind: 'saved', autoMerged: [], project: { ...theirs, name: 'My name' } });
    renderPage();
    const name = await screen.findByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'My name');
    await userEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('conflicts:name merged:stage')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Resolve mine'));
    await waitFor(() => expect(bar()).toBe('saved:0'));
    const [, base2, mine2, res] = save.mock.calls[1];
    expect(base2.name).toBe('Solar Atacama');
    expect(base2.stage).toBe('tender');
    expect(mine2.name).toBe('My name');
    expect(res).toEqual({ name: 'mine' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('on a 504 with current data it shows verifying, then retries once and saves', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue(project);
    const err = new api.ApiError(504, 'Upstream timeout', project);
    let release: (v: api.ApiError | never) => void = () => {};
    const save = vi
      .spyOn(api, 'saveProject')
      .mockRejectedValueOnce(err)
      .mockImplementationOnce(() => new Promise((res) => { release = () => res({ kind: 'saved', autoMerged: [], project: { ...project, name: 'Solar Atacama II' } }); }));
    renderPage();
    await userEvent.type(await screen.findByLabelText('Name'), ' II');
    await userEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(bar()).toBe('verifying:1'));
    expect(screen.getByText(/checking whether your changes were saved/)).toBeInTheDocument();
    release(err);
    await waitFor(() => expect(bar()).toBe('saved:0'));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('shows the save error and Retry re-sends', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue(project);
    const save = vi
      .spyOn(api, 'saveProject')
      .mockRejectedValueOnce(new api.ApiError(502, 'Upstream down'))
      .mockResolvedValueOnce({ kind: 'saved', autoMerged: [], project });
    renderPage();
    await userEvent.type(await screen.findByLabelText('Name'), 'x');
    await userEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(bar()).toBe('error:1'));
    expect(screen.getByText('Upstream down')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Retry save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });

  it('shows a 404 state', async () => {
    vi.spyOn(api, 'getProject').mockRejectedValue(new api.ApiError(404, 'nope'));
    renderPage();
    expect(await screen.findByText('This project does not exist.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to projects' })).toBeInTheDocument();
  });

  it('shows a load error and Retry loads again', async () => {
    const get = vi
      .spyOn(api, 'getProject')
      .mockRejectedValueOnce(new api.ApiError(502, 'Upstream down'))
      .mockResolvedValueOnce(project);
    renderPage();
    expect(await screen.findByText(/We could not load this project/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByDisplayValue('Solar Atacama')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('asks before following a link while there are unsaved changes', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue(project);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await userEvent.type(await screen.findByLabelText('Name'), 'x');
    await userEvent.click(screen.getByRole('link', { name: /Projects/ }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('retries a 504 with the original base, not the server current', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue(project);
    const other = { ...project, country: 'Chile A' };
    const save = vi
      .spyOn(api, 'saveProject')
      .mockRejectedValueOnce(new api.ApiError(504, 'Upstream timeout', other))
      .mockResolvedValueOnce({ kind: 'saved', autoMerged: [], project: { ...other, name: 'Solar Atacama II' } });
    renderPage();
    await userEvent.type(await screen.findByLabelText('Name'), ' II');
    await userEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(bar()).toBe('saved:0'));
    expect(save.mock.calls[1][1].country).toBe('Chile');
    expect(save.mock.calls[1][2].country).toBe('Chile');
  });
});

// Real-shaped backend ({id, editable, readonly}) behind fetch, merging field by field like backend/app/merge.py.
describe('ProjectEdit against the real API shape', () => {
  const stored = { name: 'Solar Atacama', sector: 'energy', country: 'Chile', stage: 'tender', key_dates: [], linked_companies: [{ name: 'Atacama SpA', role: 'owner' }] } as Record<string, unknown>;
  const display = () => ({ id: 'P-1001', editable: { ...stored }, readonly: { updated_at: 'x' } });

  function fakeBackend() {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || !init.method) return new Response(JSON.stringify(display()), { status: 200 });
      const { base, mine, resolutions } = JSON.parse(String(init.body));
      const conflicts: { key: string; field: string }[] = [];
      const next = { ...stored };
      for (const k of ['name', 'sector', 'country', 'stage']) {
        if (mine[k] === base[k] || mine[k] === stored[k]) continue;
        if (stored[k] === base[k] || resolutions?.[k] === 'mine') next[k] = mine[k];
        else if (resolutions?.[k] !== 'theirs') conflicts.push({ key: k, field: k });
      }
      if (conflicts.length) return new Response(JSON.stringify({ current: { ...stored }, conflicts, auto_merged: [] }), { status: 409 });
      Object.assign(stored, next);
      return new Response(JSON.stringify({ project: display(), saved: true, auto_merged: [] }), { status: 200 });
    }));
  }

  it('renders a real {id, editable, readonly} answer', async () => {
    fakeBackend();
    renderPage();
    expect(await screen.findByDisplayValue('Solar Atacama')).toBeInTheDocument();
    expect(screen.getByText('Atacama SpA')).toBeInTheDocument();
  });

  it('two writers: resolving a conflict keeps the other person\'s untouched-by-me field', async () => {
    fakeBackend();
    renderPage();
    const name = await screen.findByLabelText('Name');
    stored.country = 'Chile A'; // writer A saved while B was editing
    stored.name = 'Their name';
    await userEvent.clear(name);
    await userEvent.type(name, 'My name');
    await userEvent.click(screen.getByText('Save'));
    await userEvent.click(await screen.findByText('Resolve mine'));
    await waitFor(() => expect(bar()).toBe('saved:0'));
    expect(stored.name).toBe('My name');
    expect(stored.country).toBe('Chile A');
    expect(screen.getByLabelText('Country')).toHaveValue('Chile A');
  });
});
