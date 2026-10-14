import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { KeyDate } from '../types';

export interface KeyDatesEditorProps {
  value: KeyDate[];
  onChange: (next: KeyDate[]) => void;
  /** Labels of rows that differ from the saved version; those rows get the blue border. */
  changedLabels?: string[];
  /** Show "required" on blank cells (after a failed save attempt). */
  showErrors?: boolean;
}

const changedSx = {
  '& .MuiOutlinedInput-notchedOutline': { borderWidth: 2, borderColor: 'primary.main' },
  '& .MuiInputLabel-root': { color: 'primary.main' },
};

/** Controlled list of key dates (label + date rows) with add and remove; shows "No key dates" when empty. */
export function KeyDatesEditor({ value, onChange, changedLabels = [], showErrors = false }: KeyDatesEditorProps) {
  const update = (i: number, patch: Partial<KeyDate>) =>
    onChange(value.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <Box>
      {value.length === 0 && (
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          No key dates
        </Typography>
      )}
      {value.map((row, i) => {
        const changed = changedLabels.includes(row.label);
        const sx = changed ? changedSx : undefined;
        return (
          <Box
            key={i}
            data-testid="key-date-row"
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0,1fr) 44px', sm: 'minmax(0,1fr) 200px 44px' },
              gap: { xs: 1, sm: 2 },
              alignItems: 'center',
              mb: 2,
              pb: { xs: 2, sm: 0 },
              borderBottom: { xs: '1px solid', sm: 'none' },
              borderColor: 'divider',
            }}
          >
            <TextField
              label="Date label"
              value={row.label}
              onChange={(e) => update(i, { label: e.target.value })}
              error={showErrors && !row.label.trim()}
              helperText={showErrors && !row.label.trim() ? 'Required' : undefined}
              data-changed={changed}
              sx={{ ...sx, gridColumn: 1 }}
              fullWidth
            />
            <TextField
              label="Date"
              type="date"
              value={row.date}
              onChange={(e) => update(i, { date: e.target.value })}
              error={showErrors && !row.date}
              helperText={showErrors && !row.date ? 'Required' : undefined}
              InputLabelProps={{ shrink: true }}
              inputProps={{ 'aria-label': `Date for ${row.label || 'new date'}` }}
              data-changed={changed}
              sx={{ ...sx, gridColumn: 1, gridRow: { xs: 2, sm: 'auto' }, '@media (min-width:600px)': { gridColumn: 2 } }}
              fullWidth
            />
            <IconButton
              aria-label={`Remove ${row.label || 'date'}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              sx={{ width: 44, height: 44, gridColumn: { xs: 2, sm: 3 }, gridRow: { xs: '1 / 3', sm: 'auto' } }}
            >
              <DeleteOutlineIcon />
            </IconButton>
          </Box>
        );
      })}
      <Button startIcon={<AddIcon />} onClick={() => onChange([...value, { label: '', date: '' }])} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
        Add date
      </Button>
    </Box>
  );
}
