// CONTEXT News: an issue of short news, each section made only from its own open, free sources.
// Shared by the server (api/_news.js: reading feeds, thumbnails, summaries) and the page
// (src/news/NewsPage.jsx: the issue, PDF and Word). Pure helpers only — tested in scripts/test/news.test.mjs.

/** Things that tie a report to the Russian–Ukrainian war — for 5.1 (only these) and 5.2 (none of these). */
export const WAR = /украї|ukrain|зсу|окупант|zaporizh|запоріж|kharkiv|харків|kherson|херсон|odesa|одес|dnipro|дніпр|donetsk|донецьк|luhansk|луганськ|pokrovsk|покровськ|kupiansk|куп.янськ|росі|russia|kremlin|кремл|путін|putin|зеленськ|zelensk|київ|kyiv|kiev|москв|moscow|донбас|donbas|крим|crimea/i;

/** What each section is about — items that match none of it stay out (a film review is not «infospace»). */
const TOPIC = {
  // Life inside Ukraine: its institutions, its people, its places.
  society: /україн|украин|ukrain|київ|киев|kyiv|зеленськ|зеленск|свириденк|верховн|рад[аиіуо]\b|депутат|кабмін|кабмин|уряд|правительств|міністр|министр|мінфін|нбу|набу|сап\b|вакс|бюро|прокурат|суд|облрад|ова\b|міськрад|мер\b|мобіліз|мобилиз|тцк|бронюв|тариф|енерг|энерг|укренерго|нафтогаз|відключ|пенсі|пенси|виплат|податк|налог|бюджет|освіт|школ|медицин|лікар|протест|мітинг|корупц|коррупц|обшук|підозр|подозр|затрима|задерж|львів|харків|одес|дніпр|запоріж|вінниц|полтав|черніг|сум[иах]\b|житомир|рівн|тернопіл|івано|ужгород|чернів|хмельниц|черкас|кропивниц|миколаїв|херсон|луцьк/i,
  infospace: /ВСУ|ВС РФ|вооружен|минобороны|ПВО|беспилот|БПЛА|дрон|ракет|удар|атак|фронт|СВО|спецопер|пленн|обмен|Херсон|Запорож|Донецк|ДНР|ЛНР|Харьков|Курск|Белгород|Брянск|Сумы|Днепропетров|Покровск|Купянск|Константиновк|Гуляйпол|Северск|Мирноград|Красноарм|поражен|уничтож|освобо|штурм|группировк|наступлен|пропаганд|propagand|фейк|fake|дезінформ|дезинформ|disinform|кремл|kremlin|путін|путин|putin|війн|войн|\bwar\b|армі|арми|military|військ|военн|санкц|sanction|репрес|repress|цензур|censor|вибор|выбор|election|дум[аиі]|duma|мобіліз|мобилиз|mobili[sz]|наратив|narrative|telegram|телеграм|z-|zelensk|зеленськ|зеленск|україн|украин|ukrain|окупац|оккупац|occup/i,
  agenda: /ВПК|Ростех|Шойгу|Белоусов|Герасимов|Лавров|Песков|Медведев|Совбез|ОДКБ|CSTO|ШОС|БРИКС|BRICS|учени|exercise|drill|warship|флот|fleet|submarine|подлод|Сармат|Орешник|Oreshnik|Буревестник|Burevestnik|Посейдон|призыв|conscript|оборонзаказ|ОПК|арсенал|arsenal|weapon|оружи|зброя|зброї|росі|росси|russia|kremlin|кремл|путін|путин|putin|китай|china|chinese|xi\b|іран|иран|iran|кндр|north korea|pyongyang|білорус|беларус|belarus|лукашенк|lukashenk|армі|арми|army|військ|военн|military|оборон|defen[cs]e|ракет|missile|санкц|sanction|nuclear|ядерн|nato|нато|окупац|оккупац|occup/i,
  conflicts: /drone|missile|bomb|gunmen|massacre|offensive|bombard|siege|famine|occupied|west bank|idf|\brsf\b|al-shabaab|boko|jihad|isis|islamic state|cartel|junta|taliban|afghanistan|pakistan|armenia|azerbaijan|kosovo|libya|nigeria|burkina|niger\b|chad|mozambique|colombia|ecuador|north korea|south china sea|philippines|\bwar\b|conflict|fighting|clash|attack|strike|airstrike|shelling|ceasefire|truce|rebel|militia|insurg|troops|army|military|killed|displaced|refugee|humanitarian|hostage|coup|terror|gaza|israel|hamas|hezbollah|lebanon|iran|syria|yemen|houthi|sudan|congo|sahel|mali|somalia|ethiopia|myanmar|taiwan|kashmir|haiti|venezuela|peacekeep|sanction/i,
};
const SOFT = /гороскоп|horoscope|свят[оа] |праздник|церковн|храм|богородиц|релігійн|религиозн|погода|weather|рецепт|recipe|фільм|фильм|\bfilm\b|movie|кіно|кино|серіал|сериал|оскар|oscar|football|футбол|halloween|хелловін|хэллоуин/i;

/**
 * The sections of an issue, in order, and the open, free sources each is made from (RSS, no paywall).
 * part — the chapter heading; title — the subsection (empty when the chapter has none).
 * Section 1 («key») has no sources of its own: it is the day's key news picked from all the others.
 * The aggressor's information space is read through independent and fact-checking outlets that cover it,
 * not by relaying state propaganda.
 */
