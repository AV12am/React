// The three services and their products — for the service pages (/osint, /risk, /due-diligence; src/site/services.js),
// after «Reaction · Продукти: специфікація» (18 Nov 2026). Each product: who it is for, the question it answers, what
// the client gets, its structure (the numbered call-outs on the sample), length and turnaround, sources and limits.
// `sample` is the product's real example (pictures of its pages) once one is made; until then the structure is shown.
// The site is English; Ukrainian is kept for the Ukrainian version of the page (other languages show the English).

const t = (en, uk) => ({ en, uk });

export const SERVICES = {
  osint: {
    path: '/osint',
    k: t('OPEN-SOURCE INTELLIGENCE', 'РОЗВІДКА З ВІДКРИТИХ ДЖЕРЕЛ'),
    title: t('Open sources, verified and brought together.', 'Відкриті джерела — перевірені й зведені в одну картину.'),
    lead: t(
      'Three products, from a single point to a steady watch: check one claim, build the full picture of an event, follow a topic every week.',
      'Три продукти — від точкового до постійного: перевірити одне твердження, скласти повну картину події, стежити за темою щотижня.',
    ),
    products: [
      {
        id: 'verification-note',
        name: 'Verification Note',
        who: t('Newsrooms, corporate communications, risk teams — when you need to know quickly whether it is true.', 'Редакції, комунікації компаній, відділи ризиків — коли треба швидко знати, чи це правда.'),
        question: t('Does the claim, the document, the photo or the video hold up?', 'Чи підтверджується твердження, документ, фото чи відео?'),
        gets: t('A verdict — Confirmed, Partly confirmed, Not supported or Unverifiable — with a level of confidence.', 'Вердикт — Confirmed, Partly confirmed, Not supported або Unverifiable — з рівнем довіри.'),
        size: t('1–2 pages · 24–48 hours', '1–2 сторінки · 24–48 годин'),
        sources: t('Official documents and registries, primary sources, metadata, reverse image search, web archives.', 'Офіційні документи й реєстри, першоджерела, метадані, зворотний пошук зображень, архіви вебсторінок.'),
        limits: t('We assess claims, not people. «Not supported» does not mean «fake».', 'Оцінюємо твердження, не людей. «Не підтверджено» ≠ «фейк».'),
        parts: [
          [t('Claim', 'Claim · твердження'), t('What exactly is being checked, word for word, with where and when it appeared.', 'Що саме перевіряємо — дослівно, де й коли воно з’явилося.')],
          [t('Verdict', 'Verdict · вердикт'), t('One of four verdicts and the level of confidence — on the first lines.', 'Один із чотирьох вердиктів і рівень довіри — у перших рядках.')],
          [t('What we checked', 'What we checked · що перевірили'), t('Every step of the check, in order.', 'Кожен крок перевірки по порядку.')],
          [t('Evidence', 'Evidence · докази'), t('Each piece of evidence with its grade on the A1–F6 scale.', 'Кожен доказ — з оцінкою за шкалою A1–F6.')],
          [t('What remains open', 'What remains open · що лишається відкритим'), t('What the sources cannot show, said plainly.', 'Чого джерела показати не можуть — прямо.')],
          [t('Sources', 'Sources · джерела'), t('Every source with its grade, and archived copies.', 'Кожне джерело з оцінкою та архівні копії.')],
        ],
      },
      {
        id: 'situation-profile',
        name: 'Situation Profile',
        who: t('Executives, lawyers and analysts who need to understand an event or a topic fast.', 'Керівники, юристи, аналітики, яким треба швидко зрозуміти подію чи тему.'),
        question: t('What happened, who is involved, what is known for certain — and what comes next?', 'Що сталося, хто задіяний, що відомо напевно і що далі?'),
        gets: t('A verified timeline, a map of the actors, the known and the unknown, the implications.', 'Перевірену хронологію, карту учасників, «відомо / невідомо», наслідки.'),
        size: t('3–5 pages · 3–5 days', '3–5 сторінок · 3–5 днів'),
        sources: t('Official reports, hearings and registries; the media only for dates.', 'Офіційні звіти, слухання, реєстри; медіа — лише для дат.'),
        limits: t('As of the date of issue; anything resting on assumptions is marked as unverified.', 'Стан на дату; усе, що тримається на припущеннях, позначено як неперевірене.'),
        parts: [
          [t('Bottom line', 'Bottom line · головне'), t('The answer in two or three sentences, the level of confidence and the date it stands on.', 'Відповідь у 2–3 реченнях, рівень довіри й дата, станом на яку зроблено.')],
          [t('Timeline', 'Timeline · хронологія'), t('The events in order, each confirmed by a source.', 'Події по порядку, кожна — підтверджена джерелом.')],
          [t('Actors', 'Actors · учасники'), t('Who is involved and how they are connected.', 'Хто задіяний і як пов’язаний.')],
          [t('Known / Unknown', 'Known / Unknown · відомо / невідомо'), t('What is established, and what is not — side by side.', 'Що встановлено, а що ні — поруч.')],
          [t('Implications', 'Implications · наслідки'), t('What it means for you and what may follow.', 'Що це означає для вас і що може статися далі.')],
          [t('Sources', 'Sources · джерела'), t('Every source with its grade.', 'Кожне джерело з оцінкою.')],
        ],
      },
      {
        id: 'weekly-monitor',
        name: 'Weekly Monitor',
        who: t('Companies and funds with a standing topic or region of interest.', 'Компанії й фонди з постійною темою чи регіоном інтересу.'),
        question: t('What changed this week — and does it change our decisions?', 'Що змінилось за тиждень і чи це змінює наші рішення?'),
        gets: t('Five to seven verified developments with why each matters, a signal panel, and what to expect next week.', '5–7 перевірених подій із «чому це важливо», сигнальна панель, що чекати наступного тижня.'),
        size: t('2 pages · every Monday, monthly subscription', '2 сторінки · щопонеділка, підписка на місяць'),
        sources: t('Official statements, statistics, regulators, research.', 'Офіційні повідомлення, статистика, регулятори, дослідження.'),
        limits: t('The topic is fixed in the contract; unverified news does not go in.', 'Тема фіксується в договорі; новини без перевірки не входять.'),
        parts: [
          [t('This week in one line', 'This week in one line · тиждень одним рядком'), t('The week’s meaning in a single sentence.', 'Сенс тижня одним реченням.')],
          [t('Key developments', 'Key developments · ключові події'), t('Five to seven verified events, each with why it matters.', '5–7 перевірених подій — кожна з «чому це важливо».')],
          [t('Signal panel', 'Signal panel · сигнальна панель'), t('The indicators that show which way things are moving.', 'Індикатори, що показують, куди рухається ситуація.')],
          [t('Next week', 'Next week · наступний тиждень'), t('Dates, decisions and events to expect.', 'Дати, рішення й події, яких варто чекати.')],
          [t('Sources', 'Sources · джерела'), t('Every source with its grade.', 'Кожне джерело з оцінкою.')],
        ],
      },
    ],
  },
  risk: {
    path: '/risk',
    k: t('RISK ANALYSIS', 'АНАЛІЗ РИЗИКІВ'),
    title: t('Know the risks before they reach you.', 'Знати ризики раніше, ніж вони вас торкнуться.'),
    lead: t(
      'Our method at work: a probability tree, the lever that decides the outcome, a signal panel and a date to check every forecast against.',
      'Тут працює наш метод: дерево ймовірностей, важіль, що вирішує результат, сигнальна панель і дата перевірки кожного прогнозу.',
    ),
    products: [
      {
        id: 'country-market-risk-brief',
        name: 'Country & Market Risk Brief',
        who: t('Companies entering a market or holding assets there; investors.', 'Компанії, що входять на ринок або тримають там активи; інвестори.'),
        question: t('What political, economic and security risks await us there in the next 6–12 months?', 'Які політичні, економічні й безпекові ризики чекають нас там у 6–12 місяців?'),
        gets: t('A risk scorecard across three areas, three scenarios with probabilities, the lever and the signals.', 'Шкалу ризиків за трьома напрямами, 3 сценарії з імовірностями, важіль, сигнали.'),
        size: t('4–6 pages · 5–7 days', '4–6 сторінок · 5–7 днів'),
        sources: t('Central banks, statistics, the IMF and the World Bank, the European Commission, electoral commissions, research.', 'Центробанки, статистика, МВФ і Світовий банк, Єврокомісія, виборчі комісії, дослідження.'),
        limits: t('Not investment advice; as of the date of issue.', 'Не інвестиційна порада; стан на дату випуску.'),
        parts: [
          [t('Bottom line', 'Bottom line · головне'), t('The answer, the level of confidence and the date it stands on.', 'Відповідь, рівень довіри й дата, станом на яку зроблено.')],
          [t('Risk scorecard', 'Risk scorecard · шкала ризиків'), t('Political, economic and security risk — each with its level.', 'Політичний, економічний і безпековий ризик — кожен зі своїм рівнем.')],
          [t('Scenarios', 'Scenarios · сценарії'), t('Three ways it may go, each with a probability and a date to check it.', 'Три варіанти розвитку — кожен з імовірністю й датою перевірки.')],
          [t('For your decision', 'For your decision · для вашого рішення'), t('What to do, and what to weigh.', 'Що робити і на що зважати.')],
          [t('Signal panel', 'Signal panel · сигнальна панель'), t('The signs that show which scenario is coming true.', 'Ознаки, за якими видно, який сценарій справджується.')],
          [t('Sources', 'Sources · джерела'), t('Every source with its grade.', 'Кожне джерело з оцінкою.')],
        ],
      },
      {
        id: 'site-project-risk-assessment',
        name: 'Site & Project Risk Assessment',
        who: t('Manufacturers, logistics companies, communities and investors — before a decision on a site, a location or a season.', 'Виробники, логісти, громади, інвестори — перед рішенням про об’єкт, локацію чи сезон.'),
        question: t('What could stop the project — and how to prevent it?', 'Що може зупинити проєкт і як цьому запобігти?'),
        gets: t('A full report: the assessment, a decision for your type of reader, the lever, the monitoring.', 'Повний звіт: оцінка, рішення для вашого типу читача, важіль, моніторинг.'),
        size: t('6 pages · 7–10 days', '6 сторінок · 7–10 днів'),
        sources: t('Infrastructure operators, regulators, research, communities’ open data.', 'Оператори інфраструктури, регулятори, дослідження, відкриті дані громад.'),
        limits: t('Not safety advice; no data on military sites.', 'Не порада щодо безпеки; без даних про військові об’єкти.'),
        parts: [
          [t('Assessment', 'Assessment · оцінка'), t('The answer on the first page: how likely, and with what confidence.', 'Відповідь на першій сторінці: наскільки ймовірно і з якою впевненістю.')],
          [t('For your decision', 'For your decision · для вашого рішення'), t('What to do — written for your type of reader.', 'Що робити — для вашого типу читача.')],
          [t('Rationale', 'Rationale · обґрунтування'), t('Why we think so: the probability tree and the lever.', 'Чому ми так вважаємо: дерево ймовірностей і важіль.')],
          [t('Full picture', 'Full picture · повна картина'), t('Every factor, in detail.', 'Усі чинники — докладно.')],
          [t('Monitoring', 'Monitoring · моніторинг'), t('The signals to watch, and the date to check the forecast.', 'Сигнали, за якими стежити, і дата перевірки прогнозу.')],
          [t('Research & sources', 'Research & sources · дослідження й джерела'), t('The studies and the sources, each with its grade.', 'Дослідження й джерела — кожне з оцінкою.')],
        ],
      },
      {
        id: 'risk-watchlist',
        name: 'Risk Watchlist',
        who: t('Companies working in several markets that need to watch them all together.', 'Компанії з кількома ринками — стежити за ними всіма разом.'),
        question: t('Where did the risk grow this month, where did it fall — and is it time to act?', 'Де за місяць ризик зріс, де впав, і чи прийшов час діяти?'),
        gets: t('A table of countries with the change in risk (▲▼), the three moves of the month that matter, the signals for the month ahead.', 'Таблицю країн зі зміною ризику (▲▼), три головні зсуви місяця, сигнали на наступний місяць.'),
        size: t('2–3 pages · monthly subscription', '2–3 сторінки · щомісяця, підписка'),
        sources: t('As in the Country & Market Risk Brief, plus the calendars of elections and central bank decisions.', 'Як у Country & Market Risk Brief, плюс календарі виборів і рішень центробанків.'),
        limits: t('Up to eight countries in the base subscription.', 'До 8 країн у базовій підписці.'),
        parts: [
          [t('Month in one line', 'Month in one line · місяць одним рядком'), t('The month’s meaning in a single sentence.', 'Сенс місяця одним реченням.')],
          [t('Watchlist table', 'Watchlist table · таблиця'), t('Every country with its risk level and its change, ▲ or ▼.', 'Кожна країна — з рівнем ризику і його зміною ▲ чи ▼.')],
          [t('Three moves that matter', 'Three moves that matter · три головні зсуви'), t('The three changes of the month worth your attention.', 'Три зміни місяця, що варті вашої уваги.')],
          [t('Signals ahead', 'Signals ahead · сигнали попереду'), t('What to watch next month.', 'На що зважати наступного місяця.')],
          [t('Sources', 'Sources · джерела'), t('Every source with its grade.', 'Кожне джерело з оцінкою.')],
        ],
      },
    ],
  },
  dd: {
    path: '/due-diligence',
    k: t('DUE DILIGENCE', 'ПЕРЕВІРКА КОНТРАГЕНТІВ'),
    title: t('Know who you are dealing with.', 'Знати, з ким маєте справу.'),
    lead: t(
      'Two levels of depth on the same checklist of sources. Open sources only — no interviews and no field visits.',
      'Два рівні глибини на тому самому переліку джерел. Лише відкриті джерела — без інтерв’ю й виїздів.',
    ),
    products: [
      {
        id: 'counterparty-screening',
        name: 'Counterparty Screening',
        level: t('Level 1', 'Рівень 1'),
        who: t('Companies before a contract, a prepayment or the choice of a supplier.', 'Компанії перед договором, передоплатою, вибором постачальника.'),
        question: t('Are there red flags that say: do not sign?', 'Чи є червоні прапорці, через які не варто підписувати?'),
        gets: t('A traffic light of risk across seven blocks: registration, management and beneficial owners, sanctions, courts, debts, PEPs, public procurement.', 'Світлофор ризику за 7 блоками: реєстрація, керівники й бенефіціари, санкції, суди, борги, PEP, держзакупівлі.'),
        size: t('1–2 pages · 1–2 working days', '1–2 сторінки · 1–2 робочі дні'),
        sources: t('The Ukrainian state registers of companies, court decisions and debtors, Prozorro; sanctions of the NSDC, OFAC, the EU and the UK, OpenSanctions; YouControl and Opendatabot.', 'ЄДР, ЄДРСР, реєстр боржників, Prozorro; санкції РНБО, OFAC, ЄС і Великої Британії, OpenSanctions; YouControl та Opendatabot.'),
        limits: t('The registers as of a date; not a legal opinion; facts, not judgements of people.', 'Стан реєстрів на дату; не юридичний висновок; факти без оцінок осіб.'),
        parts: [
          [t('Bottom line', 'Bottom line · головне'), t('Proceed, Proceed with conditions, or Do not proceed.', 'Proceed, Proceed with conditions або Do not proceed.')],
          [t('Red-flag grid', 'Red-flag grid · сітка прапорців'), t('Seven blocks, each green, amber or red.', 'Сім блоків — кожен зелений, жовтий чи червоний.')],
          [t('Findings', 'Findings · знахідки'), t('What we found in each block, with the source.', 'Що знайдено в кожному блоці — з джерелом.')],
          [t('Not checked', 'Not checked · не перевірено'), t('What lies outside this check — said plainly.', 'Що лишилося поза цією перевіркою — прямо.')],
          [t('Sources', 'Sources · джерела'), t('Every register and the date its data stands on.', 'Кожен реєстр і дата, станом на яку дані.')],
        ],
      },
      {
        id: 'enhanced-due-diligence',
        name: 'Enhanced Due Diligence',
        level: t('Level 2', 'Рівень 2'),
        who: t('Investors, buyers of a business, partners in a joint project, large contracts.', 'Інвестори, покупці бізнесу, партнери в спільному проєкті, великі контракти.'),
        question: t('Who really stands behind the company, who is it linked to — and what risks do we take on?', 'Хто справді стоїть за компанією, з ким вона пов’язана і які ризики ми беремо на себе?'),
        gets: t('Everything of Level 1, plus a map of links, the history of owners, the tender history, reputation, and a risk assessment with conditions for the deal.', 'Усе з рівня 1 + карта зв’язків, історія власників, тендерна історія, репутація, оцінка ризику з умовами угоди.'),
        size: t('6–10 pages · 5–10 working days', '6–10 сторінок · 5–10 робочих днів'),
        sources: t('As in Level 1, plus the real estate register, foreign registers (OpenCorporates, Companies House), the ICIJ Offshore Leaks, financial statements and stock exchange disclosures.', 'Як рівень 1 + ДРРП, іноземні реєстри (OpenCorporates, Companies House), ICIJ Offshore Leaks, звітність, біржові розкриття.'),
        limits: t('Not a legal or financial audit; links only with documentary proof.', 'Не юридичний і не фінансовий аудит; зв’язки — лише з документальним підтвердженням.'),
        parts: [
          [t('Bottom line', 'Bottom line · головне'), t('The answer and the level of risk, on the first page.', 'Відповідь і рівень ризику — на першій сторінці.')],
          [t('For your decision', 'For your decision · для вашого рішення'), t('The conditions to put in the contract.', 'Умови, які варто закласти в договір.')],
          [t('Ownership & control map', 'Ownership & control map · власність і контроль'), t('The full chain of ownership, across countries.', 'Повний ланцюг власності — через усі країни.')],
          [t('Links & networks', 'Links & networks · зв’язки'), t('People and companies around it — only links with documentary proof.', 'Люди й компанії довкола — лише зв’язки з документальним підтвердженням.')],
          [t('Public contracts', 'Public contracts · держзакупівлі'), t('The history of tenders and contracts.', 'Історія тендерів і контрактів.')],
          [t('Litigation & sanctions', 'Litigation & sanctions · суди й санкції'), t('Court cases, debts and sanctions lists.', 'Судові справи, борги й санкційні списки.')],
          [t('Reputation', 'Reputation · репутація'), t('Media and public history over the years.', 'Історія в медіа та публічному просторі за роки.')],
          [t('Not checked', 'Not checked · не перевірено'), t('What lies outside this check.', 'Що лишилося поза перевіркою.')],
          [t('Sources', 'Sources · джерела'), t('Every source with its grade and date.', 'Кожне джерело з оцінкою й датою.')],
        ],
      },
    ],
  },
};

