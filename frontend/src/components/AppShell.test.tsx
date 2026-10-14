import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

const at = (p: string) => render(<MemoryRouter initialEntries={[p]}><App /></MemoryRouter>);

describe('AppShell', () => {
  it('shows the Documentation menu with its three pages', async () => {
    at('/');
    expect(screen.getByText('BNamericas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /documentation/i }));
    for (const n of ['General', 'Technical', 'Step-by-step guide'])
      expect(await screen.findByRole('menuitem', { name: n })).toBeInTheDocument();
  });

  it('shows the docs sub-bar only on /docs/*', () => {
    const { unmount } = at('/');
    expect(screen.queryByRole('navigation', { name: 'Documentation' })).toBeNull();
    unmount();
    at('/docs/technical');
    expect(screen.getByRole('navigation', { name: 'Documentation' })).toBeInTheDocument();
  });

  it('routes the unknown path to not found', () => {
    at('/nope');
    expect(screen.getByText('Page not found.')).toBeInTheDocument();
  });
});
