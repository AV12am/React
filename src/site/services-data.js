// The three services and their products — for the service pages (/osint, /risk, /due-diligence; src/site/services.js).
// Each product: what it is, when it is needed, the format, and its parts — the parts are the numbered call-outs on the
// sample. `sample` is the product's real example (pictures of its pages) once one is ready; until then the page
// shows the product's structure.
// Texts: English and Ukrainian (the other site languages show the English).

export const SERVICES = {
  osint: {
    path: '/osint',
    k: { en: 'OPEN-SOURCE INTELLIGENCE', uk: 'РОЗВІДКА З ВІДКРИТИХ ДЖЕРЕЛ' },
    title: { en: 'Open sources, verified and brought together.', uk: 'Відкриті джерела — перевірені й зведені в одну картину.' },
    lead: {
      en: 'Media, registries, social networks, satellite imagery and official documents — collected, checked against each other and rated for reliability. You get facts with their sources, not a pile of links.',
      uk: 'Медіа, реєстри, соцмережі, супутникові знімки й офіційні документи — зібрані, звірені між собою й оцінені за надійністю. Ви отримуєте факти з джерелами, а не купу посилань.',
    },
    products: [
      {
        id: 'verification-note',
        name: 'Verification Note',
        line: { en: 'Is it true? One claim, video, document or image checked against open sources.', uk: 'Чи це правда? Перевірка одного твердження, відео, документа чи зображення за відкритими джерелами.' },
        when: { en: 'Before you react to a report, publish it or act on it.', uk: 'Перш ніж реагувати на повідомлення, публікувати його чи діяти на його підставі.' },
        format: { en: '1–3 pages', uk: '1–3 сторінки' },
        parts: [
          [{ en: 'The claim', uk: 'Твердження' }, { en: 'What exactly is being checked, word for word, with where and when it appeared.', uk: 'Що саме перевіряємо — дослівно, де й коли воно з’явилося.' }],
          [{ en: 'Verdict and confidence', uk: 'Висновок і впевненість' }, { en: 'Confirmed, refuted or unproven — with a stated level of confidence.', uk: 'Підтверджено, спростовано чи не доведено — з указаним рівнем упевненості.' }],
          [{ en: 'Evidence trail', uk: 'Ланцюжок доказів' }, { en: 'Each step of the check, every source rated for reliability (A–F).', uk: 'Кожен крок перевірки, кожне джерело — з оцінкою надійності (A–F).' }],
          [{ en: 'What remains unknown', uk: 'Що лишається невідомим' }, { en: 'The gaps, said plainly — what the sources cannot show.', uk: 'Прогалини, названі прямо, — чого джерела показати не можуть.' }],
          [{ en: 'Sources and archives', uk: 'Джерела й архіви' }, { en: 'Links with archived copies, so the evidence survives deletion.', uk: 'Посилання з архівними копіями, щоб докази не зникли разом з оригіналом.' }],
        ],
      },
      {
        id: 'situation-profile',
        name: 'Situation Profile',
        line: { en: 'A structured picture of a place, an event or an actor: who, what, where and why it matters.', uk: 'Структурована картина місця, події чи учасника: хто, що, де і чому це важливо.' },
        when: { en: 'When you need to understand a situation fast and in depth.', uk: 'Коли потрібно швидко й ґрунтовно зрозуміти ситуацію.' },
        format: { en: '8–15 pages', uk: '8–15 сторінок' },
        parts: [
          [{ en: 'The situation in brief', uk: 'Ситуація коротко' }, { en: 'The main points on one page — for those who read only that.', uk: 'Головне на одній сторінці — для тих, хто прочитає лише її.' }],
          [{ en: 'Actors and links', uk: 'Учасники й зв’язки' }, { en: 'Who is involved, their interests and how they are connected.', uk: 'Хто залучений, які в них інтереси й як вони пов’язані.' }],
          [{ en: 'Timeline', uk: 'Хронологія' }, { en: 'The key events in order, each with its source.', uk: 'Ключові події по порядку, кожна — з джерелом.' }],
          [{ en: 'Map', uk: 'Карта' }, { en: 'Where it happens: places, routes, areas of control.', uk: 'Де це відбувається: місця, маршрути, зони контролю.' }],
          [{ en: 'Outlook and indicators', uk: 'Перспектива й індикатори' }, { en: 'How it may develop, and the signs that will show which way.', uk: 'Як це може розвиватися і за якими ознаками буде видно, куди саме.' }],
        ],
      },
      {
        id: 'weekly-monitor',
        name: 'Weekly Monitor',
        line: { en: 'A regular digest on your topic: what changed this week and what to watch next.', uk: 'Регулярний огляд вашої теми: що змінилося за тиждень і на що зважати далі.' },
        when: { en: 'When a topic matters to you every week, not once.', uk: 'Коли тема важлива для вас щотижня, а не один раз.' },
        format: { en: 'Weekly, 4–6 pages', uk: 'Щотижня, 4–6 сторінок' },
        parts: [
          [{ en: 'The week at a glance', uk: 'Тиждень одним поглядом' }, { en: 'The three to five things that changed most.', uk: 'Три–п’ять речей, що змінилися найбільше.' }],
          [{ en: 'Key developments', uk: 'Ключові події' }, { en: 'What happened, why it matters, and the sources.', uk: 'Що сталося, чому це важливо, і джерела.' }],
          [{ en: 'Signals and trends', uk: 'Сигнали й тенденції' }, { en: 'Small changes that add up — tracked from week to week.', uk: 'Невеликі зміни, що складаються в тенденцію, — від тижня до тижня.' }],
          [{ en: 'Watch next week', uk: 'Що відстежувати далі' }, { en: 'Dates, decisions and events coming up.', uk: 'Дати, рішення й події, що попереду.' }],
        ],
      },
    ],
  },
  risk: {
    path: '/risk',
    k: { en: 'RISK ANALYSIS', uk: 'АНАЛІЗ РИЗИКІВ' },
    title: { en: 'Know the risks before they reach you.', uk: 'Знати ризики раніше, ніж вони вас торкнуться.' },
    lead: {
      en: 'Political, economic and security factors for the countries, markets, sites and projects you work with — assessed with probabilities, scenarios and the signs to watch.',
      uk: 'Політичні, економічні й безпекові чинники для країн, ринків, об’єктів і проєктів, з якими ви працюєте, — з імовірностями, сценаріями й ознаками, за якими варто стежити.',
    },
    products: [
      {
        id: 'country-market-risk-brief',
        name: 'Country & Market Risk Brief',
        line: { en: 'The risks of a country or a market for your business or mission.', uk: 'Ризики країни чи ринку для вашого бізнесу або місії.' },
        when: { en: 'Before entering a market, investing or planning operations.', uk: 'Перед виходом на ринок, інвестицією чи плануванням діяльності.' },
        format: { en: '6–10 pages', uk: '6–10 сторінок' },
        parts: [
          [{ en: 'Risk rating at a glance', uk: 'Рейтинг ризиків одним поглядом' }, { en: 'Each risk area with its level and its trend.', uk: 'Кожна сфера ризику — з рівнем і напрямком змін.' }],
          [{ en: 'Political and security factors', uk: 'Політичні й безпекові чинники' }, { en: 'Stability, conflict, the rule of law.', uk: 'Стабільність, конфлікти, верховенство права.' }],
          [{ en: 'Economic and regulatory factors', uk: 'Економічні й регуляторні чинники' }, { en: 'Markets, currency, sanctions, regulation.', uk: 'Ринки, валюта, санкції, регулювання.' }],
          [{ en: 'Scenarios', uk: 'Сценарії' }, { en: 'How things may go, each with a probability and a date to check it.', uk: 'Як можуть розвиватися події — кожен сценарій з імовірністю й датою перевірки.' }],
          [{ en: 'Recommendations', uk: 'Рекомендації' }, { en: 'What to do about it, in plain words.', uk: 'Що з цим робити — простими словами.' }],
        ],
      },
      {
        id: 'site-project-risk-assessment',
        name: 'Site & Project Risk Assessment',
        line: { en: 'The risks of a specific site, route or project: security, infrastructure, local actors.', uk: 'Ризики конкретного об’єкта, маршруту чи проєкту: безпека, інфраструктура, місцеві учасники.' },
        when: { en: 'Before you build, move people or goods, or open a site.', uk: 'Перш ніж будувати, переміщувати людей чи вантажі або відкривати об’єкт.' },
        format: { en: '10–20 pages, with maps', uk: '10–20 сторінок, з картами' },
        parts: [
          [{ en: 'The site and its surroundings', uk: 'Об’єкт і його оточення' }, { en: 'The location on a map, access and infrastructure.', uk: 'Розташування на карті, під’їзди й інфраструктура.' }],
          [{ en: 'Threats and vulnerabilities', uk: 'Загрози й вразливості' }, { en: 'What could happen here, and what makes the site exposed.', uk: 'Що тут може статися і що робить об’єкт уразливим.' }],
          [{ en: 'Local actors', uk: 'Місцеві учасники' }, { en: 'Authorities, businesses and communities that matter.', uk: 'Влада, бізнес і громади, що мають значення.' }],
          [{ en: 'Risk matrix', uk: 'Матриця ризиків' }, { en: 'Each risk by likelihood and impact.', uk: 'Кожен ризик — за ймовірністю й наслідками.' }],
          [{ en: 'Mitigation', uk: 'Заходи' }, { en: 'Measures that lower each risk, in order of priority.', uk: 'Що знижує кожен ризик — у порядку пріоритету.' }],
        ],
      },
      {
        id: 'risk-watchlist',
        name: 'Risk Watchlist',
        line: { en: 'Continuous watch over the risks you care about, with an alert when something moves.', uk: 'Постійне стеження за ризиками, що важливі для вас, із сигналом, коли щось змінюється.' },
        when: { en: 'When the risks are known and you need to see them change in time.', uk: 'Коли ризики відомі й треба вчасно побачити, як вони змінюються.' },
        format: { en: 'Ongoing, with updates and alerts', uk: 'Постійно, з оновленнями й сигналами' },
        parts: [
          [{ en: 'Watched risks', uk: 'Ризики під наглядом' }, { en: 'Each risk with its current level.', uk: 'Кожен ризик — з поточним рівнем.' }],
          [{ en: 'What changed', uk: 'Що змінилося' }, { en: 'Since the last update, and why.', uk: 'Від попереднього оновлення — і чому.' }],
          [{ en: 'Early-warning indicators', uk: 'Індикатори раннього попередження' }, { en: 'The signs that a risk is about to grow.', uk: 'Ознаки того, що ризик ось-ось зросте.' }],
          [{ en: 'Alerts', uk: 'Сигнали' }, { en: 'When a threshold is crossed, you hear about it at once.', uk: 'Коли поріг перейдено, ви дізнаєтеся про це одразу.' }],
        ],
      },
    ],
  },
  dd: {
    path: '/due-diligence',
    k: { en: 'DUE DILIGENCE', uk: 'ПЕРЕВІРКА КОНТРАГЕНТІВ' },
    title: { en: 'Know who you are dealing with.', uk: 'Знати, з ким маєте справу.' },
    lead: {
      en: 'Owners, links, tenders, courts and sanctions — from state registries and open sources, checked before you sign, pay or partner.',
      uk: 'Власники, зв’язки, тендери, суди й санкції — з державних реєстрів і відкритих джерел, перевірені до того, як ви підпишете, заплатите чи станете партнерами.',
    },
    products: [
      {
        id: 'counterparty-screening',
        name: 'Counterparty Screening',
        line: { en: 'A quick check of a company or a person before a deal: registries, sanctions, courts, media.', uk: 'Швидка перевірка компанії чи особи перед угодою: реєстри, санкції, суди, медіа.' },
        when: { en: 'Before a contract, a payment or onboarding a supplier.', uk: 'Перед договором, платежем чи прийняттям постачальника.' },
        format: { en: '2–4 pages', uk: '2–4 сторінки' },
        parts: [
          [{ en: 'Identity and registration', uk: 'Ідентифікація й реєстрація' }, { en: 'Who they are by the state registry: codes, address, status.', uk: 'Хто це за державним реєстром: коди, адреса, стан.' }],
          [{ en: 'Owners and beneficiaries', uk: 'Власники й бенефіціари' }, { en: 'Who stands behind the company.', uk: 'Хто стоїть за компанією.' }],
          [{ en: 'Sanctions and lists', uk: 'Санкції й списки' }, { en: 'Ukrainian, EU, US and UN lists.', uk: 'Списки України, ЄС, США й ООН.' }],
          [{ en: 'Courts and debts', uk: 'Суди й борги' }, { en: 'Cases, enforcement proceedings, tax debts.', uk: 'Справи, виконавчі провадження, податкові борги.' }],
          [{ en: 'Red flags', uk: 'Червоні прапорці' }, { en: 'What needs attention — and what is clean.', uk: 'Що потребує уваги — і що чисто.' }],
        ],
      },
      {
        id: 'enhanced-due-diligence',
        name: 'Enhanced Due Diligence',
        line: { en: 'An in-depth investigation: ownership chains, links, reputation and hidden risks.', uk: 'Поглиблене розслідування: ланцюги власності, зв’язки, репутація й приховані ризики.' },
        when: { en: 'Before a major deal, an investment or a strategic partnership.', uk: 'Перед великою угодою, інвестицією чи стратегічним партнерством.' },
        format: { en: '15–30 pages, with a link map', uk: '15–30 сторінок, з картою зв’язків' },
        parts: [
          [{ en: 'Corporate structure', uk: 'Корпоративна структура' }, { en: 'The full ownership chain, across countries.', uk: 'Повний ланцюг власності — через усі країни.' }],
          [{ en: 'Map of links', uk: 'Карта зв’язків' }, { en: 'People and companies around the subject, and how they connect.', uk: 'Люди й компанії довкола об’єкта перевірки і як вони пов’язані.' }],
          [{ en: 'Financial footprint', uk: 'Фінансовий слід' }, { en: 'Tenders, assets, financial statements.', uk: 'Тендери, активи, фінансова звітність.' }],
          [{ en: 'Reputation', uk: 'Репутація' }, { en: 'Media and court history over the years.', uk: 'Історія в медіа й судах за роки.' }],
          [{ en: 'Conclusion and risk level', uk: 'Висновок і рівень ризику' }, { en: 'A clear judgement with the evidence behind it.', uk: 'Чітке судження — і докази, на яких воно тримається.' }],
        ],
      },
    ],
  },
};

export const WORDS = {
  en: { products: 'Products', example: 'Example', soon: 'A sample of this product will appear here soon. For now — its structure: what each part of the document gives you.', when: 'When it is needed', format: 'Format', discuss: 'Discuss a task', other: 'Other services', parts: 'What is inside' },
  uk: { products: 'Продукти', example: 'Приклад', soon: 'Приклад цього продукту незабаром з’явиться тут. Поки що — його структура: що дає кожна частина документа.', when: 'Коли потрібен', format: 'Формат', discuss: 'Обговорити задачу', other: 'Інші послуги', parts: 'Що всередині' },
};
