/// <reference types="vite/client" />
import { Box, Button, GlobalStyles, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { memo, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Markdown, extractToc, slugify } from '../components/Markdown';

type PageKey = 'general' | 'technical' | 'guide';
export type DocSources = Record<string, string>;

const FILES: Record<PageKey, string[]> = {
  general: ['general.md'],
  guide: ['guide.md'],
  technical: ['technical/index.md', 'technical/backend.md', 'technical/frontend.md'],
};
const TITLES: Record<PageKey, string> = { general: 'General', technical: 'Technical documentation', guide: 'Step-by-step guide' };
const ORDER: PageKey[] = ['general', 'technical', 'guide'];
const PATH: Record<PageKey, string> = { general: '/docs/general', technical: '/docs/technical', guide: '/docs/guide' };

const globbed = import.meta.glob('../../../docs/**/*.md', { query: '?raw', import: 'default', eager: true }) as DocSources;

/** Source text of a page: its files in order, missing ones skipped; '' when none exist. */
export function pageSource(page: PageKey, sources: DocSources): string {
  const byName = (name: string) => Object.entries(sources).find(([k]) => k.endsWith(`/docs/${name}`))?.[1];
  return FILES[page].map(byName).filter((s): s is string => typeof s === 'string' && s.trim() !== '').join('\n\n');
}

const FAQ_H2 = /^##\s+frequently asked questions\s*$/im;

/** Splits a source around its FAQ section (before, heading, H3 questions with answers, after); null when there is none. */
export function splitFaq(source: string): { before: string; heading: string; items: { q: string; a: string }[]; after: string } | null {
  const m = FAQ_H2.exec(source);
  if (!m) return null;
  const rest = source.slice(m.index + m[0].length);
  const next = rest.search(/^##\s/m);
  const body = next === -1 ? rest : rest.slice(0, next);
  const after = next === -1 ? '' : rest.slice(next);
  const parts = body.split(/^###\s+/m).slice(1);
  if (parts.length === 0) return null;
  const items = parts.map((p) => { const nl = p.indexOf('\n'); return { q: (nl < 0 ? p : p.slice(0, nl)).trim(), a: nl < 0 ? '' : p.slice(nl + 1).trim() }; });
  return { before: source.slice(0, m.index), heading: m[0], items, after };
}

const foldChar = (c: string) => c.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')[0] ?? c;
const fold = (s: string) => Array.from(s, foldChar).join('');

/** Where `query` appears in `text`, ignoring case and accents: [start, end) pairs, none for a blank query. */
export function matchRanges(text: string, query: string): [number, number][] {
  const q = fold(query.trim());
  if (q === '') return [];
  const t = Array.from(text).length === text.length ? fold(text) : text.toLowerCase();
  const out: [number, number][] = [];
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + q.length)) out.push([i, i + q.length]);
  return out;
}

type Hit = { id: string; title: string; parent: string | null };
type Unit = { head: HTMLElement; level: 2 | 3; title: string; els: HTMLElement[]; parent: Unit | null };
const HIDDEN = 'data-search-hidden';
const titleOf = (el: HTMLElement) => (el.tagName === 'DETAILS' ? el.querySelector('summary')?.textContent ?? '' : (el.textContent ?? '').replace(/#$/, '')).trim();
const textOf = (el: HTMLElement) => (el.tagName === 'DETAILS' ? Array.from(el.children).filter((c) => c.tagName !== 'SUMMARY').map((c) => c.textContent).join(' ') : el.textContent ?? '');

/** Hides the sections of `root` that do not match `query`, paints the matches, and lists the sections that matched. */
function applySearch(root: HTMLElement, query: string): Hit[] | null {
  const blocks = Array.from(root.children).flatMap((c) => Array.from(c.children)) as HTMLElement[];
  const units: Unit[] = [];
  const intro: HTMLElement[] = [];
  let h2: Unit | null = null;
  let cur: Unit | null = null;
  for (const el of blocks) {
    if (el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'DETAILS') {
      const level = el.tagName === 'H2' ? 2 : 3;
      cur = { head: el, level, title: titleOf(el), els: [], parent: level === 3 ? h2 : null };
      if (level === 2) h2 = cur;
      units.push(cur);
    } else if (cur) cur.els.push(el); else intro.push(el);
  }
  const searching = query.trim() !== '';
  const hits: Hit[] = [];
  const shown = new Set<HTMLElement>();
  const titleHit = new Set<Unit>();
  for (const u of units) {
    const inTitle = matchRanges(u.title, query).length > 0;
    const inBody = !inTitle && u.els.some((e) => matchRanges(textOf(e), query).length > 0) || (u.head.tagName === 'DETAILS' && matchRanges(textOf(u.head), query).length > 0);
    const byParent = u.parent !== null && titleHit.has(u.parent);
    if (inTitle) titleHit.add(u);
    if (!searching || inTitle || inBody || byParent) {
      [u.head, ...u.els].forEach((e) => shown.add(e));
      if (u.parent) shown.add(u.parent.head);
      if (searching && (inTitle || inBody)) hits.push({ id: u.head.id, title: u.title, parent: u.parent?.title ?? null });
      if (searching && (inTitle || inBody) && u.head instanceof HTMLDetailsElement) u.head.open = true;
    }
  }
  intro.forEach((e) => searching || shown.add(e));
  blocks.forEach((e) => e.toggleAttribute(HIDDEN, !shown.has(e)));
  paint(root, searching ? query : '');
  return searching ? hits : null;
}

/** Marks every visible match with the CSS Custom Highlight API; browsers without it simply show no colour. */
function paint(root: HTMLElement, query: string) {
  const reg = (globalThis.CSS as { highlights?: Map<string, unknown> } | undefined)?.highlights;
  const H = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!reg || !H) return;
  reg.delete('docs-search');
  if (query.trim() === '') return;
  const ranges: Range[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest(`[${HIDDEN}], a.anchor`)) continue;
    for (const [a, b] of matchRanges(n.textContent ?? '', query)) {
      const r = document.createRange();
      r.setStart(n, a); r.setEnd(n, b);
      ranges.push(r);
    }
  }
  reg.set('docs-search', new H(...ranges));
}

function Marked({ text, query }: { text: string; query: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  matchRanges(text, query).forEach(([a, b]) => { parts.push(text.slice(at, a), <mark key={a}>{text.slice(a, b)}</mark>); at = b; });
  parts.push(text.slice(at));
  return <>{parts}</>;
}

const FIRST_HITS = 8;

function PageSearch({ query, onQuery, hits }: { query: string; onQuery: (q: string) => void; hits: Hit[] | null }) {
  const [all, setAll] = useState(false);
  const go = (e: React.MouseEvent, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  };
  const list = hits && (all ? hits : hits.slice(0, FIRST_HITS));
  return (
    <Box role="search" sx={{ mb: 3 }}>
      <TextField
        type="search" fullWidth placeholder="Search this page" value={query}
        onChange={(e) => { onQuery(e.target.value); setAll(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') onQuery(''); }}
        slotProps={{
          htmlInput: { 'aria-label': 'Search this page', 'aria-describedby': 'docs-search-count' },
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: 'text.secondary' }} /></InputAdornment>,
            endAdornment: query && <InputAdornment position="end"><IconButton aria-label="Clear search" onClick={() => onQuery('')} edge="end" sx={{ width: 44, height: 44 }}><CloseIcon /></IconButton></InputAdornment>,
          },
        }}
        sx={{ bgcolor: 'background.paper', '& .MuiInputBase-root': { minHeight: 48, fontSize: 16 }, '& input::-webkit-search-cancel-button': { display: 'none' } }}
      />
      <Box id="docs-search-count" aria-live="polite" sx={{ mt: hits ? 1.5 : 0, fontSize: 15, color: 'text.secondary' }}>
        {hits && (hits.length ? `${hits.length} ${hits.length === 1 ? 'result' : 'results'}` : `No section matches “${query.trim()}”.`)}
      </Box>
      {hits && hits.length === 0 && (
        <Button variant="outlined" onClick={() => onQuery('')} sx={{ mt: 1.5, minHeight: 44, textTransform: 'none', fontWeight: 600 }}>Clear search and show the whole page</Button>
      )}
      {list && list.length > 0 && (
        <Box component="ul" aria-label="Search results" sx={{ listStyle: 'none', p: 0, m: '8px 0 0', border: '1px solid', borderColor: 'divider', borderRadius: '12px', bgcolor: 'background.paper', overflow: 'hidden', '& mark': { bgcolor: '#FFE58A', color: 'inherit', borderRadius: '2px' } }}>
          {list.map((h, n) => (
            <Box component="li" key={h.id || n} sx={{ borderTop: n ? '1px solid' : 0, borderColor: 'divider' }}>
              <Box component="a" href={`#${h.id}`} onClick={(e: React.MouseEvent) => go(e, h.id)} sx={{ display: 'block', minHeight: 44, px: 2, py: 1.25, color: 'text.primary', textDecoration: 'none', lineHeight: 1.4, overflowWrap: 'anywhere', '&:hover': { bgcolor: 'primary.light' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}>
                <Box component="span" sx={{ display: 'block', fontWeight: 600, color: 'primary.main' }}><Marked text={h.title} query={query} /></Box>
                {h.parent && <Box component="span" sx={{ display: 'block', fontSize: 14, color: 'text.secondary' }}>in {h.parent}</Box>}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {hits && hits.length > FIRST_HITS && !all && (
        <Button onClick={() => setAll(true)} sx={{ mt: 1, minHeight: 44, textTransform: 'none', fontWeight: 600 }}>Show all {hits.length} results</Button>
      )}
    </Box>
  );
}

const Body = memo(function Body({ source }: { source: string }): ReactNode {
  const faq = splitFaq(source);
  if (!faq) return <Markdown source={source} />;
  return (
    <>
      <Markdown source={faq.before} />
      <Markdown source={faq.heading} />
      <Box sx={{ mb: 2 }}>
        {faq.items.map((it) => (
          <Box key={it.q} id={`faq-${slugify(it.q)}`} component="details" sx={{ borderBottom: '1px solid', borderColor: 'divider', '& > summary': { display: 'flex', alignItems: 'center', minHeight: 44, py: 1, cursor: 'pointer', fontWeight: 600, fontSize: 17 }, '&[open] > summary': { color: 'primary.main' } }}>
            <summary>{it.q}</summary>
            <Box sx={{ pb: 1 }}><Markdown source={it.a} /></Box>
          </Box>
        ))}
      </Box>
      {faq.after && <Markdown source={faq.after} />}
    </>
  );
});

const jumpLink = { display: 'flex', alignItems: 'center', minHeight: 44, px: 2, color: 'text.primary', textDecoration: 'none', borderTop: '1px solid', borderColor: 'divider' } as const;

export default function DocsPage({ page, sources = globbed }: { page: PageKey; sources?: DocSources }) {
  const source = pageSource(page, sources);
  const toc = extractToc(source);
  const h2s = toc.filter((t) => t.level === 2);
  const jump = page !== 'general' && h2s.length > 0;
  const i = ORDER.indexOf(page);
  const prev = i > 0 ? ORDER[i - 1] : null;
  const next = i < ORDER.length - 1 ? ORDER[i + 1] : null;
  const content = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  useLayoutEffect(() => { if (content.current) setHits(applySearch(content.current, query)); }, [query, source]);
  useLayoutEffect(() => setQuery(''), [page]);
  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, md: 3 }, display: 'grid', gap: 6, justifyContent: 'center',
      gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,720px) 200px' } }}>
      <Box component="article" sx={{ pt: { xs: 2, md: 4 }, pb: 8, minWidth: 0 }}>
        <Typography sx={{ fontSize: { xs: 16, md: 14 }, color: 'text.secondary', mb: 1 }}><Box component={RouterLink} to="/docs" sx={{ color: 'inherit', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Documentation</Box> › {TITLES[page]}</Typography>
        {source === '' ? (
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>This page is not written yet</Typography>
        ) : (
          <>
            <GlobalStyles styles={{ '::highlight(docs-search)': { backgroundColor: '#FFE58A', color: '#1F2937' } }} />
            <PageSearch query={query} onQuery={setQuery} hits={hits} />
            {jump && !hits && (
              <Box component="details" sx={{ display: { xs: 'block', sm: 'none' }, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: '12px', bgcolor: 'background.paper', overflow: 'hidden' }}>
                <Box component="summary" sx={{ display: 'flex', alignItems: 'center', minHeight: 44, px: 2, cursor: 'pointer', fontWeight: 600 }}>Jump to section</Box>
                {h2s.map((t) => <Box key={t.id} component="a" href={`#${t.id}`} sx={jumpLink}>{t.text}</Box>)}
              </Box>
            )}
            <Box ref={content} sx={{ [`& [${HIDDEN}]`]: { display: 'none !important' } }}><Body source={source} /></Box>
          </>
        )}
        <Box component="nav" aria-label="Pages" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 8, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
          {[prev, next].map((k, n) => k ? (
            <Box key={k} component={RouterLink} to={PATH[k]} sx={{ display: 'block', p: 2, minHeight: 44, border: '1px solid', borderColor: 'divider', borderRadius: '12px', bgcolor: 'background.paper', textDecoration: 'none', textAlign: n ? 'right' : 'left', gridColumn: { sm: n ? 2 : 1 } }}>
              <Box component="small" sx={{ display: 'block', fontSize: 13.5, color: 'text.secondary' }}>{n ? 'Next' : 'Previous'}</Box>
              <Box component="strong" sx={{ color: 'primary.main', fontWeight: 600 }}>{n ? `${TITLES[k]} ›` : `‹ ${TITLES[k]}`}</Box>
            </Box>
          ) : null)}
        </Box>
      </Box>
      {toc.length > 0 && (
        <Box component="aside" aria-label="On this page" sx={{ display: { xs: 'none', lg: 'block' }, py: 4, position: 'sticky', top: 0, alignSelf: 'start', fontSize: 14, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto' }}>
          <Box sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>On this page</Box>
          {h2s.map((t) => (
            <Box key={t.id} component="a" href={`#${t.id}`} sx={{ display: 'flex', alignItems: 'center', minHeight: 44, py: 0.75, pl: 1.5, borderLeft: '2px solid', borderColor: 'divider', color: 'text.secondary', textDecoration: 'none', lineHeight: 1.4, '&:hover': { color: 'primary.main', borderColor: 'primary.main' } }}>{t.text}</Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
