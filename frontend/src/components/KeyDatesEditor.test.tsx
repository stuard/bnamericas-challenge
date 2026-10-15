import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KeyDatesEditor } from './KeyDatesEditor';
import type { KeyDate } from '../types';

function Harness({ initial, changed = [] }: { initial: KeyDate[]; changed?: string[] }) {
  const [v, setV] = useState(initial);
  return <KeyDatesEditor value={v} onChange={setV} changedLabels={changed} />;
}

describe('KeyDatesEditor', () => {
  it('shows the empty state and adds a blank row', async () => {
    render(<Harness initial={[]} />);
    expect(screen.getByText('No key dates')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add date' }));
    expect(screen.queryByText('No key dates')).toBeNull();
    expect(screen.getAllByTestId('key-date-row')).toHaveLength(1);
  });

  it('removes a row', async () => {
    render(<Harness initial={[{ label: 'Award', date: '2027-01-01' }, { label: 'Close', date: '2027-02-01' }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Award' }));
    expect(screen.getAllByTestId('key-date-row')).toHaveLength(1);
    expect(screen.getByDisplayValue('Close')).toBeInTheDocument();
  });

  it('reports edits through onChange and marks changed labels', async () => {
    const onChange = vi.fn();
    render(<KeyDatesEditor value={[{ label: 'Award', date: '2027-01-01' }]} onChange={onChange} changedLabels={['Award']} />);
    await userEvent.type(screen.getByLabelText('Date label'), 'X');
    expect(onChange).toHaveBeenLastCalledWith([{ label: 'AwardX', date: '2027-01-01' }]);
    expect(screen.getByLabelText('Date label').closest('[data-changed]')).toHaveAttribute('data-changed', 'true');
  });
});
