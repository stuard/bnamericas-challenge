import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getProject, listProjects, saveProject } from './api';
import type { Editable } from './types';

const ed: Editable = { name: 'P', sector: 'water', country: 'Peru', stage: 'idea', key_dates: [], linked_companies: [] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

function stub(res: Response) {
  const f = vi.fn().mockResolvedValue(res);
  vi.stubGlobal('fetch', f);
  return f;
}

describe('api', () => {
  it('lists projects from /api/projects', async () => {
    const f = stub(json(200, [{ id: '1' }]));
    expect(await listProjects()).toEqual([{ id: '1' }]);
    expect(f.mock.calls[0][0]).toBe('/api/projects');
  });

  it('saves and reports saved', async () => {
    const f = stub(json(200, { project: { id: '1', ...ed }, auto_merged: ['name'] }));
    const r = await saveProject('1', ed, ed);
    expect(r.kind).toBe('saved');
    if (r.kind === 'saved') expect(r.autoMerged).toEqual(['name']);
    expect(f.mock.calls[0][1].method).toBe('PUT');
  });

  it('turns 409 into a conflict result', async () => {
    stub(json(409, { type: 'conflict', status: 409, title: 't', current: ed, conflicts: [{ key: 'name', field: 'name' }], auto_merged: [] }));
    const r = await saveProject('1', ed, ed);
    expect(r).toMatchObject({ kind: 'conflict', current: ed, conflicts: [{ key: 'name' }] });
  });

  it.each([404, 502])('throws ApiError on %i', async (status) => {
    stub(json(status, { detail: 'nope' }));
    await expect(getProject('1')).rejects.toMatchObject({ name: 'ApiError', status, message: 'nope' });
    stub(json(status, { detail: 'nope' }));
    await expect(saveProject('1', ed, ed)).rejects.toBeInstanceOf(ApiError);
  });

  it('only ever calls URLs under /api/', async () => {
    const f = vi.fn().mockImplementation(async () => json(200, []));
    vi.stubGlobal('fetch', f);
    await listProjects();
    await getProject('a/b');
    await saveProject('x', ed, ed);
    expect(f.mock.calls.length).toBe(3);
    for (const c of f.mock.calls) expect(String(c[0])).toMatch(/^\/api\//);
  });
});