// What every product shares (the specification's common standards).
export const STANDARDS = [
  [t('Bottom line first', 'Спершу — головне'), t('The answer to your question in two or three sentences, the level of confidence and the date it stands on — on the first page.', 'Відповідь на ваше питання у 2–3 реченнях, рівень довіри й дата — на першій сторінці.')],
  [t('For your decision', 'Для вашого рішення'), t('What to do, and what to weigh.', 'Що робити і на що зважати.')],
  [t('Graded sources', 'Оцінені джерела'), t('Every source graded A1–F6: the reliability of the source (A–F) and the credibility of the information (1–6). The media serve only for dates and the fact of an event, never above C3.', 'Кожне джерело — за шкалою A1–F6: надійність джерела (A–F) × достовірність інформації (1–6). Медіа — лише для дат і факту події, не вище C3.')],
  [t('Probabilities, not adjectives', 'Імовірності, а не прикметники'), t('Percentages to two decimals; words of estimative probability only by a fixed table.', 'Відсотки до сотих; слова оцінної ймовірності — лише за фіксованою таблицею.')],
  [t('A date to check', 'Дата перевірки'), t('Every forecast has a date to check it against; every audit, the date its data stands on.', 'У кожного прогнозу — дата перевірки; в аудиторських продуктах — дата стану даних.')],
  [t('Under NDA, within the law', 'NDA і закон'), t('Checks of people only with a lawful purpose — a deal, a hire, an investment — under data protection law.', 'Перевірка осіб — лише з законною метою (угода, найм, інвестиція) за законом про захист персональних даних.')],
];

