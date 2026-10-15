import { Children, isValidElement, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export interface TocItem { level: 2 | 3; text: string; id: string; line: number }

/** Lowercase, letters and digits kept, everything else becomes one dash. */
export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}

const plain = (s: string) => s
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, '').replace(/\s+#+\s*$/, '').trim();

/** h2/h3 of a Markdown source (fenced code skipped), each with a unique id and its 1-based line. */
export function extractToc(markdown: string): TocItem[] {
  const out: TocItem[] = [];
  const seen = new Map<string, number>();
  let fence: string | null = null;
  markdown.split(/\r?\n/).forEach((raw, i) => {
    const f = raw.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    const m = raw.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) return;
    const text = plain(m[2]);
    const base = slugify(text);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ level: m[1].length as 2 | 3, text, id: n === 1 ? base : `${base}-${n}`, line: i + 1 });
  });
  return out;
}

const textOf = (n: ReactNode): string => {
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (isValidElement(n)) return textOf((n.props as { children?: ReactNode }).children);
  return '';
};

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the text stays selectable */ }
  };
  return (
    <Box sx={{ bgcolor: '#111827', color: '#E5E7EB', borderRadius: '12px', mb: 2, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, pl: 2, pr: 0.5, minHeight: 52, borderBottom: '1px solid #263142' }}>
        <Box component="span" sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13.5, color: '#9CA3AF' }}>{lang}</Box>
        <Button onClick={copy} variant="outlined" aria-live="polite"
          sx={{ color: copied ? '#86EFAC' : '#E5E7EB', borderColor: copied ? '#86EFAC' : '#4B5563', minHeight: 44, minWidth: 96, textTransform: 'none', my: 0.5, '&:hover': { bgcolor: '#1F2937', borderColor: '#9CA3AF' } }}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Box>
      <Box component="pre" sx={{ m: 0, p: 2, font: '400 14px/1.65 ui-monospace, Menlo, monospace', overflowX: 'auto', whiteSpace: 'pre', '@media (max-width:899px)': { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }}>
        <code>{code}</code>
      </Box>
    </Box>
  );
}

const CALLOUTS: Record<string, { bg: string; ink: string; dot: string; icon: string }> = {
  note: { bg: '#E8F1FB', ink: '#0B4A8F', dot: '#0B4A8F', icon: 'i' },
  tip: { bg: '#E8F5EC', ink: '#1B5E20', dot: '#1B5E20', icon: '✓' },
  warning: { bg: '#FFF4E0', ink: '#7A4A00', dot: '#9A5B00', icon: '!' },
  danger: { bg: '#FDECEC', ink: '#8E1C1C', dot: '#8E1C1C', icon: '×' },
};

/** Callout kind from the first bold word of a quote (`> **Note** ...`); null for a plain quote. */
export function calloutKind(firstBold: string | null): string | null {
  const k = (firstBold ?? '').trim().toLowerCase();
  return k in CALLOUTS ? k : null;
}

type HNode = { type?: string; tagName?: string; value?: string; children?: HNode[] };
const hText = (n: HNode): string => (n.value ?? '') + (n.children ?? []).map(hText).join('');

function firstBold(node?: HNode): string | null {
  const p = node?.children?.find((c) => c.type === 'element');
  const first = p?.children?.[0];
  return p?.tagName === 'p' && first?.tagName === 'strong' ? hText(first) : null;
}

const mono = 'ui-monospace, Menlo, monospace';
const linkSx = { color: 'primary.main', textUnderlineOffset: '3px', display: 'inline-block', py: '12px', my: '-12px', overflowWrap: 'anywhere' } as const;

