import { Box, Typography } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CodeIcon from '@mui/icons-material/Code';
import ChecklistIcon from '@mui/icons-material/Checklist';
import { Link as RouterLink } from 'react-router-dom';

const CARDS: { to: string; title: string; text: string; Icon: SvgIconComponent }[] = [
  { to: '/docs/general', title: 'General', text: 'What the tool does and how to use it, in plain words, for people who are not technical.', Icon: InfoOutlinedIcon },
  { to: '/docs/technical', title: 'Technical documentation', text: 'For junior developers: every function explained, recipes to extend the app and where each file lives.', Icon: CodeIcon },
  { to: '/docs/guide', title: 'Step-by-step guide', text: 'For beginners: from an empty computer to the app running, one command at a time.', Icon: ChecklistIcon },
];

/** Entry page at /docs: one large card per documentation page, each with a one-line description and a link. */
export default function DocsHome() {
  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, md: 3 }, pt: { xs: 3, md: 6 }, pb: 8 }}>
      <Typography component="h1" sx={{ fontSize: { xs: 28, md: 36 }, fontWeight: 700, lineHeight: 1.2, mb: 1 }}>Documentation</Typography>
      <Typography sx={{ fontSize: 18, color: 'text.secondary', mb: { xs: 3, md: 5 }, maxWidth: 720 }}>
        Choose the page that fits you. All three describe the same project editor.
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(3, minmax(0,1fr))' } }}>
        {CARDS.map(({ to, title, text, Icon }) => (
          <Box component="li" key={to} sx={{ display: 'flex' }}>
            <Box
              component={RouterLink}
              to={to}
              sx={{
                display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%', p: 3, minHeight: 44, boxSizing: 'border-box',
                bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '12px',
                color: 'text.primary', textDecoration: 'none', transition: 'border-color .15s, box-shadow .15s',
                '&:hover': { borderColor: 'primary.main', boxShadow: '0 2px 6px rgba(21,101,192,.12)' },
                '&:active': { bgcolor: 'primary.light' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Box sx={{ display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: '12px', bgcolor: 'primary.light', color: 'primary.dark' }}>
                <Icon aria-hidden />
              </Box>
              <Box component="h2" sx={{ m: 0, fontSize: 22, fontWeight: 600, lineHeight: 1.3, color: 'primary.main' }}>{title}</Box>
              <Box component="p" sx={{ m: 0, fontSize: 16, lineHeight: 1.5, color: 'text.secondary', flex: 1 }}>{text}</Box>
              <Box component="span" sx={{ fontSize: 16, fontWeight: 600, color: 'primary.main' }}>Open ›</Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