export const WORDS = {
  en: { sample: 'Sample', pdf: 'Download PDF', pdfEn: 'English', pdfUk: 'Українська', fromSample: 'Call-outs on the real document. The sample is built on public information only.', products: 'Products', example: 'Example', soon: 'A sample of this product is being prepared. For now — its structure: what each part of the document gives you.', who: 'Who it is for', question: 'The question', gets: 'You get', size: 'Length · turnaround', sources: 'Sources', limits: 'Limits', discuss: 'Discuss a task', other: 'Other services', standards: 'Every product', standardsLead: 'Built to one format: the answer on the first page, then the decision, the reasoning and the sources.' },
  uk: { sample: 'Зразок', pdf: 'Завантажити PDF', pdfEn: 'English', pdfUk: 'Українська', fromSample: 'Виноски — на справжньому документі. Зразок зроблено лише з публічної інформації.', products: 'Продукти', example: 'Приклад', soon: 'Зразок цього продукту готується. Поки що — його структура: що дає кожна частина документа.', who: 'Для кого', question: 'Питання', gets: 'Ви отримуєте', size: 'Обсяг · строк', sources: 'Джерела', limits: 'Межі', discuss: 'Обговорити задачу', other: 'Інші послуги', standards: 'Кожен продукт', standardsLead: 'Один формат: відповідь на першій сторінці, далі рішення, обґрунтування й джерела.' },
};

