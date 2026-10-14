import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, FormControl, InputLabel, Link, MenuItem, Paper, Select, Skeleton, Stack,
  Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TableSortLabel, TextField,
  Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { listProjects } from '../api';
import type { ProjectSummary } from '../types';

const PAGE_SIZES = [10, 25, 50];
const STAGE_SX = { fontWeight: 500, fontSize: 14, bgcolor: 'primary.light', color: 'primary.dark' } as const;
const STAGE_COLORS: Record<string, object> = {
  operation: { bgcolor: 'success.light', color: 'success.dark' },
  cancelled: { bgcolor: 'grey.200', color: 'text.secondary' },
};
const SELECT_BOX = { style: { minHeight: 44, boxSizing: 'border-box', display: 'flex', alignItems: 'center' } } as const;
const CELL16 = { fontSize: 16 } as const;
const LINK_SX = { color: 'inherit', textDecoration: 'none', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: 0.5 } } as const;

// MUI keeps a hidden input inside each Select; giving it a 44px box keeps touch-target checks quiet.
const NATIVE_SX = { '& .MuiSelect-nativeInput': { height: 44, minWidth: 44 } } as const;

type SortKey = 'name' | 'sector' | 'country' | 'stage';
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'sector', label: 'Sector' },
  { key: 'country', label: 'Country' },
  { key: 'stage', label: 'Stage' },
];

