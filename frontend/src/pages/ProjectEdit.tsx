import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Paper, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ApiError, getProject, saveProject } from '../api';
import type { Conflict, Editable, KeyDate, Project, Sector, Stage } from '../types';
import { KeyDatesEditor } from '../components/KeyDatesEditor';
import { SaveBar } from '../components/SaveBar';
import { ConflictDialog } from '../components/ConflictDialog';

const SECTORS: Record<Sector, string> = {
  energy: 'Energy', mining: 'Mining', water: 'Water', transport: 'Transport', oil_and_gas: 'Oil & gas', ict: 'ICT',
};
const STAGES: Record<Stage, string> = {
  idea: 'Idea', feasibility: 'Feasibility', tender: 'Tender', financing: 'Financing',
  construction: 'Construction', operation: 'Operation', cancelled: 'Cancelled',
};
const ROLES: Record<string, string> = {
  owner: 'Owner', developer: 'Developer', epc_contractor: 'EPC contractor', financier: 'Financier', consultant: 'Consultant',
};

type Load = { kind: 'loading' } | { kind: 'notfound' } | { kind: 'error'; message: string } | { kind: 'ready' };
type Phase = 'idle' | 'saving' | 'verifying' | 'saved' | 'error';
interface PendingConflict { current: Editable; conflicts: Conflict[]; autoMerged: string[] }

/** Copies only the six editable fields out of a project (drops id and read-only extras). */
export function pickEditable(p: Editable): Editable {
  return JSON.parse(
    JSON.stringify({
      name: p.name, sector: p.sector, country: p.country, stage: p.stage,
      key_dates: p.key_dates, linked_companies: p.linked_companies,
    }),
  );
}

/** Key-date labels whose row is new or has another date than in base. */
export function changedDateLabels(base: KeyDate[], mine: KeyDate[]): string[] {
  const was = new Map(base.map((d) => [d.label, d.date]));
  return mine.filter((d) => was.get(d.label) !== d.date).map((d) => d.label);
}

/** Number of changed fields: each scalar counts once, each key date added, removed or re-dated counts once. */
export function countChanges(base: Editable, mine: Editable): number {
  let n = (['name', 'sector', 'country', 'stage'] as const).filter((k) => base[k] !== mine[k]).length;
  const labels = new Set([...base.key_dates.map((d) => d.label), ...mine.key_dates.map((d) => d.label)]);
  const find = (list: KeyDate[], l: string) => list.find((d) => d.label === l)?.date;
  labels.forEach((l) => {
    if (find(base.key_dates, l) !== find(mine.key_dates, l)) n += 1;
  });
  return n;
}

const changedSx = {
  '& .MuiOutlinedInput-notchedOutline': { borderWidth: 2, borderColor: 'primary.main' },
  '& .MuiInputLabel-root': { color: 'primary.main' },
};

