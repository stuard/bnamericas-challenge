import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

describe('DocsHome', () => {
  it('shows three cards at /docs, each linking to its page with a one-line description', () => {
    render(<MemoryRouter initialEntries={['/docs']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Documentation' })).toBeInTheDocument();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    const want = [['General', '/docs/general'], ['Technical documentation', '/docs/technical'], ['Step-by-step guide', '/docs/guide']];
    want.forEach(([title, to], i) => {
      expect(within(cards[i]).getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
      expect(within(cards[i]).getByRole('link')).toHaveAttribute('href', to);
      expect(within(cards[i]).getByRole('paragraph')).toBeInTheDocument();
    });
    expect(screen.queryByRole('navigation', { name: 'Documentation' })).toBeNull();
  });
});
