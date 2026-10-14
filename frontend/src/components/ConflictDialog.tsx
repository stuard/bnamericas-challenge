import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Radio, RadioGroup, Typography } from '@mui/material';
import type { Conflict } from '../types';

type Choice = 'mine' | 'theirs';

export interface ConflictDialogProps {
  open: boolean;
  conflicts: Conflict[];
  autoMerged: string[];
  onResolve: (resolutions: Record<string, Choice>) => void;
  onBack: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FIELD_NAMES: Record<string, string> = {
  name: 'Name',
  sector: 'Sector',
  country: 'Country',
  stage: 'Stage',
  key_dates: 'Key date',
  linked_companies: 'Linked company',
};

/** '2026-12-15' becomes '15 Dec 2026'; any other text is shown as it is, with underscores as spaces. */
export function formatValue(value?: string | null): string {
  if (value == null || value === '') return '(none)';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function conflictTitle(c: Conflict): string {
  const name = FIELD_NAMES[c.field] ?? c.field;
  return c.label ? `${name} · ${c.label}` : name;
}

function Option({ choice, who, value }: { choice: Choice; who: string; value: string }) {
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        gap: 1,
        alignItems: 'flex-start',
        minHeight: 44,
        p: 1.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        cursor: 'pointer',
        '&:has(input:checked)': { borderColor: 'primary.main', bgcolor: '#F3F8FE', outline: '1px solid #1565C0' },
        '&:has(input:focus-visible)': { outline: '2px solid #1565C0' },
      }}
    >
      <Radio value={choice} size="small" sx={{ p: 0.25 }} />
      <Box>
        <Typography variant="caption" color="text.secondary" display="block">{who}</Typography>
        <Typography fontWeight={600}>{value}</Typography>
      </Box>
    </Box>
  );
}

export function ConflictDialog({ open, conflicts, autoMerged, onResolve, onBack }: ConflictDialogProps) {
  const [chosen, setChosen] = useState<Record<string, Choice>>({});
  const missing = conflicts.filter((c) => !chosen[c.key]);
  const pickAll = (choice: Choice) => setChosen(Object.fromEntries(conflicts.map((c) => [c.key, choice])));
  const resolve = () => onResolve(Object.fromEntries(conflicts.map((c) => [c.key, chosen[c.key]])));

  return (
    <Dialog
      open={open}
      onClose={onBack}
      scroll="paper"
      fullWidth
      maxWidth="md"
      aria-labelledby="conflict-title"
      PaperProps={{
        sx: {
          '@media (max-width:599.95px)': { m: 0, width: '100%', maxWidth: 'none', height: '100%', maxHeight: 'none', borderRadius: 0 },
        },
      }}
    >
      <DialogTitle id="conflict-title" sx={{ fontWeight: 700 }}>
        Someone else saved this project while you were editing
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontWeight: 400 }}>
          {conflicts.length === 1 ? 'You both changed the same field.' : `You both changed the same thing in ${conflicts.length} fields.`}{' '}
          Choose which value stays in each one; nothing is saved until you decide.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, color: 'text.secondary', fontSize: 14, mb: 1 }}>
          <span>Choose for all:</span>
          <Button size="small" onClick={() => pickAll('mine')} sx={{ minHeight: 44 }}>My values</Button>
          <Button size="small" onClick={() => pickAll('theirs')} sx={{ minHeight: 44 }}>Current values</Button>
        </Box>
        {conflicts.map((c) => (
          <Box key={c.key} component="fieldset" sx={{ border: 0, p: 0, m: 0, mb: 3 }}>
            <Typography component="legend" fontWeight={600} sx={{ mb: 1 }}>{conflictTitle(c)}</Typography>
            <RadioGroup
              value={chosen[c.key] ?? ''}
              onChange={(e) => setChosen((s) => ({ ...s, [c.key]: e.target.value as Choice }))}
              aria-label={conflictTitle(c)}
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}
            >
              <Option choice="mine" who="Your value" value={formatValue(c.mine)} />
              <Option choice="theirs" who="Current value · saved by someone else" value={formatValue(c.theirs)} />
            </RadioGroup>
          </Box>
        ))}
        {autoMerged.length > 0 && (
          <Box sx={{ bgcolor: '#F1F3F6', borderRadius: 1, p: 1.5, fontSize: 14, color: 'text.secondary' }}>
            <strong>Merged without conflict:</strong> {autoMerged.join(' · ')}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: '1 1 100%', '@media (min-width:600px)': { flex: 1 } }}>
          {missing.length > 0 && `Choose ${missing.length} more field${missing.length === 1 ? '' : 's'}: ${missing.map(conflictTitle).join(', ')}`}
        </Typography>
        <Button onClick={onBack} sx={{ minHeight: 44, flex: { xs: '1 1 100%', sm: 'none' }, order: { xs: 3, sm: 0 } }}>
          Back to the form
        </Button>
        <Button
          variant="contained"
          onClick={resolve}
          disabled={missing.length > 0}
          sx={{ minHeight: 44, flex: { xs: '1 1 100%', sm: 'none' }, order: { xs: 2, sm: 0 } }}
        >
          Save my selection
        </Button>
      </DialogActions>
    </Dialog>
  );
}