export const SECTIONS = [
  { id: 'key', code: '1', part: 'РОЗДІЛ 1 | КЛЮЧОВІ НОВИНИ ДОБИ', title: '', en: { part: 'SECTION 1 | KEY NEWS OF THE DAY', title: '' }, key: true, feeds: [] },
  {
    id: 'infospace', pool: 48, code: '2.1', match: TOPIC.infospace, part: 'РОЗДІЛ 2 | СПЕЦОПЕРАЦІЇ ТА АКТУАЛЬНІ ПОДІЇ', title: '2.1 ІНФОПРОСТІР КРАЇНИ-АГРЕСОРА',
    en: { part: 'SECTION 2 | SPECIAL OPERATIONS AND CURRENT EVENTS', title: '2.1 THE AGGRESSOR STATE’S INFORMATION SPACE' },
    about: 'війна проти України так, як її подають російські ЗМІ та Міноборони рф: заявлені ураження збройними силами рф позицій, об’єктів і техніки ЗСУ, «успіхи» армії рф на фронті, захоплення населених пунктів, інші військові події, пов’язані з Україною (усе — як твердження російської сторони). Не підходить: внутрішнє життя Росії без зв’язку з війною (медицина, економіка, суди, культура); повідомлення українських чи незалежних ЗМІ про російські обстріли українських міст і жертви серед цивільних',
    feeds: [
      'https://lenta.ru/rss/news',
      'https://meduza.io/rss/all',
      'https://www.themoscowtimes.com/rss/news',
      // Lenta.ru at times gives nothing to a server abroad: RIA and TASS carry the same official line (and the
      // Russian defence ministry's morning claim), DW's Russian service the view from outside.
      'https://ria.ru/export/rss2/archive/index.xml',
      'https://tass.ru/rss/v2.xml',
      'https://rss.dw.com/rdf/rss-ru-all',
    ],
  },
  {
    id: 'media', pool: 48, code: '2.2', part: 'РОЗДІЛ 2 | СПЕЦОПЕРАЦІЇ ТА АКТУАЛЬНІ ПОДІЇ', title: '2.2 УКРАЇНСЬКІ ТА СВІТОВІ ЗМІ',
    en: { part: 'SECTION 2 | SPECIAL OPERATIONS AND CURRENT EVENTS', title: '2.2 UKRAINIAN AND WORLD MEDIA' },
    about: 'дії Сил оборони України: спецоперації ЗСУ, СБУ, ГУР, ССО, Сил безпілотних систем; ураження українськими силами ворожих позицій, техніки, складів, НПЗ, заводів і аеродромів, зокрема в Росії; успіхи на фронті, звільнення територій, втрати противника. Не підходить: російські обстріли українських міст і їхні наслідки, політика, дипломатія, енергетика',
    feeds: [
      'https://www.ukrinform.ua/rss/block-lastnews',
      'https://interfax.com.ua/news/general.rss',
      'https://feeds.bbci.co.uk/ukrainian/rss.xml',
      'https://kyivindependent.com/news-archive/rss/',
      'https://www.pravda.com.ua/rss/view_news/',
      'https://mil.in.ua/uk/feed/',
      'https://armyinform.com.ua/feed/',
    ],
  },
  {
    id: 'agenda', pool: 36, code: '3', match: TOPIC.agenda, first: true, part: 'РОЗДІЛ 3 | ВІЙСЬКОВО-ПОЛІТИЧНА АДЖЕНДА КРАЇНИ-АГРЕСОРА ТА САТЕЛІТІВ', title: '',
    en: { part: 'SECTION 3 | MILITARY AND POLITICAL AGENDA OF THE AGGRESSOR STATE AND ITS SATELLITES', title: '' },
    about: 'військово-політичний порядок денний Росії та її союзників (Білорусь, Іран, КНДР, Китай): армія, оборонна промисловість, військова співпраця, санкції, ядерна риторика, рішення Кремля',
    feeds: [
      'https://lenta.ru/rss/news',
      'https://tass.com/rss/v2.xml',
      'https://rss.dw.com/rdf/rss-ru-all',
      'https://mil.in.ua/uk/feed/',
      'https://feeds.bbci.co.uk/russian/rss.xml',
      'https://www.themoscowtimes.com/rss/news',
    ],
  },
  {
    id: 'society', pool: 36, code: '4.1', part: 'РОЗДІЛ 4 | ОГЛЯД ВІЙСЬКОВО-ПОЛІТИЧНИХ ПОДІЙ В УКРАЇНІ', title: '4.1 СУСПІЛЬНО-ПОЛІТИЧНІ ПОДІЇ',
    en: { part: 'SECTION 4 | MILITARY AND POLITICAL EVENTS IN UKRAINE', title: '4.1 SOCIAL AND POLITICAL EVENTS' },
    match: TOPIC.society,
    about: 'суспільні й політичні події всередині України: рішення і заяви Президента, Верховної Ради, Кабміну, міністерств, НБУ, місцевої влади; антикорупційні справи (НАБУ, САП, ВАКС), суди, кадрові призначення, реформи, бюджет і податки, енергетика й відключення, тарифи, мобілізація і ТЦК, соціальні виплати, освіта, медицина, протести й суспільні резонанси в Україні. Не підходить: вибори, політика й скандали інших країн (США, Польща, Болгарія, Угорщина тощо), заяви іноземних політиків, міжнародні переговори й дипломатія, бойові дії й обстріли, біографічні дрібниці',
    feeds: [
      'https://www.pravda.com.ua/rss/view_news/',
      'https://www.ukrinform.ua/rss/rubric-polytics',
      'https://interfax.com.ua/news/political.rss',
      'https://zn.ua/rss/full.rss',
      'https://rss.unian.net/site/news_ukr.rss',
      'https://www.eurointegration.com.ua/rss/',
    ],
  },
  {
    id: 'defence', code: '4.2', part: 'РОЗДІЛ 4 | ОГЛЯД ВІЙСЬКОВО-ПОЛІТИЧНИХ ПОДІЙ В УКРАЇНІ', title: '4.2 ОіВТ ТА ПІДТРИМКА СИЛ ОБОРОНИ УКРАЇНИ',
    en: { part: 'SECTION 4 | MILITARY AND POLITICAL EVENTS IN UKRAINE', title: '4.2 WEAPONS, MILITARY EQUIPMENT AND SUPPORT FOR UKRAINE’S DEFENCE FORCES' },
    about: 'озброєння і військова техніка та підтримка Сил оборони України: постачання зброї, пакети допомоги, оборонне виробництво, нові системи, навчання військових',
    feeds: [
      'https://mil.in.ua/uk/feed/',
      'https://armyinform.com.ua/feed/',
      'https://defence-ua.com/rss/feed.xml',
      'https://breakingdefense.com/feed/',
      'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml',
    ],
  },
  {
    id: 'abroad-war', pool: 40, code: '5.1', part: 'РОЗДІЛ 5 | ОГЛЯД ЗАКОРДОННИХ ЗМІ', title: '5.1 ІЗ ВПЛИВОМ НА РОСІЙСЬКО-УКРАЇНСЬКУ ВІЙНУ', match: WAR,
    en: { part: 'SECTION 5 | FOREIGN MEDIA REVIEW', title: '5.1 AFFECTING THE RUSSIAN-UKRAINIAN WAR' },
    about: 'що пишуть закордонні ЗМІ про ситуацію в Україні та війну: репортажі, оцінки, аналітика, реакція світу, рішення інших держав щодо України й Росії',
    feeds: [
      'https://www.theguardian.com/world/ukraine/rss',
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://www.politico.eu/feed/',
      'https://rss.dw.com/rdf/rss-en-world',
      'https://www.france24.com/en/europe/rss',
      'https://www.euronews.com/rss?level=theme&name=news',
      'https://www.theguardian.com/world/rss',
      'https://www.aljazeera.com/xml/rss/all.xml',
    ],
  },
  {
    id: 'abroad-other', pool: 36, code: '5.2', part: 'РОЗДІЛ 5 | ОГЛЯД ЗАКОРДОННИХ ЗМІ', title: '5.2 ІНШІ МІЖНАРОДНІ КОНФЛІКТИ', skip: WAR, match: TOPIC.conflicts,
    en: { part: 'SECTION 5 | FOREIGN MEDIA REVIEW', title: '5.2 OTHER INTERNATIONAL CONFLICTS' },
    about: 'інші збройні конфлікти й кризи у світі, не пов’язані з Україною та Росією: Близький Схід, Африка, Азія, Латинська Америка',
    feeds: [
      'https://www.aljazeera.com/xml/rss/all.xml',
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml',
      'https://www.france24.com/en/rss',
      'https://www.theguardian.com/world/rss',
    ],
  },
];
/** The verified outlets of a section: the sites of its own feeds. A news goes only into a section whose list
 * holds its outlet (the key news may come from any section's list). */
