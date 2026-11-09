// The picture of a news item that has none (public/news-img/plain.jpg): a white pen nib on a flat dark ground —
// no frame, no lines, no gradient (a gradient in a JPEG shows as rings). Run: node scripts/plain-image.mjs
import sharp from 'sharp';

const W = 1280; const H = 840; // twice the shown size: sharp on any screen
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#141414"/>
  <g transform="translate(${W / 2} ${H / 2}) rotate(-35) scale(2) translate(0 -8)" fill="#ededed">
    <rect x="-22" y="-74" width="44" height="22" rx="2"/>
    <path fill-rule="evenodd" d="M-22 -46 H22 L30 -6 L3 66 L1 76 L-1 76 L-3 66 L-30 -6 Z
      M0 -14 L8 2 L1 52 L-1 52 L-8 2 Z"/>
  </g>
</svg>`;
await sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' }).toFile('public/news-img/plain.jpg');
console.log('public/news-img/plain.jpg');
