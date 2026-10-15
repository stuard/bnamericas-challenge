// Mirrors backend/app/models.py. Change both together.

export type Sector = 'energy' | 'mining' | 'water' | 'transport' | 'oil_and_gas' | 'ict';
export type Stage =
  | 'idea' | 'feasibility' | 'tender' | 'financing' | 'construction' | 'operation' | 'cancelled';
export type CompanyRole = 'owner' | 'developer' | 'epc_contractor' | 'financier' | 'consultant';

/** One dated milestone; label is its identity, date is YYYY-MM-DD. */
export interface KeyDate {
  label: string;
  date: string;
}

/** A company tied to a project with a role. */
export interface LinkedCompany {
  name: string;
  role: CompanyRole;
}

/** The fields a person may change (exactly what the upstream PUT accepts). */
export interface Editable {
  name: string;
  sector: Sector;
  country: string;
  stage: Stage;
  key_dates: KeyDate[];
  linked_companies: LinkedCompany[];
}

/** A full project as the detail endpoint returns it: editable fields plus read-only extras. */
export type Project = Editable & { id: string } & { [readOnly: string]: unknown };

/** The slim row shown in the list. */
export interface ProjectSummary {
  id: string;
  name: string;
  sector: string;
  country: string;
  stage: string;
}

/** One field that both you and someone else changed differently. */
export interface Conflict {
  key: string;
  field: string;
  label?: string | null;
  base?: string | null;
  mine?: string | null;
  theirs?: string | null;
}

/** Body of the 409 answer; current is the new base for the retry. */
export interface ConflictResponse {
  type: string;
  status: number;
  title: string;
  current: Editable;
  conflicts: Conflict[];
  auto_merged: string[];
}

/** Body of PUT /api/projects/{id}. */
export interface SaveRequest {
  base: Editable;
  mine: Editable;
  resolutions?: Record<string, 'mine' | 'theirs'> | null;
  /** Conflict key -> the value of theirs the last 409 showed for it. */
  seen?: Record<string, string | null> | null;
}

/** What saveProject gives back: either saved or a conflict to resolve. */
export type SaveResult =
  | { kind: 'saved'; project: Project; autoMerged: string[] }
  | { kind: 'conflict'; current: Editable; conflicts: Conflict[]; autoMerged: string[] };
