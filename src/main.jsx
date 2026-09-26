import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/components.css';
import './styles/app.css';

// Matte grain: one small noise tile, repeated. A full-screen SVG turbulence filter looked the same
// but was re-rasterised on every scroll, which phones felt.
try {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.random() * 255;
  }
  g.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain-image', `url(${c.toDataURL('image/png')})`);
} catch { /* no canvas: no grain */ }

createRoot(document.getElementById('root')).render(<App />);
