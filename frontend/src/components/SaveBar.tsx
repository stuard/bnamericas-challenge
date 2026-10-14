import { Box, Button, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

export type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'verifying' | 'error';

export interface SaveBarProps {
  dirtyCount: number;
  status: SaveStatus;
  savedAt?: Date;
  onSave: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}

const BTN = { minHeight: 44, minWidth: 44, textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' } as const;

function clock(date?: Date): string {
  if (!date) return '';
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** The one place where every save state is shown, next to the button that triggers it. */
export function SaveBar({ dirtyCount, status, savedAt, onSave, onDiscard, onRetry }: SaveBarProps) {
  const busy = status === 'saving' || status === 'verifying';
  const canSave = status === 'dirty' || status === 'error';
  const plural = dirtyCount === 1 ? 'change' : 'changes';

  let line: React.ReactNode = null;
  if (status === 'dirty') {
    line = (
      <>
        <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'warning.main' }} />
        {dirtyCount} unsaved {plural}
      </>
    );
  } else if (status === 'saving') {
    line = (
      <>
        <CircularProgress size={18} aria-hidden />
        Saving…
      </>
    );
  } else if (status === 'saved') {
    const at = clock(savedAt);
    line = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
        <CheckCircleIcon fontSize="small" aria-hidden />
        {at ? `Saved · ${at}` : 'Saved'}
      </Box>
    );
  } else if (status === 'verifying') {
    line = (
      <>
        <HourglassEmptyIcon fontSize="small" aria-hidden />
        Checking whether it was saved…
      </>
    );
  } else if (status === 'error') {
    line = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
        <ErrorOutlineIcon fontSize="small" aria-hidden />
        We could not save. Your changes are still on this page.
        <Button size="small" onClick={onRetry} sx={BTN}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box
      component="section"
      aria-label="Save status"
      sx={{
        position: 'sticky',
        bottom: 0,
        zIndex: (t) => t.zIndex.appBar - 1,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          maxWidth: 1280,
          mx: 'auto',
          px: { xs: 2, sm: 4 },
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box
          aria-live="polite"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', flex: { xs: '1 1 100%', sm: 1 }, flexWrap: 'wrap' }}
        >
          {line}
        </Box>
        <Button
          onClick={onDiscard}
          disabled={busy || dirtyCount === 0}
          sx={{ ...BTN, flex: { xs: 1, sm: 'none' } }}
        >
          Discard
        </Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={!canSave}
          sx={{ ...BTN, flex: { xs: 2, sm: 'none' } }}
        >
          Save changes
        </Button>
      </Box>
    </Box>
  );
}
