import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

const at = (p: string) => render(<MemoryRouter initialEntries={[p]}><App /></MemoryRouter>);

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
  window.matchMedia = ((q: string) => {
    const max = /max-width:\s*([\d.]+)px/.exec(q);
    return {
      matches: max ? w <= Number(max[1]) : false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as typeof window.matchMedia;
};

describe('AppShell', () => {
  afterEach(() => setWidth(1024));

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

  it('collapses the nav into a menu button at 390 px and drops the desktop links', async () => {
    setWidth(390);
    at('/');
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Projects' })).toBeNull();
    expect(screen.queryByRole('button', { name: /documentation/i })).toBeNull();
    const btn = screen.getByRole('button', { name: /open menu/i });
    await userEvent.click(btn);
    expect(await screen.findByRole('menuitem', { name: 'Projects' })).toHaveAttribute('href', '/');
    for (const n of ['General', 'Technical', 'Step-by-step guide'])
      expect(screen.getByRole('menuitem', { name: n })).toBeInTheDocument();
  });

  it('keeps the full nav and no menu button at 1440 px', () => {
    setWidth(1440);
    at('/');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open menu/i })).toBeNull();
  });

  it.each([320, 390])('scrolls the docs tabs inside their own bar at %i px, each tab at least 44 px high', (w) => {
    setWidth(w);
    at('/docs/guide');
    const bar = screen.getByTestId('docs-tabs');
    const style = getComputedStyle(bar);
    expect(style.overflowX).toBe('auto');
    expect(style.width).toBe('100%');
    const nav = screen.getByRole('navigation', { name: 'Documentation' });
    expect(getComputedStyle(nav).maxWidth).toBe('100vw');
    for (const n of ['General', 'Technical', 'Step-by-step guide']) {
      const tab = within(nav).getByRole('link', { name: n });
      const t = getComputedStyle(tab);
      expect(t.flex).toMatch(/^0 0 auto/);
      expect(t.whiteSpace).toBe('nowrap');
      expect(parseInt(t.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });
});