export function outlets(id) {
  const s = SECTIONS.find((x) => x.id === id);
  return new Set((s?.feeds || []).map(host));
}

/** Candidates read per section; the page then holds four or five of them (fitItems). */
// The two night-report leads (2.1 and 2.2) always carry the same picture of the site's own: only their numbers
// change from day to day. Served from public/news-img, so it never depends on a source letting it be read.
export const LEAD_IMAGE = { ru: '/news-img/lead-ru.jpg', ua: '/news-img/lead-ua.jpg' };
export const withLeadImages = (issue) => (issue?.sections ? {
  ...issue,
  // An issue made before a style rule still reads in today's style («рф», «росія», «путін»).
  sections: issue.sections.map((s) => ({ ...s, items: s.items.map((x) => ({ ...(x.lead && LEAD_IMAGE[x.lead] ? { ...x, image: LEAD_IMAGE[x.lead] } : x), summary: lowerRu(x.summary) })) })),
} : issue);

// A picture from a Russian site: such sites are blocked in Ukraine, so a reader there never sees it — an open
// photo of the subject takes its place (and the documents fetch it through the site's own server).
export const ruPicture = (url) => { try { return /(^|\.)(ru|рф|su)$/i.test(new URL(url).hostname); } catch { return false; } };

export const PER_SECTION = 5;
/** «News of the day»: published within the last 24 hours. */
export const FRESH = 24 * 3600000;
/** Fresh news read from each section's feeds before the editor sorts them. */
// Candidates the editor judges per section; the sections whose outlets carry much off-topic news get more.
export const POOL = 20;
// Not a fresh event: analysis, explainers, interviews, reviews, podcasts, weekly roundups, «what we know».
const ANALYSIS = /^(analysis|explainer|explained|opinion|comment|podcast|interview|review|q&a|watch|video|photos|in pictures|briefing)\b|what we know|what to know|how .* works|the week in|week in review|digest|дайджест|новини вихідних|новости выходных|головне за день|главное за день|підсумки дня|итоги дня|on our radar|eurasia daily monitor|аналітик|аналитик|колонк|інтерв.ю|интервью|подкаст|пояснюємо|объясняем|що відомо про|что известно о|все, що (потрібно|треба) знати|огляд тижня|итоги недели|підсумки тижня|історія |история |хронологія|хронология|^мнение|^думка|^блог|лонгрид/i;
/** Light news (holidays, films, horoscopes, sport) — kept out of every section. */
export const offTopic = (x) => SOFT.test(x.title || '')
  || /^(захищено|protected|private)\s*:/i.test(x.title || '') // a password-protected post has no text to retell
  || /\/(commentisfree|opinions?|podcasts?|videos?|live)\//i.test(x.url || '') // columns, podcasts, videos, live pages: not news
  || ANALYSIS.test(x.title || '') || /\/(analysis|explainers?|features?|longreads?|interviews?|opinion|blogs?|podcasts?|in-pictures|gallery)\//i.test(x.url || '') // analysis, explainers, interviews: not the day's news
  || !/[a-zа-яіїєґё]{3}/i.test(x.title || ''); // headlines in scripts the issue does not carry (Arabic, Chinese …)
export const KEY_COUNT = 5;

/** The time the current issue belongs to: the latest 17:00 in Kyiv at or before `now`. */
export function issueTime(now = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = local - Math.floor(now / 1000) * 1000; // Kyiv minus UTC
  const day = Date.UTC(+p.year, +p.month - 1, +p.day, 17, 0, 0) - (+p.hour < 17 ? 86400000 : 0);
  return day - offset;
}

/** How much of an A4 page a row takes in the PDF (src/lib/newsExport.js) — the page, PDF and Word show the same rows. */
export const PAGE = { budget: 650, perLine: 54, line: 15, pic: 112, gap: 16 };
const rowHeight = (x) => Math.max(PAGE.pic, Math.ceil(String(x.summary || '').length / PAGE.perLine) * PAGE.line) + PAGE.gap;
/** Four news always; a fifth only when it still fits on the section's page. */
export function fitItems(items, min = 4, max = 5) {
  const out = [];
  let used = 0;
  for (const x of items) {
    if (out.length >= max) break;
    const h = rowHeight(x);
    if (out.length >= min && used + h > PAGE.budget) break;
    out.push(x); used += h;
  }
  return out;
}