function buildComponents(lineToId: Map<number, string>): Components {
  const heading = (tag: 'h1' | 'h2' | 'h3' | 'h4') =>
    function Heading({ node, children }: { node?: { position?: { start: { line: number } } }; children?: ReactNode }) {
      const id = lineToId.get(node?.position?.start.line ?? -1) ?? slugify(textOf(children));
      const size = { h1: 39, h2: 24, h3: 20, h4: 17 }[tag];
      return (
        <Box component={tag} id={id} sx={{
          fontSize: { xs: tag === 'h1' ? 31 : size, md: size }, lineHeight: 1.25, fontWeight: tag === 'h3' || tag === 'h4' ? 600 : 700,
          letterSpacing: tag === 'h1' ? '-.02em' : tag === 'h2' ? '-.01em' : 0,
          m: tag === 'h1' ? '0 0 16px' : tag === 'h2' ? '64px 0 16px' : '32px 0 8px', scrollMarginTop: 16,
          overflowWrap: 'anywhere',
          '& a.anchor': { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, verticalAlign: 'middle', ml: 0.5, opacity: 0, color: 'text.secondary', textDecoration: 'none', fontWeight: 400 },
          '&:hover a.anchor, & a.anchor:focus': { opacity: 1 },
        }}>
          {children}
          {tag !== 'h1' && <a className="anchor" href={`#${id}`} aria-label="Link to this section">#</a>}
        </Box>
      );
    };

  return {
    h1: heading('h1'), h2: heading('h2'), h3: heading('h3'), h4: heading('h4'),
    p: ({ children }) => <Box component="p" sx={{ m: '0 0 16px', overflowWrap: 'anywhere' }}>{children}</Box>,
    a: ({ href = '', title, children }) => {
      const internal = href.startsWith('/') && !href.startsWith('//');
      if (title === 'button') {
        return <Button variant="contained" component={internal ? RouterLink : 'a'} {...(internal ? { to: href } : { href })} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>{children}</Button>;
      }
      return internal
        ? <Box component={RouterLink} to={href} sx={linkSx}>{children}</Box>
        : <Box component="a" href={href} sx={linkSx}>{children}</Box>;
    },
    ul: ({ children }) => <Box component="ul" sx={{ m: '0 0 16px', pl: 3, '& li': { mb: 1 } }}>{children}</Box>,
    ol: ({ children }) => (
      <Box component="ol" sx={{
        listStyle: 'none', p: 0, m: '0 0 16px', counterReset: 's',
        '& > li': { counterIncrement: 's', position: 'relative', pl: 7, minHeight: 40, mb: 3,
          '&::before': { content: 'counter(s)', position: 'absolute', left: 0, top: 0, width: 40, height: 40, borderRadius: '999px', bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700, display: 'grid', placeItems: 'center' },
          '& > p': { m: 0 }, '& > strong:first-of-type, & > p > strong:first-of-type': { fontSize: 17 } },
      }}>{children}</Box>
    ),
    code: ({ children, className }) => (
      <Box component="code" className={className} sx={{ fontFamily: mono, fontSize: 14, bgcolor: '#EEF1F5', px: 0.75, py: 0.25, borderRadius: '6px', overflowWrap: 'anywhere' }}>{children}</Box>
    ),
    pre: ({ children }) => {
      const el = Children.toArray(children)[0];
      const props = (isValidElement(el) ? el.props : {}) as { className?: string; children?: ReactNode };
      const lang = /language-(\S+)/.exec(props.className ?? '')?.[1] ?? 'text';
      return <CodeBlock code={textOf(props.children).replace(/\n$/, '')} lang={lang} />;
    },
    blockquote: ({ node, children }) => {
      const kind = calloutKind(firstBold(node as HNode));
      if (!kind) {
        return <Box component="blockquote" sx={{ m: '0 0 16px', pl: 2, borderLeft: '4px solid', borderColor: 'divider', color: 'text.secondary' }}>{children}</Box>;
      }
      const c = CALLOUTS[kind];
      return (
        <Box role="note" data-callout={kind} sx={{
          bgcolor: c.bg, color: c.ink, borderRadius: '12px', p: 2, m: '0 0 16px', display: 'grid', gridTemplateColumns: '24px minmax(0,1fr)', columnGap: 1.5,
          '& > div > p:first-of-type > strong:first-of-type': { display: 'block', mb: 0.25 },
          '& > div > :last-child': { mb: 0 }, '& code': { bgcolor: 'rgba(255,255,255,.7)' },
        }}>
          <Box aria-hidden sx={{ width: 24, height: 24, borderRadius: '999px', bgcolor: c.dot, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>{c.icon}</Box>
          <div>{children}</div>
        </Box>
      );
    },
    table: ({ children }) => (
      <Box sx={{ overflowX: 'auto', maxWidth: '100%', mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: '12px', bgcolor: 'background.paper' }}>
        <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: { xs: 16, md: 15 } }}>{children}</Box>
      </Box>
    ),
    th: ({ children }) => <Box component="th" sx={{ textAlign: 'left', p: '12px 16px', fontSize: 13.5, fontWeight: 600, color: 'text.secondary', bgcolor: '#FAFBFC', borderBottom: '1px solid', borderColor: 'divider' }}>{children}</Box>,
    td: ({ children }) => <Box component="td" sx={{ p: '12px 16px', verticalAlign: 'top', minWidth: 120, fontSize: { xs: 16, md: 15 }, borderBottom: '1px solid', borderColor: 'divider' }}>{children}</Box>,
    hr: () => <Box component="hr" sx={{ border: 0, borderTop: '1px solid', borderColor: 'divider', my: 4 }} />,
  };
}

/** Renders GitHub-flavoured Markdown with MUI styling. */
export function Markdown({ source }: { source: string }) {
  const lineToId = new Map(extractToc(source).map((t) => [t.line, t.id]));
  return (
    <Box sx={{ fontSize: 16, lineHeight: 1.6, minWidth: 0, '& > h1 + p': { fontSize: { xs: 17, md: 20 }, lineHeight: 1.5, color: 'text.secondary', mb: 4 } }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(lineToId)}>{source}</ReactMarkdown>
    </Box>
  );
}

export default Markdown;