// Ready samples: the real documents (their pages as pictures, the PDFs to download) with call-outs placed on them.
// marks: [page, x, y] — where each part begins on its page (fractions of the page), one per part, per language.
export const SAMPLES = {
  'verification-note': {
    code: 'VN-001', dir: '/products/vn-001', pages: { en: 2, uk: 2 },
    title: t('Did North Korea steal $6.3 billion from Binance?', 'Чи вкрала Північна Корея $6,3 млрд у Binance?'),
    pdf: { en: '/products/Reaction_VN-001_Binance.pdf', uk: '/products/Reaction_VN-001_Binance_UA.pdf' },
    parts: [
      [t('The claim', 'Твердження'), t('The question, and the claim word for word as it spread — with its variants.', 'Питання й саме твердження дослівно, як воно поширювалося, — разом із варіантами.')],
      [t('Verdict and probability', 'Вердикт і ймовірність'), t('One of four verdicts on the core claim, the probability and the confidence — and why it is not 100%.', 'Один із чотирьох вердиктів щодо основного твердження, ймовірність і рівень довіри — і чому не 100%.')],
      [t('For your decision', 'Для вашого рішення'), t('What to do about it: what to screen, where the attack came in, your exposure.', 'Що з цим робити: що перевіряти, звідки прийшла атака, ваша вразливість.')],
      [t('What we checked, part by part', 'Що ми перевірили, по частинах'), t('Each part of the claim gets its own verdict and basis — two popular variants turn out wrong.', 'Кожна частина твердження — з власним вердиктом і підставою; дві поширені версії виявляються хибними.')],
      [t('How it unfolded', 'Як це розгорталося'), t('The timeline of the attack, from preparation to attribution.', 'Хронологія атаки — від підготовки до атрибуції.')],
      [t('Evidence for and against', 'Докази за і проти'), t('The evidence for the attribution, numbered — and what speaks against it.', 'Пронумеровані докази на користь атрибуції — і що свідчить проти.')],
      [t('What remains open', 'Що лишається відкритим'), t('What the sources cannot yet show.', 'Чого джерела поки показати не можуть.')],
      [t('What would change the verdict', 'Що змінило б вердикт'), t('The signal that would move the verdict — and whether it has been seen.', 'Сигнал, що змінив би вердикт, — і чи його вже видно.')],
      [t('Sources', 'Джерела'), t('Every source with its date and its grade on the A1–F6 scale.', 'Кожне джерело — з датою й оцінкою за шкалою A1–F6.')],
    ],
    marks: {
      en: [[0, 0.071, 0.099], [0, 0.089, 0.243], [0, 0.089, 0.439], [0, 0.071, 0.581], [1, 0.071, 0.079], [1, 0.089, 0.226], [1, 0.524, 0.315], [1, 0.089, 0.476], [1, 0.071, 0.553]],
      uk: [[0, 0.071, 0.099], [0, 0.089, 0.243], [0, 0.089, 0.452], [0, 0.071, 0.61], [1, 0.071, 0.079], [1, 0.089, 0.226], [1, 0.524, 0.331], [1, 0.089, 0.492], [1, 0.071, 0.585]],
    },
  },
  'counterparty-screening': {
    code: 'CS-001', dir: '/products/cs-001', pages: { en: 2, uk: 2 },
    title: t('Jaguar Land Rover Limited', 'Jaguar Land Rover Limited'),
    pdf: { en: '/products/Reaction_CS-001_Jaguar_Land_Rover.pdf', uk: '/products/Reaction_CS-001_Jaguar_Land_Rover_UA.pdf' },
    parts: [
      [t('The company and the purpose', 'Компанія й мета перевірки'), t('Who is checked, by the register — and why: the deal the check is for.', 'Кого перевіряємо за реєстром — і навіщо: угода, для якої перевірка.')],
      [t('Bottom line', 'Головне'), t('Proceed, Proceed with conditions or Do not proceed — with the grid in one line.', 'Proceed, Proceed with conditions або Do not proceed — і підсумок таблиці одним рядком.')],
      [t('Conditions to proceed', 'Умови для співпраці'), t('What to put in the contract and in your insurance before signing.', 'Що закласти в договір і страховку до підписання.')],
      [t('Red-flag grid', 'Таблиця ризиків'), t('Every area — Clear, Note, Flag or Not run — with the finding and its source.', 'Кожна сфера — Clear, Note, Flag або Not run — з висновком і джерелом.')],
      [t('Findings', 'Факти'), t('The facts behind the flags, numbered, each with its source.', 'Факти за прапорцями — пронумеровані, кожен із джерелом.')],
      [t('Not checked · Scope', 'Не перевірено · Обсяг'), t('What lies outside this check, said plainly — and what was in it.', 'Що лишилося поза перевіркою — прямо, і що в неї входило.')],
      [t('Sources', 'Джерела'), t('Every register and report, with its date and grade.', 'Кожен реєстр і звіт — з датою й оцінкою.')],
    ],
    marks: {
      en: [[0, 0.071, 0.099], [0, 0.089, 0.185], [0, 0.089, 0.39], [0, 0.071, 0.535], [1, 0.071, 0.079], [1, 0.089, 0.319], [1, 0.071, 0.5]],
      uk: [[0, 0.071, 0.099], [0, 0.089, 0.185], [0, 0.089, 0.393], [0, 0.071, 0.553], [1, 0.071, 0.079], [1, 0.089, 0.35], [1, 0.071, 0.525]],
    },
  },
  'country-market-risk-brief': {
    code: 'CR-001', dir: '/products/cr-001', pages: { en: 4, uk: 4 },
    title: t('Poland 2027: strong economy, weak public finances, an election in the autumn', 'Польща 2027: сильна економіка, слабкі публічні фінанси, вибори восени'),
    pdf: { en: '/products/Reaction_CR-001_Poland_2027.pdf', uk: '/products/Reaction_CR-001_Poland_2027_UA.pdf' },
    parts: [
      [t('The question and the client', 'Питання й клієнт'), t('The market, the horizon and who the brief is prepared for.', 'Ринок, горизонт і для кого підготовлено огляд.')],
      [t('Key figures', 'Ключові цифри'), t('Four numbers that set the scene, each with its source.', 'Чотири цифри, що задають картину, — кожна з джерелом.')],
      [t('Bottom line', 'Головне'), t('Where the risk is and where it is not, with the base case and the main downside.', 'Де ризик є і де його немає — з базовим сценарієм і головним негативним.')],
      [t('Scenarios at a glance', 'Сценарії коротко'), t('Three scenarios with probabilities to two decimals, summing to 100%.', 'Три сценарії з імовірностями до сотих, що разом дають 100%.')],
      [t('For your decision', 'Для вашого рішення'), t('What to do: timing, hedging, the trigger to review.', 'Що робити: терміни, хеджування, тригер для перегляду.')],
      [t('Key judgements', 'Ключові судження'), t('The four judgements the assessment rests on.', 'Чотири судження, на яких тримається оцінка.')],
      [t('Risk scorecard', 'Шкала ризиків'), t('Every area on a 1–5 scale, with its trend and why.', 'Кожна сфера за шкалою 1–5 — з напрямком і поясненням.')],
      [t('Key data and ratings', 'Ключові дані й рейтинги'), t('The indicators for three years and every sovereign rating with its last action.', 'Показники за три роки й кожен суверенний рейтинг з останньою дією.')],
      [t('Security context', 'Безпековий контекст'), t('What a company on the ground should know — open-source context, not a threat assessment.', 'Що варто знати компанії на місці, — контекст із відкритих джерел, не оцінка загроз.')],
      [t('Scenarios in detail', 'Сценарії докладно'), t('What happens, why this probability, what it means for you — for each scenario.', 'Що відбувається, чому така ймовірність, що це означає для вас — для кожного сценарію.')],
      [t('Outside the scenarios', 'Поза сценаріями'), t('What would override all three — tracked, not given a probability.', 'Що перекреслило б усі три, — відстежується, без імовірності.')],
      [t('Signal panel', 'Сигнальна панель'), t('Each signal: where it is now, its threshold, the scenario it points to.', 'Кожен сигнал: де він зараз, його поріг і сценарій, на який він вказує.')],
      [t('Calendar', 'Календар'), t('The dates in the year ahead that can move the picture.', 'Дати наступного року, що можуть змінити картину.')],
      [t('Sources', 'Джерела'), t('Every source with its date and grade.', 'Кожне джерело — з датою й оцінкою.')],
    ],
    marks: {
      en: [[0, 0.071, 0.099], [0, 0.087, 0.19], [0, 0.089, 0.287], [0, 0.089, 0.415], [0, 0.567, 0.415], [0, 0.089, 0.61], [1, 0.071, 0.079], [1, 0.071, 0.36], [1, 0.089, 0.588], [2, 0.071, 0.079], [2, 0.089, 0.617], [3, 0.071, 0.079], [3, 0.071, 0.339], [3, 0.071, 0.456]],
      uk: [[0, 0.071, 0.099], [0, 0.087, 0.19], [0, 0.089, 0.298], [0, 0.089, 0.427], [0, 0.567, 0.427], [0, 0.089, 0.654], [1, 0.071, 0.079], [1, 0.071, 0.377], [1, 0.089, 0.654], [2, 0.071, 0.079], [2, 0.089, 0.654], [3, 0.071, 0.079], [3, 0.071, 0.351], [3, 0.071, 0.483]],
    },
  },
};