/** The editor's question for one section: which of these news are plainly about its topic. */
export function keepPrompt(section, items) {
  return [
    {
      role: 'system',
      content: `Ти — випусковий редактор щоденного огляду новин. Розділ огляду: «${[section.part, section.title].filter(Boolean).join(' ')}». `
        + `Тема розділу: ${section.about}.\n`
        + 'Для кожної новини нижче визнач, чи вона стосується теми розділу: 2 — явно про тему розділу, 1 — частково або побічно, 0 — ні. '
        + 'Новина має повідомляти про подію: удар, бій, рішення, заяву, поставку, контракт, випробування, факт чи цифру. Суто аналітичні, оглядові й пояснювальні статті, історичні довідки, інтерв’ю, думки й дайджести без нової події — 0. '
        + 'Культура, спорт, розваги, побут, свята, внутрішня політика чи економіка інших країн без зв’язку з темою — 0. '
        + `Відповідай лише JSON без пояснень, з відповіддю для кожного номера від 1 до ${items.length}: {"keep": {"1": 2, "2": 0, "3": 1, …}}`,
    },
    { role: 'user', content: items.map((x, i) => `${i + 1}. ${x.title} — ${String(x.text || '').slice(0, 160)}`).join('\n') },
  ];
}
const parseJson = (raw) => {
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
};
/** → [true (2: plainly on topic) | 'maybe' (1: partly) | false (0) | undefined (no answer)], or null when unreadable. */
export function readKeep(raw, items) {
  let j;
  try { j = parseJson(raw); } catch { return null; }
  const k = j?.keep;
  const at = Array.isArray(k) ? (i) => k[i] : k && typeof k === 'object' ? (i) => k[String(i + 1)] : null;
  if (!at || items.filter((_, i) => at(i) != null).length < items.length * 0.8) return null;
  return items.map((_, i) => { const v = at(i); return v == null ? undefined : v === 1 || v === '1' ? 'maybe' : v === true || v === 2 || v === '2' || /^(yes|так|true)$/i.test(String(v)); });
}

/** The editor's look at all headlines together: which tell the same event, and the day's key news. */
export function eventsPrompt(items, n = KEY_COUNT) {
  return [
    {
      role: 'system',
      content: 'Ти — випусковий редактор. Нижче заголовки новин з різних джерел і різними мовами. '
        + 'Знайди групи заголовків про ту саму подію (той самий факт, рішення, удар, заяву). '
        + `Також обери ${n} ключових новин доби — про різні події. Ключові — це новини з найбільшим резонансом для України (удари й втрати, події на фронті, рішення союзників про зброю, санкції, гроші, переговори про мир, великі рішення влади) та новини, що зачіпають світову безпеку (війни й конфлікти, ядерні загрози, рішення великих держав і НАТО, теракти). Не ключові: техніка й огляди без нової події, аналітика, місцеві чи побутові новини, справи інших країн без впливу на безпеку. `
        + 'Відповідай лише JSON без пояснень: {"same": [[1, 4], [2, 9, 13]], "key": [номери від найважливішої]}',
    },
    { role: 'user', content: items.map((x, i) => `${i + 1}. ${x.title}`).join('\n') },
  ];
}
/** → { groups: [[indices]], key: [indices] }, or null when unreadable. */
export function readEvents(raw, items) {
  let j;
  try { j = parseJson(raw); } catch { return null; }
  const ok = (v) => Number.isInteger(v) && v >= 0 && v < items.length;
  const groups = (Array.isArray(j?.same) ? j.same : []).map((g) => (Array.isArray(g) ? g : []).map((v) => Number(v) - 1).filter(ok)).filter((g) => g.length > 1);
  const key = (Array.isArray(j?.key) ? j.key : []).map((v) => Number(v) - 1).filter(ok);
  return { groups, key };
}

// Same event without the model: two headlines that share two telling words (the word's first consonants,
// Cyrillic read as Latin, so «Олешки» meets «Oleshky»), or a number and a telling word. Words found in many headlines
// («Україна», «Росія») tell nothing and are left out.
const LAT = { а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', є: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia' };
const STOP = new Set(['about', 'after', 'their', 'there', 'which', 'would', 'could', 'should', 'these', 'those', 'where', 'while', 'under', 'over', 'says', 'said', 'will', 'with', 'from', 'that', 'this', 'have', 'pisli', 'ponad', 'cherez', 'iakii', 'iakyi', 'takozh', 'mozhe', 'budut', 'bude', 'shchodo', 'pochn', 'zaiav', 'zaiai', 'novyn', 'novos', 'news', 'world', 'ukrai', 'russi', 'rosii', 'rossi', 'rosiis', 'kyiv', 'kiev', 'moskv', 'moscow']);
// Each telling word as two keys — its first five letters and its first consonants — so «evacuated» meets
// «евакуйовані» by the letters and «Oleshky» meets «Алешек» by the consonants.
function words(title) {
  const t = String(title || '').toLowerCase().replace(/[а-яёіїєґ]/g, (c) => LAT[c] ?? c).replace(/c/g, 'k').replace(/y/g, 'i');
  const out = [];
  for (const w of t.split(/[^a-z0-9]+/)) {
    if (/^\d{2,}$/.test(w) && !/^20\d\d$/.test(w)) out.push([`#${w}`]);
    else if (w.length >= 5 && !STOP.has(w.slice(0, 5)) && !STOP.has(w)) {
      const k = w.replace(/[aeiou]/g, '').replace(/(.)\1+/g, '$1').slice(0, 4);
      out.push(k.length >= 3 ? [w.slice(0, 5), `~${k}`] : [w.slice(0, 5)]);
    }
  }
  return out;
}
export function sameEvents(items) {
  const ws = items.map((x) => words(x.title));
  const df = new Map();
  ws.forEach((list) => new Set(list.flat()).forEach((key) => df.set(key, (df.get(key) || 0) + 1)));
  const common = Math.max(6, items.length * 0.05); // a word in many headlines («ВСУ», «беспилотник») tells nothing
  const tell = ws.map((list) => list.map((keys) => keys.filter((key) => df.get(key) <= common)).filter((keys) => keys.length));
  const parent = items.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let k = i + 1; k < items.length; k++) {
      // Word to word, each word of the other headline used once («операції» and «порятунку» must not both
      // lean on «operation»).
      const free = tell[k].map((keys) => new Set(keys));
      let shared = 0;
      for (const keys of tell[i]) {
        const at = free.findIndex((f) => f && keys.some((key) => f.has(key)));
        if (at >= 0) { free[at] = null; shared++; }
      }
      if (shared >= 2) pairs.push([i, k, shared]);
    }
  }
  const join = (list) => {
    parent.forEach((_, i) => { parent[i] = i; });
    for (const [i, k] of list) parent[root(k)] = root(i);
    const g = new Map();
    items.forEach((_, i) => { const r = root(i); g.set(r, [...(g.get(r) || []), i]); });
    return [...g.values()].filter((x) => x.length > 1);
  };
  // A long chain (A meets B, B meets C …) is a topic, not one event: within it only headlines sharing three words.
  return join(pairs).flatMap((g) => (g.length <= 4 ? [g] : join(pairs.filter(([i, k, n]) => n >= 3 && g.includes(i) && g.includes(k)))));
}
/** How many telling words two headlines share (each word of the second used once). */
export function sharedWords(a, b, { numbers = true } = {}) {
  const pick = (t) => words(t).filter((keys) => numbers || !keys[0].startsWith('#'));
  const free = pick(b.title).map((keys) => new Set(keys));
  let n = 0;
  for (const keys of pick(a.title)) {
    const at = free.findIndex((f) => f && keys.some((key) => f.has(key)));
    if (at >= 0) { free[at] = null; n++; }
  }
  return n;
}
/** The editor's same-event groups, trusted pair by pair only where the headlines share a telling word (not a bare number) —
 * a model that lumps unrelated news together must not empty a section. */