/** Edit screen for one project: loads it, tracks changes against the loaded snapshot, saves with conflict handling. */
export default function ProjectEdit() {
  const { id = '' } = useParams();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [title, setTitle] = useState('');
  const [base, setBase] = useState<Editable | null>(null);
  const [form, setForm] = useState<Editable | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [savedAt, setSavedAt] = useState<Date | undefined>();
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [saveError, setSaveError] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const applySaved = useCallback((p: Project) => {
    const e = pickEditable(p);
    setBase(e);
    setForm(e);
    setTitle(p.name);
    setConflict(null);
    setSaveError('');
    setSavedAt(new Date());
    setPhase('saved');
  }, []);

  const fetchProject = useCallback(() => {
    setLoad({ kind: 'loading' });
    getProject(id).then(
      (p) => {
        const e = pickEditable(p);
        setBase(e);
        setForm(e);
        setTitle(p.name);
        setPhase('idle');
        setLoad({ kind: 'ready' });
      },
      (err) => {
        if (err instanceof ApiError && err.status === 404) setLoad({ kind: 'notfound' });
        else setLoad({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      },
    );
  }, [id]);

  useEffect(fetchProject, [fetchProject]);

  const dirtyCount = base && form ? countChanges(base, form) : 0;
  const dirty = dirtyCount > 0;
  const changedLabels = useMemo(() => (base && form ? changedDateLabels(base.key_dates, form.key_dates) : []), [base, form]);

  // Warn before the tab closes or an in-app link is followed while edits are unsaved.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.origin !== window.location.origin) return;
      if (!window.confirm('You have unsaved changes. Leave this page and lose them?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  const edit = (patch: Partial<Editable>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setPhase((p) => (p === 'saved' || p === 'error' ? 'idle' : p));
  };

  const invalid = !!form && (!form.name.trim() || !form.country.trim() || form.key_dates.some((d) => !d.label.trim() || !d.date));

  // Sends the save; handles saved, conflict, and a 504 that carries the current data (verify once, then report).
  const send = async (from: Editable, resolutions?: Record<string, 'mine' | 'theirs'>, verifying = false): Promise<void> => {
    if (!form) return;
    setPhase(verifying ? 'verifying' : 'saving');
    setSaveError('');
    try {
      const r = await saveProject(id, from, form, resolutions);
      if (r.kind === 'saved') applySaved(r.project);
      else {
        setConflict({ current: r.current, conflicts: r.conflicts, autoMerged: r.autoMerged });
        setPhase('idle');
      }
    } catch (err) {
      const current = (err as { current?: Editable }).current;
      if (err instanceof ApiError && err.status === 504 && current && !verifying) {
        if (JSON.stringify(pickEditable(current)) === JSON.stringify(pickEditable(form))) {
          applySaved({ ...current, id } as Project);
          return;
        }
        return send(pickEditable(current), resolutions, true);
      }
      setSaveError(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    }
  };

  const onSave = () => {
    if (!base || invalid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    void send(base);
  };

  const onRetry = () => (conflict ? undefined : onSave());

  const onDiscard = () => {
    if (!base) return;
    setForm(pickEditable(base));
    setShowErrors(false);
    setSaveError('');
    setPhase('idle');
  };

  const onResolve = (resolutions: Record<string, 'mine' | 'theirs'>) => {
    if (conflict) void send(conflict.current, resolutions);
  };

  if (load.kind === 'loading') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
        <CircularProgress aria-label="Loading project" />
      </Box>
    );
  }
  if (load.kind === 'notfound' || load.kind === 'error') {
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', p: { xs: 2, md: 4 } }}>
        <Alert
          severity={load.kind === 'notfound' ? 'warning' : 'error'}
          action={
            load.kind === 'error' ? (
              <Button color="inherit" onClick={fetchProject}>Retry</Button>
            ) : (
              <Button color="inherit" component={RouterLink} to="/">Back to projects</Button>
            )
          }
        >
          {load.kind === 'notfound' ? 'This project does not exist.' : `We could not load this project. ${load.message}`}
        </Alert>
      </Box>
    );
  }
  if (!base || !form) return null;

  const status = phase === 'saving' || phase === 'verifying' || phase === 'error' ? phase : dirty ? 'dirty' : phase === 'saved' ? 'saved' : 'clean';
  const mark = (k: 'name' | 'sector' | 'country' | 'stage') => ({
    'data-changed': base[k] !== form[k],
    sx: base[k] !== form[k] ? changedSx : undefined,
  });

  return (
    <Box>
      <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 4 }, pt: { xs: 2, md: 4 }, pb: 3 }}>
        <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 500, mb: 0.5 }}>
          Projects
        </Button>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap', mb: 3 }}>
          <Typography component="h1" sx={{ fontSize: { xs: 22, md: 28 }, fontWeight: 700 }}>{title}</Typography>
          <Typography color="text.secondary" sx={{ fontSize: 14 }}>ID {id}</Typography>
        </Box>
        {phase === 'verifying' && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            <strong>The server took too long to answer.</strong> We are checking whether your changes were saved before trying again. Do not close this page.
          </Alert>
        )}
        {phase === 'error' && (
          <Alert severity="error" sx={{ mb: 3 }}>{saveError || 'Could not save.'}</Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 360px' }, gap: 3, alignItems: 'start' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
              <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600 }}>General data</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 14, mb: 3 }}>Fields with a blue border have unsaved changes.</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 2.5, md: 3 } }}>
                <TextField
                  label="Name" value={form.name} onChange={(e) => edit({ name: e.target.value })}
                  error={showErrors && !form.name.trim()} helperText={showErrors && !form.name.trim() ? 'Required' : undefined}
                  {...mark('name')} sx={{ ...mark('name').sx, gridColumn: { md: '1 / -1' } }}
                />
                <TextField
                  select label="Sector" value={form.sector} onChange={(e) => edit({ sector: e.target.value as Sector })}
                  SelectProps={{ native: true }} InputLabelProps={{ shrink: true }} {...mark('sector')}
                >
                  {Object.entries(SECTORS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </TextField>
                <TextField
                  label="Country" value={form.country} onChange={(e) => edit({ country: e.target.value })}
                  error={showErrors && !form.country.trim()} helperText={showErrors && !form.country.trim() ? 'Required' : undefined}
                  {...mark('country')}
                />
                <TextField
                  select label="Stage" value={form.stage} onChange={(e) => edit({ stage: e.target.value as Stage })}
                  SelectProps={{ native: true }} InputLabelProps={{ shrink: true }} {...mark('stage')}
                >
                  {Object.entries(STAGES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </TextField>
              </Box>
            </Paper>
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
              <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600 }}>Key dates</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 14, mb: 3 }}>
                Each date is identified by its label: if two people change the same one, we will ask which one stays.
              </Typography>
              <KeyDatesEditor value={form.key_dates} onChange={(key_dates) => edit({ key_dates })} changedLabels={changedLabels} showErrors={showErrors} />
            </Paper>
          </Box>
          <Paper variant="outlined" component="aside" sx={{ p: { xs: 2, md: 3 } }}>
            <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600 }}>Linked companies</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 14, mb: 2 }}>Read-only in this version. Sent unchanged when you save.</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {form.linked_companies.length === 0 && <Typography color="text.secondary">No linked companies</Typography>}
              {form.linked_companies.map((c, i) => (
                <Chip key={i} variant="outlined" label={`${c.name} · ${ROLES[c.role] ?? c.role}`} />
              ))}
            </Box>
          </Paper>
        </Box>
      </Box>
      <Box sx={{ position: 'sticky', bottom: 0, zIndex: 10, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider' }}>
        <SaveBar dirtyCount={dirtyCount} status={status} savedAt={savedAt} onSave={onSave} onDiscard={onDiscard} onRetry={onRetry} />
      </Box>
      <ConflictDialog
        open={!!conflict}
        conflicts={conflict?.conflicts ?? []}
        autoMerged={conflict?.autoMerged ?? []}
        onResolve={onResolve}
        onBack={() => setConflict(null)}
      />
    </Box>
  );
}
