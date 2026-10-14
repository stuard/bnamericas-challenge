import { Box, Button, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

export type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'verifying' | 'error';

export interface SaveBarProps {
  dirtyCount: number;
  status: SaveStatus;
  savedAt?: Date;
  onSave: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}

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
        <CircularProgress size={18} aria-hidden />
        Checking whether it was saved…
      </>
    );
  } else if (status === 'error') {
    line = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
        <ErrorOutlineIcon fontSize="small" aria-hidden />
        Could not save ·
        <Button size="small" onClick={onRetry} sx={{ minHeight: 44, fontWeight: 600 }}>
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
      {status === 'verifying' && (
        <Box
          role="status"
          sx={{ bgcolor: '#FFF4E0', color: '#5C3B00', px: { xs: 2, sm: 4 }, py: 1.5, fontSize: 14 }}
        >
          <strong>The server took too long to answer.</strong> We are checking whether your changes were saved before
          trying again. Do not close this page.
        </Box>
      )}
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
          sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', flex: { xs: '1 1 100%', sm: 1 } }}
        >
          {line}
        </Box>
        <Button
          onClick={onDiscard}
          disabled={busy || dirtyCount === 0}
          sx={{ minHeight: 44, flex: { xs: 1, sm: 'none' } }}
        >
          Discard changes
        </Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={!canSave}
          sx={{ minHeight: 44, flex: { xs: 2, sm: 'none' } }}
        >
          Save changes
        </Button>
      </Box>
    </Box>
  );
}
