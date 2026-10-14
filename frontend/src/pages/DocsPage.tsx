/// <reference types="vite/client" />
import { Box, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Markdown, extractToc } from '../components/Markdown';

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

export default function DocsPage({ page, sources = globbed }: { page: PageKey; sources?: DocSources }) {
  const source = pageSource(page, sources);
  const toc = extractToc(source);
  const i = ORDER.indexOf(page);
  const prev = i > 0 ? ORDER[i - 1] : null;
  const next = i < ORDER.length - 1 ? ORDER[i + 1] : null;
  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, md: 3 }, display: 'grid', gap: 6, justifyContent: 'center',
      gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,720px) 200px' } }}>
      <Box component="article" sx={{ pt: { xs: 2, md: 4 }, pb: 8, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 1 }}>Documentation › {TITLES[page]}</Typography>
        {source === '' ? (
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>This page is not written yet</Typography>
        ) : (
          <Markdown source={source} />
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
        <Box component="aside" aria-label="On this page" sx={{ display: { xs: 'none', lg: 'block' }, py: 4, position: 'sticky', top: 0, alignSelf: 'start', fontSize: 14 }}>
          <Box sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>On this page</Box>
          {toc.map((t) => (
            <Box key={t.id} component="a" href={`#${t.id}`} sx={{ display: 'block', py: 0.75, pl: t.level === 3 ? 3 : 1.5, borderLeft: '2px solid', borderColor: 'divider', color: 'text.secondary', textDecoration: 'none', lineHeight: 1.4, '&:hover': { color: 'primary.main', borderColor: 'primary.main' } }}>{t.text}</Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
