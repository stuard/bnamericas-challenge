import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Markdown, extractToc } from '../components/Markdown';
import DocsPage, { matchRanges, splitFaq } from './DocsPage';

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

  it('lists only h2 entries in the sticky, scrollable aside with 44px links', () => {
    wrap(<DocsPage page="guide" sources={{ '../../../docs/guide.md': '# G\n\n## One\n### Sub\n## Two\n' }} />);
    const aside = screen.getByRole('complementary', { name: 'On this page' });
    const links = Array.from(aside.querySelectorAll('a')).map((a) => a.textContent);
    expect(links).toEqual(['One', 'Two']);
    expect(aside).toHaveStyle({ position: 'sticky', overflowY: 'auto' });
    expect(getComputedStyle(aside.querySelector('a') as Element).minHeight).toBe('44px');
  });

  it('has a collapsed jump-to-section menu on guide and technical, not on general', () => {
    const src = { '../../../docs/guide.md': '# G\n\n## One\n## Two\n', '../../../docs/general.md': '# G\n\n## One\n' };
    wrap(<DocsPage page="guide" sources={src} />);
    const menu = screen.getByText('Jump to section').closest('details') as HTMLDetailsElement;
    expect(menu.open).toBe(false);
    expect(menu.querySelectorAll('a')).toHaveLength(2);
    document.body.innerHTML = '';
    wrap(<DocsPage page="general" sources={src} />);
    expect(screen.queryByText('Jump to section')).toBeNull();
  });

  it('renders the FAQ as an accordion without changing the source', () => {
    const md = '# T\n\n## Intro\n\ntext\n\n## Frequently asked questions\n\n### Q1?\n\nA1.\n\n### Q2?\n\nA2.\n\n## After\n';
    wrap(<DocsPage page="general" sources={{ '../../../docs/general.md': md }} />);
    const sums = Array.from(document.querySelectorAll('details > summary')).map((e) => e.textContent);
    expect(sums).toEqual(['Q1?', 'Q2?']);
    expect(screen.getByRole('heading', { level: 2, name: /After/ })).toBeInTheDocument();
    expect(splitFaq('## No faq here')).toBeNull();
  });

  it('filters the page to the sections that match, counts them and shows everything again when cleared', () => {
    const md = '# T\n\nIntro text.\n\n## Install\n\nRun npm.\n\n### Node version\n\nNeeds Node 20.\n\n## Save a project\n\nPress Save.\n\n## Frequently asked questions\n\n### Why npm?\n\nBecause.\n\n### Other?\n\nNo.\n';
    wrap(<DocsPage page="guide" sources={{ '../../../docs/guide.md': md }} />);
    const box = screen.getByRole('searchbox', { name: 'Search this page' });
    const hidden = (t: string) => screen.getByText(t).closest('[data-search-hidden]') !== null;
    fireEvent.change(box, { target: { value: 'NPM' } });
    expect(screen.getByText('2 results')).toBeInTheDocument();
    const results = screen.getByRole('list', { name: 'Search results' });
    expect(Array.from(results.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['#install', '#faq-why-npm']);
    expect(hidden('Press Save.')).toBe(true);
    expect(hidden('Intro text.')).toBe(true);
    expect(hidden('Run npm.')).toBe(false);
    expect((document.getElementById('faq-why-npm') as HTMLDetailsElement).open).toBe(true);
    fireEvent.change(box, { target: { value: 'nothing-like-this' } });
    expect(screen.getByText('No section matches “nothing-like-this”.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and show the whole page' }));
    expect(box).toHaveValue('');
    expect(document.querySelectorAll('[data-search-hidden]')).toHaveLength(0);
    expect(screen.queryByRole('list', { name: 'Search results' })).toBeNull();
  });

  it('matchRanges ignores case and accents', () => {
    expect(matchRanges('Configuración y configuracion', 'CONFIGURACION')).toEqual([[0, 13], [16, 29]]);
    expect(matchRanges('anything', '  ')).toEqual([]);
  });
});