export function checkGroups(items, groups) {
  const out = [];
  for (const g of groups) {
    // A «group» of many headlines is the model lumping a whole topic together, not one event: left aside.
    if (g.length > 5) continue;
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) {
      // Two headlines of one event share at least two telling words (a name and a place, a weapon and a target).
      if (sharedWords(items[g[a]], items[g[b]], { numbers: false }) >= 2) out.push([g[a], g[b]]);
    }
  }
  return out;
}

/** One news per event: from each group the one in the thinnest section (`weight`, lower first), then the pictured,
 * then the freshest, stays. */
export function dropRepeats(items, groups, weight = () => 0) {
  const parent = items.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (const g of groups) for (const k of g.slice(1)) parent[root(k)] = root(g[0]);
  const by = new Map();
  items.forEach((_, i) => { const r = root(i); by.set(r, [...(by.get(r) || []), i]); });
  const drop = new Set();
  for (const g of by.values()) {
    if (g.length < 2) continue;
    const keep = [...g].sort((a, b) => weight(a) - weight(b) || Number(Boolean(items[b].image)) - Number(Boolean(items[a].image)) || String(items[b].at || '').localeCompare(String(items[a].at || '')))[0];
    g.forEach((k) => { if (k !== keep) drop.add(k); });
  }
  return { drop, root };
}

/** What the model is asked when choosing the day's key news from the headlines of all sections. */
export function keyPrompt(items, n = KEY_COUNT) {
  return [
    {
      role: 'system',
      content: `Ти — випусковий редактор. З поданого списку обери ${n} ключових новин доби — про різні події. `
        + 'Ключові — найбільш резонансні новини для України (удари й втрати, події на фронті, рішення союзників про зброю, санкції, гроші, переговори про мир, великі рішення влади) та новини, що зачіпають світову безпеку (війни й конфлікти, ядерні загрози, рішення великих держав і НАТО, теракти). '
        + 'Не ключові: техніка й огляди без нової події, аналітика, місцеві чи побутові новини. Не обирай дві новини про ту саму подію. '
        + `Відповідай лише JSON: {"pick": [номери]} — ${n} номерів зі списку, від найважливішої.`,
    },
    { role: 'user', content: items.map((x, i) => `${i + 1}. ${x.title}`).join('\n') },
  ];
}
/** The model's choice → indices into items; where it gave too few, the first news of each section in turn. */
export function readPick(raw, items, n = KEY_COUNT, fallback = []) {
  let list = [];
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const j = typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    list = Array.isArray(j?.pick) ? j.pick : [];
  } catch { list = []; }
  const out = [];
  for (const k of [...list.map((v) => Number(v) - 1), ...fallback]) {
    if (out.length >= n) break;
    if (Number.isInteger(k) && k >= 0 && k < items.length && !out.includes(k)) out.push(k);
  }
  return out;
}

