import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ConflictDialog, formatValue } from './ConflictDialog';
import type { Conflict } from '../types';

const conflicts: Conflict[] = [
  { key: 'stage', field: 'stage', base: 'tender', mine: 'financing', theirs: 'construction' },
  { key: 'key_date:cierre financiero', field: 'key_dates', label: 'Cierre financiero', base: '2026-10-01', mine: '2026-12-15', theirs: '2027-01-30' },
];

const setup = (autoMerged: string[] = []) => {
  const onResolve = vi.fn();
  const onBack = vi.fn();
  render(<ConflictDialog open conflicts={conflicts} autoMerged={autoMerged} onResolve={onResolve} onBack={onBack} />);
  return { onResolve, onBack };
};
const primary = () => screen.getByRole('button', { name: 'Save my selection' });
const group = (name: string) => screen.getByRole('radiogroup', { name });

describe('ConflictDialog', () => {
  it('starts with nothing selected and the primary disabled', () => {
    setup();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    screen.getAllByRole('radio').forEach((r) => expect(r).not.toBeChecked());
    expect(primary()).toBeDisabled();
    expect(screen.getByText(/Choose 2 more fields: Stage, Key date · Cierre financiero/)).toBeInTheDocument();
  });
  it('titles rows and labels the sides', () => {
    setup();
    expect(screen.getByText('Key date · Cierre financiero')).toBeInTheDocument();
    expect(screen.getAllByText('Your value')).toHaveLength(2);
    expect(screen.getAllByText('Current value · saved by someone else')).toHaveLength(2);
  });
  it('enables only when every row is chosen and resolves with exactly the keys', async () => {
    const { onResolve } = setup();
    await userEvent.click(within(group('Stage')).getAllByRole('radio')[0]);
    expect(primary()).toBeDisabled();
    expect(screen.getByText(/Choose 1 more field: Key date · Cierre financiero/)).toBeInTheDocument();
    await userEvent.click(within(group('Key date · Cierre financiero')).getAllByRole('radio')[1]);
    expect(primary()).toBeEnabled();
    await userEvent.click(primary());
    expect(onResolve).toHaveBeenCalledWith({ stage: 'mine', 'key_date:cierre financiero': 'theirs' });
  });
  it('bulk shortcuts choose every row', async () => {
    const { onResolve } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Current values' }));
    expect(primary()).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'My values' }));
    await userEvent.click(primary());
    expect(onResolve).toHaveBeenCalledWith({ stage: 'mine', 'key_date:cierre financiero': 'mine' });
  });
  it('Back to the form fires onBack', async () => {
    const { onBack, onResolve } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Back to the form' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onResolve).not.toHaveBeenCalled();
  });
  it('shows the merged line only when there is something merged', () => {
    const { unmount } = render(<ConflictDialog open conflicts={conflicts} autoMerged={[]} onResolve={() => {}} onBack={() => {}} />);
    expect(screen.queryByText(/Merged without conflict/)).toBeNull();
    unmount();
    setup(['name', 'country']);
    expect(screen.getByText(/Merged without conflict/).parentElement).toHaveTextContent('name · country');
  });
  it('formats dates for people and keeps other text', () => {
    setup();
    expect(screen.getByText('15 Dec 2026')).toBeInTheDocument();
    expect(screen.getByText('30 Jan 2027')).toBeInTheDocument();
    expect(formatValue('oil_and_gas')).toBe('Oil and gas');
    expect(formatValue(null)).toBe('(none)');
    expect(formatValue('2026-13-45')).toBe('2026-13-45');
  });
});
