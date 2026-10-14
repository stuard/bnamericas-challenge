import type { ConflictResponse, Editable, Project, ProjectSummary, SaveRequest, SaveResult } from './types';

/** Error for any answer that is not success or a 409 conflict. */
export class ApiError extends Error {
  status: number;
  /** Newest saved data, when the server sends it with a 502/504 so the page can check whether the save landed. */
  current?: Editable;
  constructor(status: number, message: string, current?: Editable) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (current) this.current = current;
  }
}

// The only function that calls fetch, and only for paths under /api/.
async function request(path: string, init?: RequestInit): Promise<Response> {
  if (!path.startsWith('/api/')) throw new Error(`Refusing to call outside /api: ${path}`);
  try {
    return await fetch(path, init);
  } catch {
    throw new ApiError(0, 'Could not reach the server.');
  }
}

// Builds an ApiError from a failed response, using the backend's message when it has one.
async function toError(res: Response): Promise<ApiError> {
  let msg = `Request failed (${res.status})`;
  let current: Editable | undefined;
  try {
    const body = await res.json();
    const detail = body?.detail ?? body?.title ?? body?.message;
    if (typeof detail === 'string') msg = detail;
    if (body?.current && typeof body.current === 'object') current = body.current;
  } catch {
    /* body was not JSON; keep the default message */
  }
  return new ApiError(res.status, msg, current);
}

// The backend sends {id, editable, readonly}; the page works with one flat object.
function toProject(raw: any): Project {
  if (raw && raw.editable) return { ...raw.readonly, ...raw.editable, id: raw.id };
  return raw;
}

/** Returns the slim list of all projects (id, name, sector, country, stage). */
export async function listProjects(): Promise<ProjectSummary[]> {
  const res = await request('/api/projects');
  if (!res.ok) throw await toError(res);
  return res.json();
}

/** Returns one full project by id; throws ApiError(404) when it does not exist. */
export async function getProject(id: string): Promise<Project> {
  const res = await request(`/api/projects/${encodeURIComponent(id)}`);
  if (!res.ok) throw await toError(res);
  return toProject(await res.json());
}

/**
 * Saves your edits. base = what you loaded, mine = what you want, resolutions = your choice per conflict.
 * Gives {kind:'saved'} or, on a 409, {kind:'conflict'} with the newest data; anything else throws ApiError.
 */
export async function saveProject(
  id: string,
  base: Editable,
  mine: Editable,
  resolutions?: SaveRequest['resolutions'],
): Promise<SaveResult> {
  const body: SaveRequest = { base, mine, ...(resolutions ? { resolutions } : {}) };
  const res = await request(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const c: ConflictResponse = await res.json();
    return { kind: 'conflict', current: c.current, conflicts: c.conflicts, autoMerged: c.auto_merged ?? [] };
  }
  if (!res.ok) throw await toError(res);
  const data = await res.json();
  const project = toProject(data.project ?? data);
  return { kind: 'saved', project, autoMerged: data.auto_merged ?? [] };
}
