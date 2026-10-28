// The locale for dates and numbers on screen: the interface language (Налаштування → Мова). Read straight from
// the saved settings, because modules load before src/main.jsx marks <html lang>. Documents written in
// Ukrainian (reports, certificates, the brief) keep uk-UA.
function lang() {
  try { return JSON.parse(globalThis.localStorage?.getItem('reaction-core/v3') || '{}')?.settings?.lang || 'uk'; } catch { return 'uk'; }
}
export const isEn = lang() === 'en';
export const LOCALE = isEn ? 'en-GB' : 'uk-UA';
