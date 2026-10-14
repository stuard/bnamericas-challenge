import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Markdown, extractToc } from '../components/Markdown';
import DocsPage from './DocsPage';

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('extractToc', () => {
  it('lists h2 and h3 only, with unique ids, skipping fenced code', () => {
    const md = '# Title\n\n## One\n### Sub `x`\n```bash\n## not a heading\n```\n## One\n#### deep\n';
    expect(extractToc(md).map((t) => [t.level, t.text, t.id])).toEqual([
      [2, 'One', 'one'], [3, 'Sub x', 'sub-x'], [2, 'One', 'one-2'],
    ]);
  });
  it('is empty without headings', () => expect(extractToc('just text')).toEqual([]));
});

describe('Markdown', () => {
  it('gives headings the ids extractToc promises, with an anchor link', () => {
    wrap(<Markdown source={'## Hello world\n\n## Hello world\n'} />);
    const hs = screen.getAllByRole('heading', { level: 2 });
    expect(hs.map((h) => h.id)).toEqual(['hello-world', 'hello-world-2']);
    expect(hs[0].querySelector('a.anchor')).toHaveAttribute('href', '#hello-world');
  });

  it('copies a code block with the Copy button and shows Copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    wrap(<Markdown source={'```bash\nnpm run dev\n```'} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith('npm run dev');
  });

  it('turns > **Note** and > **Warning** quotes into callouts, not plain quotes', () => {
    wrap(<Markdown source={'> **Note**\n> Be kind.\n\n> **Warning**\n> Hot.\n\n> just a quote\n'} />);
    const notes = screen.getAllByRole('note');
    expect(notes.map((n) => n.getAttribute('data-callout'))).toEqual(['note', 'warning']);
    expect(notes[0]).toHaveTextContent('Be kind.');
    expect(document.querySelectorAll('blockquote')).toHaveLength(1);
  });

  it('renders GitHub tables inside a horizontally scrollable box', () => {
    wrap(<Markdown source={'| a | b |\n|---|---|\n| 1 | 2 |\n'} />);
    const table = screen.getByRole('table');
    expect(getComputedStyle(table.parentElement as HTMLElement).overflowX).toBe('auto');
  });
});

describe('DocsPage', () => {
  it('shows the not-written message instead of crashing when the file is missing', () => {
    wrap(<DocsPage page="guide" sources={{}} />);
    expect(screen.getByText('This page is not written yet')).toBeInTheDocument();
  });

  it('technical page concatenates index, backend, frontend in that order and skips missing files', () => {
    const sources = {
      '../../../docs/technical/frontend.md': '## Frontend part\n',
      '../../../docs/technical/index.md': '# Technical\n\n## Index part\n',
      '../../../docs/technical/backend.md': '## Backend part\n',
    };
    wrap(<DocsPage page="technical" sources={sources} />);
    const order = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace('#', ''));
    expect(order).toEqual(['Index part', 'Backend part', 'Frontend part']);
    expect(screen.getByRole('complementary', { name: 'On this page' })).toHaveTextContent('Backend part');
    document.body.innerHTML = '';
    wrap(<DocsPage page="technical" sources={{ '../../../docs/technical/backend.md': '## Only backend\n' }} />);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });

  it('renders the real general page from docs/general.md', () => {
    wrap(<DocsPage page="general" />);
    expect(screen.getByRole('heading', { level: 1, name: 'How the project editor works' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Checking whether it was saved/ })).toBeInTheDocument();
  });
});