const unesc = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#8217;/g, "'")
  .replace(/&#8211;|&#8212;/g, '—').replace(/&nbsp;|&#160;/g, ' ');
const plain = (s) => unesc(unesc(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (block, name) => (new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block) || [])[1] || '';
const attr = (block, re) => (re.exec(block) || [])[1] || '';
export const host = (url) => { try { return new URL(url).hostname.replace(/^(www|feeds|rss|news)\./, ''); } catch { return ''; } };
// A picture's address has a path of its own (a bare «https://zn.ua» is the site, not a picture).
const httpUrl = (u) => (/^https?:\/\/[^\s"'<>/]+\/[^\s"'<>]+$/i.test(u || '') && !/\/emoji\/|s\.w\.org\/images|pixel|spacer|1x1/i.test(u) ? u : '');

/** The thumbnail an item carries: media:thumbnail / media:content / an image enclosure / the first <img>. */
export function itemImage(block) {
  const pick = (u) => httpUrl(unesc(u).trim());
  return pick(attr(block, /<media:thumbnail[^>]*\burl="([^"]+)"/i))
    || pick(attr(block, /<media:content[^>]*\burl="([^"]+)"[^>]*(?:medium="image"|type="image\/)/i))
    || pick(attr(block, /<media:content[^>]*(?:medium="image"|type="image\/)[^>]*\burl="([^"]+)"/i))
    || pick(attr(block, /<enclosure[^>]*\burl="([^"]+)"[^>]*type="image\//i))
    || pick(attr(block, /<enclosure[^>]*type="image\/[^"]*"[^>]*\burl="([^"]+)"/i))
    || pick(attr(unesc(block), /<img[^>]+src="([^"]+)"/i));
}

/** RSS 2.0 / RDF / Atom → [{ title, text, url, domain, at, image }]. */
export function parseNewsFeed(xml) {
  const blocks = String(xml || '').match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
  return blocks.map((b) => {
    const href = attr(b, /<link[^>]+href="([^"]+)"/i);
    const url = httpUrl(unesc(href || plain(tag(b, 'link')) || plain(tag(b, 'guid'))).trim());
    const when = plain(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'updated') || tag(b, 'published'));
    const t = Date.parse(when);
    const text = plain(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content'));
    return { title: plain(tag(b, 'title')).slice(0, 220), text: text.slice(0, 1200), url, domain: host(url), at: Number.isFinite(t) ? new Date(t).toISOString() : null, image: itemImage(b) };
  }).filter((x) => x.title && x.url);
}

/** The freshest of a section: the last day (a news with no date is left out), newest first, each source at most `cap` times, pictures preferred. */
export function pickItems(items, now = Date.now(), n = PER_SECTION, cap = 4, fresh = FRESH) {
  const seen = new Set();
  const recent = items
    .filter((x) => x.at && now - Date.parse(x.at) < fresh && Date.parse(x.at) - now < 3600000)
    .filter((x) => { const k = x.url.split('?')[0]; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const out = [];
  const per = {};
  for (const pass of [true, false]) {
    for (const x of recent) {
      if (out.length >= n) break;
      if (out.includes(x) || (pass && !x.image)) continue;
      if ((per[x.domain] || 0) >= cap) continue;
      per[x.domain] = (per[x.domain] || 0) + 1;
      out.push(x);
    }
  }
  return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

/** The page's own preview picture (og:image / twitter:image), for an item whose feed carries none. */
export function pageImage(html) {
  const h = String(html || '').slice(0, 300000);
  return httpUrl(unesc(attr(h, /<meta[^>]+property="og:image(?::url)?"[^>]+content="([^"]+)"/i)
    || attr(h, /<meta[^>]+content="([^"]+)"[^>]+property="og:image(?::url)?"/i)
    || attr(h, /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i)).trim());
}

/** What the model is asked: a short retelling of each item from its own text only, in Ukrainian. */
export function summaryPrompt(items) {
  return [
    {
      role: 'system',
      content: 'Ти — редактор стислого огляду новин. Для кожної новини напиши українською рівно 2 або 3 повні речення (до 450 знаків): що сталося, де і чому це важливо. '
        + 'Спирайся ЛИШЕ на наданий заголовок і текст — нічого не додавай від себе, не вигадуй цифр, імен чи оцінок. '
        + 'Пиши лише українською (імена й назви — українською транслітерацією); «рф», «росія», «путін» — з малої літери. Без порожніх фраз на кшталт «Це важливо, оскільки…» чи «Це сталося в …» — '
        + 'пояснюй значення лише тоді, коли воно є в тексті. Пиши про саму подію, а не про текст: без «у тексті не вказано», «джерело не уточнює», «стаття розглядає», «матеріал пояснює». Кожне речення — нова інформація, без повторів сказаного. Відповідай лише JSON: {"summaries": ["…", "…"]} — по одному на новину, у тому ж порядку.',
    },
    { role: 'user', content: items.map((x, i) => `${i + 1}. ${RU_STATE.has(x.outlet) ? '[російське провладне ЗМІ — перекажи як твердження: «Російські ЗМІ повідомляють, що…» / «За версією російських ЗМІ…», не як факт; хто кого атакував, уразив чи захопив — точно як у джерелі: «ВС РФ» / «российские войска» — це армія рф, «ВСУ» — Збройні сили України] ' : ''}${x.title}\n${x.text || ''}`.slice(0, 1400)).join('\n\n') },
  ];
}

/** The English issue is the Ukrainian one translated — sentence for sentence, nothing added or left out. */
export function translatePrompt(texts) {
  return [
    {
      role: 'system',
      content: 'Translate each Ukrainian text into English faithfully, sentence for sentence: keep the same number of sentences, add nothing, leave nothing out. '
        + 'Use the usual English spelling of names and places (Kyiv, Kharkiv, Oleshky). For each text also give a 2–4 word English query for a news photo of its subject (a place, person or object). '
        + 'Answer with JSON only: {"t": ["…"], "q": ["…"]} — one per text, in the same order.',
    },
    { role: 'user', content: texts.map((t, i) => `${i + 1}. ${t}`).join('\n\n') },
  ];
}
/** → { t: [English text | ''], q: [query | ''] }. */
export function readTranslations(raw, texts) {
  let j = {};
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    j = typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  } catch { j = {}; }
  const t = texts.map((_, i) => shape(String(j?.t?.[i] || '').replace(/[Ѐ-ӿ⺀-鿿]+/g, (m) => (m.length > 2 ? m : '')).trim()).text);
  const q = texts.map((_, i) => String(j?.q?.[i] || '').replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60));
  return { t, q };
}

/** Russian pro-government outlets: read only to show the aggressor's own agenda — their news is retold as what
 * Russian media claim, never as fact. */
export const RU_STATE = new Set(['lenta.ru', 'ria.ru', 'tass.ru', 'tass.com']);

/** Ukrainian text: Cyrillic, with no letters only Russian has. A summary in another language never stands
 * in for a Ukrainian one. */
export const isUkrainian = (t) => /[а-яіїєґ]{3}/i.test(t || '') && !/[ыэъё]/i.test(t || '') && (t.match(/[a-z]/gi) || []).length < String(t).length * 0.3;

/** Sentences of a summary — split after . ! ? … before a capital letter or a quote. */
export function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+(?=[«"„(]?[A-ZА-ЯІЇЄҐ])/u).filter(Boolean);
}
/** A summary is two or three sentences: more are cut to three, an unfinished last one is left out;
 * `n` tells how many it has. */
// A sentence about the text rather than the news («у наданому тексті відповіді немає», «джерело не уточнює…»).
// The model thinking aloud in its answer («Канцлер Меркель... Merz», «з 1 по 4 жовтня... — ні, у тексті сказано»).
const ALOUD = /\.\.\.|…\s*\S|—\s*ні[,.]|\bні, у тексті|\bточніше,/i;
const META = /(у|в) (наданому )?текст\S* (не|немає|нема)|наданому тексті|джерел\S* не (уточню|наводить|вказу)|не уточнюється|деталей\S*[^.]*не (наведено|наводиться|зазначено)|(конкретн\S*|подробиц\S*)[^.]*не (вказано|зазначено|наведено)/i;
/** The issue's own style: «рф», «росія», «путін» with a small letter (a capital only where a sentence begins). */
export function lowerRu(text) {
  return String(text || '')
    .replace(/(?<![\p{L}])РФ(?![\p{L}])/gu, 'рф')
    .replace(/(?<!(?:^|[.!?…]\s+))(Росі(?:я|ї|ю|єю)|Путін(?:а|у|им|ові|і)?)(?![\p{L}])/gu, (w) => w[0].toLowerCase() + w.slice(1));
}
export function shape(text) {
  const all = sentences(text);
  const bad = (x) => META.test(x) || ALOUD.test(x);
  const list = all.filter((x) => !bad(x)).length ? all.filter((x) => !bad(x)) : all;
  if (list.length > 1 && (!/[.!?…»"')]$/.test(list.at(-1)) || /(\.\.\.|…)$/.test(list.at(-1)))) list.pop(); // unfinished or cut off with «…»
  return { text: lowerRu(list.slice(0, 3).join(' ')), n: Math.min(list.length, 3) };
}

/** The model's answer → one summary per item; where it gave none, the item's own text, shortened. */
export function readSummaries(raw, items) {
  let list = [];
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const j = typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    list = Array.isArray(j?.summaries) ? j.summaries : [];
  } catch {
    // A reply cut off at the length limit: keep the summaries it finished.
    const tail = String(raw || '').split(/"summaries"\s*:\s*\[/)[1] || '';
    list = [...tail.matchAll(/"((?:[^"\\]|\\.)*)"\s*[,\]]/g)].map((m) => { try { return JSON.parse(`"${m[1]}"`); } catch { return ''; } });
  }
  return items.map((x, i) => {
    const s = String(list[i] || '')
      .replace(/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3000-\u303F]+/g, '') // stray CJK the model sometimes slips in
      .replace(/\s*Це (важливо|сталося)[^.]*?(оскільки це|в [А-ЯІЇЄҐ][^.,]*)\.(?=\s|$)/g, '')
      .replace(/\s+/g, ' ').trim();
    if (s.length > 20 && isUkrainian(s)) return { ...shape(s), ai: true };
    const own = shape((x.text || x.title).replace(/\s+/g, ' ').trim());
    if (!isUkrainian(own.text)) return { text: own.text, n: 0, ai: false }; // not Ukrainian: not shown
    return { ...own, text: own.text.length > 420 ? `${own.text.slice(0, 420).replace(/\s\S*$/, '')}…` : own.text, ai: false };
  });
}

// ── The night's air-defence reports that open 2.1 and 2.2 ───────────────────────────────────────────────
// 2.1 opens with what the Russian defence ministry claims its air defence shot down overnight; 2.2 with the
// Ukrainian Air Force's report of the night's attack. Both are official statements published every
// morning and carried by the media; the issue takes the day's own report from the feeds it already reads.
// The model only lifts the numbers (and, for 2.1, the regions) out of the report; the text is the fixed
// wording below, so every issue says it the same way, and a report whose numbers cannot be read is left out.

const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
/** The Kyiv calendar day of a moment: «31 жовтня». */
export function kyivDay(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { day: +p.day, month: +p.month, year: +p.year, text: `${+p.day} ${MONTHS[+p.month - 1]}` };
}

export const REPORTS = {
  // The Ukrainian Air Force's morning report, as Ukrainian outlets carry it.
  ua: /(ППО|Повітрян\S* сил|протиповітрян\S* оборон|Сил\S* оборони)[^]*?(збил|збито|знешкод|подавл|нейтраліз|уражен|ліквідув|знищ|перехоп)|(збил|збито|знешкод|подавл|нейтраліз|уражен|ліквідув|знищ|перехоп)\S*[^]*?(Повітрян\S* сил|ППО)|(ворог|противник|росія|рф)[^]*?атакува\S*[^]*?(дрон|БпЛА|БПЛА|безпілот|ракет)|\d+ (з|із|зі) \d+[^]*?(БпЛА|БПЛА|дрон|безпілот|цілей)/i,
  // The Russian defence ministry's morning claim, as Russian-language and foreign outlets carry it.
  ru: /(ПВО|перехвач\S*|уничтож\S*|сбит\S*|сбил\S*)[^]*?(беспилотн|БПЛА|дрон)|(беспилотн|БПЛА|дрон)\S*[^]*?(перехвач|уничтож|сбит|сбил)|(Russia|Russian)[^]*?(downed|intercept\S*|shot down|destroyed)[^]*?(drone|UAV)/i,
};
const RU_SIDE = /Минобороны|МО РФ|ПВО|над (территори|регион)|Russia(n)? (says|claims|defen[cs]e ministry|air defen[cs]e)|над рос|за ночь/i;

// Not the night's report: a tally for a month, a week, a day or since some date («ПВО за октябрь сбила почти
// 28 тысяч…», «упродовж суботи атакував 168 БпЛА») — such items come out right after midnight too.
const PERIOD = {
  ru: /за (октябр|ноябр|декабр|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|месяц|недел|год|сутки|день|минувш\S* (сутки|день|недел|месяц)|все время|время|период)|в течение (дня|суток|недели|месяца)|с начала|тысяч/i,
  ua: /за (жовт|листопад|груд|січ|лют|берез|квіт|трав|черв|лип|серп|верес|місяц|тижд|рік|добу|день)|упродовж (дня|доби|суботи|неділі|понеділка|вівторка|середи|четверга|п.ятниці)|протягом (дня|доби)|з початку|тисяч/i,
};
const NIGHT = { ru: /за ночь|ночью|в ночь|минувшей ночью|в течение ночи/i, ua: /за ніч|вночі|у ніч|в ніч|протягом ночі|минулої ночі/i };
/** Whether an item is the night's report for its side and not a tally of a longer period. */
export const nightReport = (x, side) => REPORTS[side].test(x?.title || '') && !PERIOD[side].test(x?.title || '') && (side !== 'ru' || RU_DEFENCE(x.title));
// The Russian report is the air defence's own (ПВО, «над территориями…»), not a troop grouping's claim about
// drones it says it hit at the front («Группировка "Север" за ночь уничтожила 183 беспилотника ВСУ»).
function RU_DEFENCE(title) { return /ПВО|противовоздушн|Минобороны|МО РФ|над (Росси|территори|регион|акватори|област)|over Russia|air defen[cs]e|defen[cs]e ministry/i.test(title) && !/группировк|ВСУ потерял|на (фронте|направлени)/i.test(title); }

/** The day's report for a side: published since midnight in Kyiv, with numbers in its headline or text. */
export function findReport(items, side, now = Date.now()) {
  const today = kyivDay(now);
  const re = REPORTS[side];
  const fit = items.filter((x) => {
    if (!x.at) return false;
    const d = kyivDay(Date.parse(x.at));
    if (d.day !== today.day || d.month !== today.month || Date.parse(x.at) > now) return false;
    const t = `${x.title} ${x.text || ''}`;
    if (!re.test(x.title) || PERIOD[side].test(x.title) || !/\d{2,}/.test(t)) return false;
    return side === 'ru' ? RU_SIDE.test(t) && RU_DEFENCE(x.title) && !/Повітрян\S* сил/i.test(t) : /[іїєґ]/i.test(x.title);
  });
  // The earliest of the day's reports is the morning one; later items are follow-ups and corrections.
  // One that says «за ніч» / «за ночь» comes before one that does not.
  const night = (x) => (NIGHT[side].test(`${x.title} ${x.text || ''}`) ? 0 : 1);
  return fit.sort((a, b) => night(a) - night(b) || String(a.at).localeCompare(String(b.at)))[0] || null;
}

/** What the model is asked: the numbers of the report, nothing else. */
export function reportPrompt(side, text) {
  const ask = side === 'ua'
    ? 'Це ранковий звіт Повітряних сил ЗСУ про нічну атаку. Випиши з тексту лише числа. Відповідай лише JSON: '
      + '{"ballistic": кількість балістичних ракет або 0, "cruise": кількість крилатих і інших ракет або 0, '
      + '"drones": скільки всього ударних БпЛА (Shahed, Гербера, імітаторів) запустив противник, "jet": скільки з них реактивних або null, '
      + '"downed": скільки БпЛА збито/подавлено, "downedJet": скільки з них реактивних або null, "time": "станом на" — час у форматі 09:00 або null}. '
      + 'Якщо числа в тексті немає — null. Нічого не вигадуй.'
    : 'Це заява Міноборони РФ про перехоплені за ніч безпілотники. Відповідай лише JSON: '
      + '{"count": кількість перехоплених і знищених безпілотників (число з тексту), '
      + '"regions": перелік регіонів і акваторій із тексту українською в родовому відмінку одним рядком, наприклад: '
      + '«Новгородської, Тверської, Бєлгородської областей, Краснодарського краю, ТОТ Автономної Республіки Крим та над акваторією Чорного моря» '
      + '(Крим — завжди «ТОТ Автономної Республіки Крим»; якщо регіонів у тексті немає — null)}. Нічого не вигадуй.';
  return [{ role: 'system', content: ask }, { role: 'user', content: String(text || '').slice(0, 3500) }];
}

const num = (v) => (Number.isInteger(+v) && +v > 0 ? +v : 0);
/** The model's numbers → the report's fixed wording, or '' when the numbers are not there. */
export function composeReport(side, raw, at) {
  let j;
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    j = typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  } catch { return ''; }
  if (side === 'ru') {
    const n = num(j?.count);
    const regions = String(j?.regions || '').replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '');
    // Ukrainian forms only («Брянської області», not «Брянской области»).
    if (!n) return '';
    // The regions only in their Ukrainian forms; a claim that names none (or names them in Russian) is told without them.
    const ok = /[а-яіїєґ]{4}/i.test(regions) && !/[ыэъё]|област[иь](?![а-яіїєґ])|ской(?![а-яіїєґ])|(?<![а-яіїєґ])края(?![а-яіїєґ])/i.test(regions) && regions.length <= 600;
    return `Протягом минулої ночі черговими силами ППО рф було перехоплено та знищено ${n} українських безпілотних літальних апаратів літакового типу${ok ? ` над територіями ${regions}` : ''}.`;
  }
  const drones = num(j?.drones);
  const downed = num(j?.downed);
  if (!drones || !downed || downed > drones + 100) return '';
  const jet = num(j?.jet);
  const downedJet = num(j?.downedJet);
  const time = /^\d{1,2}:\d{2}$/.test(String(j?.time || '')) ? String(j.time).padStart(5, '0') : '09:00';
  const parts = [];
  if (num(j?.ballistic)) parts.push(`${num(j.ballistic)} балістичними ракетами`);
  if (num(j?.cruise)) parts.push(`${num(j.cruise)} крилатими ракетами`);
  const uav = `${drones} ударними БпЛА типу Shahed${jet ? ` (${jet} із них — реактивні)` : ''}, Гербера, дронами-імітаторами типу «Пародія»`;
  const attack = parts.length ? `${parts.join(', ')} та ${uav}` : uav;
  return `У ніч на ${kyivDay(Date.parse(at)).text} противник атакував ${attack}. `
    + `За попередніми даними, станом на ${time}, протиповітряною обороною збито/подавлено ${downed} ворожих БпЛА типу Shahed${downedJet ? ` (${downedJet} із них — реактивні)` : ''}, Гербера та дронів інших типів.`;
}
