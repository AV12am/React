// CONTEXT News on its own page (news.html, /news): open to anyone with the link, no sign-in, and nothing of
// the platform is loaded — only the issue, its pictures and the PDF / Word of it.
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/cormorant-garamond/cyrillic-500.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import './styles/tokens.css';
import './styles/components.css';
import './styles/app.css';
import './styles/refresh.css';
import { NewsPage } from './news/NewsPage.jsx';

document.body.classList.add('vx-root');
createRoot(document.getElementById('root')).render(<NewsPage />);
