import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SaveBar, type SaveStatus } from './SaveBar';

const setup = (status: SaveStatus, dirtyCount = 2, savedAt?: Date) => {
  const fns = { onSave: vi.fn(), onDiscard: vi.fn(), onRetry: vi.fn() };
  render(<SaveBar dirtyCount={dirtyCount} status={status} savedAt={savedAt} {...fns} />);
  return fns;
};
const save = () => screen.getByRole('button', { name: 'Save changes' });
const discard = () => screen.getByRole('button', { name: 'Discard' });

describe('SaveBar', () => {
  it('clean: no message, both buttons disabled', () => {
    setup('clean', 0);
    expect(save()).toBeDisabled();
    expect(discard()).toBeDisabled();
  });
  it('dirty: counts changes, buttons enabled', () => {
    setup('dirty', 3);
    expect(screen.getByText('3 unsaved changes')).toBeInTheDocument();
    expect(save()).toBeEnabled();
    expect(discard()).toBeEnabled();
  });
  it('dirty: singular', () => {
    setup('dirty', 1);
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
  });
  it('saving: spinner text, save disabled', () => {
    setup('saving');
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(discard()).toBeDisabled();
  });
  it('saved: shows the time', () => {
    setup('saved', 0, new Date(2026, 9, 14, 22, 41));
    expect(screen.getByText('Saved · 22:41')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });
  it('verifying: amber notice, buttons disabled', () => {
    setup('verifying');
    expect(screen.getByText('Checking whether it was saved…')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/took too long/)).toBeNull();
    expect(save()).toBeDisabled();
    expect(discard()).toBeDisabled();
  });
  it('error: message with Retry', () => {
    setup('error');
    expect(screen.getByText(/We could not save\. Your changes are still on this page\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });
  it('buttons are sentence case, never wrap, and are at least 44px tall', () => {
    setup('dirty');
    for (const b of [save(), discard()]) {
      const st = getComputedStyle(b);
      expect(st.textTransform).toBe('none');
      expect(st.fontWeight).toBe('600');
      expect(st.whiteSpace).toBe('nowrap');
      expect(st.minHeight).toBe('44px');
    }
  });
  it('verifying uses the hourglass icon', () => {
    setup('verifying');
    expect(document.querySelector('[data-testid="HourglassEmptyIcon"]')).not.toBeNull();
  });
  it('fires onSave, onDiscard and onRetry', async () => {
    const a = setup('dirty');
    await userEvent.click(save());
    await userEvent.click(discard());
    expect(a.onSave).toHaveBeenCalledTimes(1);
    expect(a.onDiscard).toHaveBeenCalledTimes(1);
  });
  it('retry fires onRetry', async () => {
    const a = setup('error');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(a.onRetry).toHaveBeenCalledTimes(1);
  });
});