/** Turns an API code like "oil_and_gas" into readable text: "Oil and gas". */
export const label = (code: string) => { if (code === 'ict') return 'ICT'; const t = code.replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

// Lowercases and removes accents so "peru" finds "Perú".
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Keeps projects matching ALL words typed in the search box (name or country), the sector and the stage. */
export function filterProjects(rows: ProjectSummary[], search: string, sector: string, stage: string): ProjectSummary[] {
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  return rows.filter((p) => {
    if (sector && p.sector !== sector) return false;
    if (stage && p.stage !== stage) return false;
    const hay = normalize(`${p.name} ${p.country}`);
    return terms.every((t) => hay.includes(t));
  });
}

// Sector is a category (outlined chip); stage is a status (filled chip).
function SectorChip({ value }: { value: string }) {
  return <Chip label={label(value)} variant="outlined" size="small" />;
}
// Real link so keyboard users can reach the row; the row click stays as a bonus.
function ProjectLink({ id, name }: { id: string; name: string }) {
  return <Link component={RouterLink} to={`/projects/${id}`} onClick={(e: React.MouseEvent) => e.stopPropagation()} sx={LINK_SX}>{name}</Link>;
}
function StageChip({ value }: { value: string }) {
  return <Chip label={label(value)} size="small" sx={{ ...STAGE_SX, ...STAGE_COLORS[value.toLowerCase()] }} />;
}

// Gray placeholder rows shown while the list loads.
function LoadingRows() {
  return (
    <Box data-testid="list-loading" sx={{ p: 2 }}>
      {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rectangular" height={40} sx={{ mb: 1, borderRadius: 1 }} />)}
    </Box>
  );
}

/** The home screen: searchable, filterable, sortable table of projects; a row opens /projects/:id. */
export default function ProjectList() {
  const navigate = useNavigate();
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [rows, setRows] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('');
  const [stage, setStage] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  // Loads the list from the API (also used by the Retry button).
  const load = useCallback(() => {
    setError(false);
    setRows(null);
    listProjects().then(setRows, () => setError(true));
  }, []);
  useEffect(load, [load]);

  const sectors = useMemo(() => [...new Set((rows ?? []).map((p) => p.sector))].sort(), [rows]);
  const stages = useMemo(() => [...new Set((rows ?? []).map((p) => p.stage))].sort(), [rows]);
  const visible = useMemo(() => {
    const f = filterProjects(rows ?? [], search, sector, stage);
    const k = sort.key;
    return [...f].sort((a, b) => a[k].localeCompare(b[k]) * (sort.dir === 'asc' ? 1 : -1));
  }, [rows, search, sector, stage, sort]);
  const shown = visible.slice(page * pageSize, (page + 1) * pageSize);

  const filtered = Boolean(search || sector || stage);
  // Resets all three filters and goes back to the first page.
  const clear = () => { setSearch(''); setSector(''); setStage(''); setPage(0); };
  // Runs a filter change and returns to page one so the user never lands on an empty page.
  const changed = (fn: () => void) => { fn(); setPage(0); };
  // Toggles direction on the same column, or sorts a new column ascending.
  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const open = (id: string) => navigate(`/projects/${id}`);

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 4 }, py: { xs: 3, sm: 4 } }}>
      <Stack direction="row" alignItems="baseline" spacing={2} sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, fontSize: { xs: 24, sm: 28 } }}>Projects</Typography>
        {rows && <Typography color="text.secondary" sx={{ fontSize: 16 }}>{rows.length} projects</Typography>}
      </Stack>
      <Paper variant="outlined">
        <Stack direction="row" spacing={2} useFlexGap sx={{ p: { xs: 1.5, sm: 2 }, flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            size="small" placeholder="Search by name or country" value={search}
            onChange={(e) => changed(() => setSearch(e.target.value))}
            slotProps={{ htmlInput: { 'aria-label': 'Search by name or country' } }}
            sx={{ flex: { xs: '1 1 100%', sm: '1 1 320px' }, maxWidth: { sm: 420 }, '& .MuiInputBase-root': { minHeight: 44 }, '& .MuiInputBase-input': { boxSizing: 'border-box', height: 44 } }}
          />
          <FormControl size="small" sx={{ flex: { xs: '1 1 0', sm: '0 0 180px' }, minWidth: 0, '& .MuiInputBase-root': { minHeight: 44 } }}>
            <InputLabel shrink id="sector-l">Sector</InputLabel>
            <Select notched sx={NATIVE_SX} SelectDisplayProps={SELECT_BOX} labelId="sector-l" label="Sector" value={sector} displayEmpty onChange={(e) => changed(() => setSector(e.target.value))}>
              <MenuItem value="">All</MenuItem>
              {sectors.map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: { xs: '1 1 0', sm: '0 0 180px' }, minWidth: 0, '& .MuiInputBase-root': { minHeight: 44 } }}>
            <InputLabel shrink id="stage-l">Stage</InputLabel>
            <Select notched sx={NATIVE_SX} SelectDisplayProps={SELECT_BOX} labelId="stage-l" label="Stage" value={stage} displayEmpty onChange={(e) => changed(() => setStage(e.target.value))}>
              <MenuItem value="">All</MenuItem>
              {stages.map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>

        {error ? (
          <Alert severity="error" sx={{ m: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>
            Could not load projects
          </Alert>
        ) : rows === null ? (
          <LoadingRows />
        ) : visible.length === 0 ? (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <Typography sx={{ mb: 2 }}>{filtered ? 'No projects match' : 'There are no projects yet'}</Typography>
            {filtered && <Button variant="outlined" onClick={clear}>Clear filters</Button>}
          </Box>
        ) : phone ? (
          <Box component="ul" aria-label="Projects" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {shown.map((p) => (
              <Box component="li" key={p.id} onClick={() => open(p.id)}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.75, cursor: 'pointer', borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }}><ProjectLink id={p.id} name={p.name} /></Typography>
                  <Typography color="text.secondary">{label(p.sector)} · {p.country}</Typography>
                  <Box sx={{ mt: 0.75 }}><StageChip value={p.stage} /></Box>
                </Box>
                <Typography color="text.secondary" aria-hidden>›</Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} sortDirection={sort.key === c.key ? sort.dir : false} sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    <TableSortLabel active={sort.key === c.key} direction={sort.key === c.key ? sort.dir : 'asc'} onClick={() => sortBy(c.key)} sx={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                      {c.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((p) => (
                <TableRow key={p.id} hover onClick={() => open(p.id)} sx={{ cursor: 'pointer' }}>
                  <TableCell sx={{ ...CELL16, fontWeight: 600 }}><ProjectLink id={p.id} name={p.name} /></TableCell>
                  <TableCell sx={CELL16}><SectorChip value={p.sector} /></TableCell>
                  <TableCell sx={CELL16}>{p.country}</TableCell>
                  <TableCell sx={CELL16}><StageChip value={p.stage} /></TableCell>
                  <TableCell align="right" sx={{ ...CELL16, color: 'text.secondary' }} aria-hidden>›</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {rows && visible.length > 0 && (
          <TablePagination
            component="div" count={visible.length} page={page} rowsPerPage={pageSize} rowsPerPageOptions={PAGE_SIZES}
            onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            onPageChange={(_, p) => { setPage(p); window.scrollTo({ top: 0 }); }}
            sx={{ '& .MuiTablePagination-selectLabel, & .MuiTablePagination-input': { display: { xs: 'none', sm: 'block' } }, '& .MuiIconButton-root': { width: 44, height: 44 }, '& .MuiTablePagination-displayedRows': { fontSize: 16 } }}
          />
        )}
      </Paper>
    </Box>
  );
}
