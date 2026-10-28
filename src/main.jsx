import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { labelTables } from './lib/mobile.js';
// Fonts ship with the app (no third-party font host): Cyrillic and Latin subsets of the weights in use.
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-serif-4/opsz-italic.css';
import '@fontsource/cormorant-garamond/cyrillic-500.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/cyrillic-500-italic.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/cormorant-garamond/cyrillic-600.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cinzel/latin-500.css';
import '@fontsource/jetbrains-mono/cyrillic-500.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './styles/tokens.css';
import './styles/components.css';
import './styles/app.css';
import './styles/v0-bridge.css';

// Interface language (Налаштування → Мова інтерфейсу). English swaps the texts as they appear (src/i18n/dom.js).
let lang = 'uk';
try { lang = JSON.parse(localStorage.getItem('reaction-core/v3') || '{}')?.settings?.lang || 'uk'; } catch { /* private mode */ }
document.documentElement.lang = lang;
// The sign-in screens (data-lang="en") are in English in either language.
const ready = Promise.all([import('./i18n/dom.js'), import('./i18n/en.js')])
  .then(([{ createTranslator, startTranslator }, dict]) => { startTranslator(createTranslator(dict), document.body, { scope: lang === 'en' ? null : '[data-lang="en"]' }); })
  .catch(() => {});

ready.then(() => createRoot(document.getElementById('root')).render(<App />));
labelTables(); // table cells know their column, for the card layout on phones
