// A small preview of a picture, made in the browser when it is uploaded: shown at once in cards and lists,
// with no request to the store. Kept inside the record next to the file's card (a few kilobytes).
const SIDE = 360;

export async function thumbOf(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const webp = c.toDataURL('image/webp', 0.72);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.75);
  } catch { return null; } // not a picture the browser can read (e.g. some SVG or HEIC)
}
