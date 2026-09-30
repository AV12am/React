// Workspaces: each division gets its own registers with their own fields, stages and views.
// Pure data — the Workspace view builds boards, tables and forms from it.
//
// Field types: text · longtext · select · date · number · percent · url · user · file (from the Vault)
//              · ref (a record of another register in the same division) · coords (lat, lon or MGRS)
//              · links (several records of the registers in `refs`, any division — the «звідки ми це знаємо» chain).
// `hidden` fields are kept on the record but not shown in forms (set by the system).
// `views` add tabs with their own screens (see Workspace.jsx VIEWS).
// A register with `stages` is shown as a board (a column per stage); without — as a table.
// `title` names the field used as the record's heading; `list` fields show on cards and in tables.

const PRIORITY = { id: 'priority', label: 'Пріоритет', type: 'select', list: true, options: ['Критичний', 'Високий', 'Середній', 'Низький'] };

// NATO / Admiralty grading: source reliability (A–F) and information credibility (1–6).
export const RELIABILITY = [
  'A — повністю надійне', 'B — зазвичай надійне', 'C — досить надійне',
  'D — зазвичай ненадійне', 'E — ненадійне', 'F — не можна оцінити',
];
export const CREDIBILITY = [
  '1 — підтверджено іншими джерелами', '2 — імовірно правдиве', '3 — можливо правдиве',
  '4 — сумнівне', '5 — малоймовірне', '6 — не можна оцінити',
];
export const OUTCOMES = ['Відкрито', 'Сталося', 'Не сталося', 'Скасовано'];
export const WATCH_KINDS = ['Медіа', 'Контрагенти й санкції'];
export const SOURCE_CLASSES = ['OSINT', 'SOCMINT', 'HUMINT', 'SIGINT', 'GEOINT', 'IMINT', 'FININT', 'TECHINT'];

export const WORKSPACES = {
  it: {
    tagline: 'Розробка й підтримка внутрішніх систем',
    registers: [
      {
        id: 'projects', name: 'Проєкти', one: 'проєкт', icon: 'cpu', title: 'name', level: 1,
        stages: ['Ідея', 'Планування', 'Розробка', 'Тестування', 'Реліз', 'Підтримка'],
        fields: [
          { id: 'name', label: 'Назва', type: 'text', required: true },
          { id: 'about', label: 'Опис', type: 'longtext' },
          { id: 'lead', label: 'Відповідальний', type: 'user', list: true },
          PRIORITY,
          { id: 'progress', label: 'Готовність', type: 'percent', list: true },
          { id: 'deadline', label: 'Дедлайн', type: 'date', list: true },
          { id: 'stack', label: 'Стек', type: 'text' },
          { id: 'repo', label: 'Репозиторій', type: 'url' },
          { id: 'spec', label: 'Документація', type: 'file' },
        ],
      },
      {
        id: 'tickets', name: 'Заявки', one: 'заявку', icon: 'bell', title: 'title', level: 0,
        stages: ['Нова', 'В роботі', 'Очікує', 'Вирішено'],
        fields: [
          { id: 'title', label: 'Суть', type: 'text', required: true },
          { id: 'category', label: 'Категорія', type: 'select', list: true, options: ['Доступ', 'Обладнання', 'Програмне забезпечення', 'Мережа', 'Інше'] },
          PRIORITY,
          { id: 'requester', label: 'Заявник', type: 'user', list: true },
          { id: 'assignee', label: 'Виконавець', type: 'user' },
          { id: 'due', label: 'Термін', type: 'date', list: true },
          { id: 'details', label: 'Подробиці', type: 'longtext' },
        ],
      },
    ],
  },

  int: {
    tagline: 'Джерела, їх оцінка й цикл опрацювання',
    registers: [
      {
        id: 'intake', name: 'Опрацювання', one: 'надходження', icon: 'layers', title: 'title', level: 1,
        stages: ['Надійшло', 'Оцінка', 'Верифікація', 'Аналіз', 'Звіт готовий', 'Архів'],
        fields: [
          { id: 'title', label: 'Суть', type: 'text', required: true },
          { id: 'source', label: 'Джерело', type: 'ref', ref: 'sources', list: true },
          { id: 'credibility', label: 'Достовірність', type: 'select', list: true, options: CREDIBILITY },
          { id: 'received', label: 'Отримано', type: 'date', list: true },
          { id: 'method', label: 'Методика', type: 'ref', ref: 'methods' },
          { id: 'assignee', label: 'Аналітик', type: 'user', list: true },
          { id: 'where', label: 'Місце', type: 'coords' },
          { id: 'summary', label: 'Зміст і висновок', type: 'longtext' },
          { id: 'url', label: 'Посилання', type: 'url' },
          { id: 'watchlist', label: 'Список спостереження', type: 'ref', ref: 'watchlists' },
          { id: 'file', label: 'Матеріал', type: 'file' },
          { id: 'fingerprint', type: 'hidden', hidden: true },
          { id: 'origin', type: 'hidden', hidden: true },
        ],
      },
      {
        id: 'sources', name: 'Джерела', one: 'джерело', icon: 'compass', title: 'name', level: 1,
        fields: [
          { id: 'name', label: 'Позначення', type: 'text', required: true, hint: 'Умовне позначення, не справжнє ім’я' },
          { id: 'class', label: 'Клас', type: 'select', list: true, options: SOURCE_CLASSES },
          { id: 'reliability', label: 'Надійність', type: 'select', list: true, options: RELIABILITY },
          { id: 'access', label: 'Доступ до інформації', type: 'select', list: true, options: ['Прямий', 'Опосередкований', 'Відкриті дані'] },
          { id: 'state', label: 'Стан', type: 'select', list: true, options: ['Активне', 'На перевірці', 'Призупинене', 'Закрите'] },
          { id: 'handler', label: 'Куратор', type: 'user' },
          { id: 'notes', label: 'Примітки', type: 'longtext' },
        ],
        // HUMINT identifies people: it opens at NOX by default.
        levelFor: (v) => (v.class === 'HUMINT' ? 2 : null),
      },
      {
        id: 'methods', name: 'Методики', one: 'методику', icon: 'book', title: 'name', level: 0,
        fields: [
          { id: 'name', label: 'Назва', type: 'text', required: true },
          { id: 'class', label: 'Для класу джерел', type: 'select', list: true, options: SOURCE_CLASSES },
          { id: 'tools', label: 'Інструменти', type: 'text', list: true },
          { id: 'steps', label: 'Порядок опрацювання', type: 'longtext' },
          { id: 'file', label: 'Методичка', type: 'file' },
        ],
      },
      {
        // What the conveyor watches in open sources (api/watch.js). The list itself shows the company's interests: UMBRA.
        id: 'watchlists', name: 'Списки спостереження', one: 'список', icon: 'eye', title: 'name', level: 1,
        fields: [
          { id: 'name', label: 'Назва', type: 'text', required: true },
          { id: 'kind', label: 'Що шукати', type: 'select', list: true, required: true, options: WATCH_KINDS },
          { id: 'terms', label: 'Об’єкти й фрази', type: 'longtext', required: true, hint: 'По одному на рядок. Медіа: назва або фраза. Контрагенти: назва компанії; код (ЄДРПОУ, реєстраційний) — через «;», напр. «ТОВ Ромашка; 12345678».' },
          { id: 'feeds', label: 'Додаткові RSS-стрічки', type: 'longtext', hint: 'Адреси RSS по одній на рядок (необов’язково, лише для «Медіа»).' },
          { id: 'state', label: 'Стан', type: 'select', list: true, options: ['Активний', 'Призупинений'] },
          { id: 'owner', label: 'Відповідальний', type: 'user', list: true },
          { id: 'lastRun', type: 'hidden', hidden: true },
          { id: 'lastFound', type: 'hidden', hidden: true },
        ],
      },
    ],
    views: [{ id: 'watch', name: 'Конвеєр' }],
  },

  ana: {
    tagline: 'Аналітичні продукти від чернетки до видачі',
    registers: [
      {
        id: 'products', name: 'Продукти', one: 'продукт', icon: 'chart', title: 'title', level: 1,
        stages: ['Чернетка', 'Рецензія', 'Затверджено', 'Видано'],
        fields: [
          { id: 'title', label: 'Назва', type: 'text', required: true },
          { id: 'kind', label: 'Тип', type: 'select', list: true, options: ['Оцінка', 'Довідка', 'Прогноз', 'Бриф', 'Звіт'] },
          { id: 'customer', label: 'Замовник', type: 'text', list: true },
          { id: 'confidence', label: 'Рівень упевненості', type: 'select', list: true, options: ['Низький', 'Помірний', 'Високий'] },
          { id: 'analyst', label: 'Аналітик', type: 'user', list: true },
          { id: 'due', label: 'Термін', type: 'date', list: true },
          { id: 'questions', label: 'Ключові питання', type: 'longtext' },
          { id: 'basis', label: 'Підстави — звідки ми це знаємо', type: 'links', refs: [['int', 'intake'], ['int', 'sources']] },
          { id: 'file', label: 'Документ', type: 'file' },
        ],
      },
      {
        // Key judgments: each with a probability and its basis. A «Прогноз» is checked on its date — that feeds calibration.
        id: 'judgments', name: 'Судження', one: 'судження', icon: 'target', title: 'statement', level: 1,
        fields: [
          { id: 'statement', label: 'Судження', type: 'text', required: true, hint: 'Одне речення, яке можна перевірити: що, де, до коли.' },
          { id: 'product', label: 'Продукт', type: 'ref', ref: 'products', list: true },
          { id: 'kind', label: 'Тип', type: 'select', list: true, required: true, options: ['Оцінка', 'Прогноз'] },
          { id: 'probability', label: 'Ймовірність', type: 'percent', list: true, required: true },
          { id: 'confidence', label: 'Упевненість', type: 'select', list: true, options: ['Низька', 'Помірна', 'Висока'] },
          { id: 'due', label: 'Дата перевірки', type: 'date', list: true, hint: 'Для прогнозу: коли стане відомо, чи справдився.' },
          { id: 'outcome', label: 'Результат', type: 'select', list: true, options: OUTCOMES },
          { id: 'analyst', label: 'Аналітик', type: 'user', list: true },
          { id: 'basis', label: 'Підстави — звідки ми це знаємо', type: 'links', refs: [['int', 'intake'], ['int', 'sources']] },
          { id: 'notes', label: 'Міркування', type: 'longtext' },
          { id: 'resolvedAt', type: 'hidden', hidden: true },
          { id: 'resolvedBy', type: 'hidden', hidden: true },
          { id: 'reviewed', type: 'hidden', hidden: true },
        ],
      },
      {
        // Signposts: when one is observed, the judgment it belongs to is flagged for review.
        id: 'indicators', name: 'Індикатори', one: 'індикатор', icon: 'bell', title: 'name', level: 1,
        fields: [
          { id: 'name', label: 'Індикатор', type: 'text', required: true, hint: 'Спостережувана подія: «оголошено тендер на …», «порт закрито понад 3 доби».' },
          { id: 'judgment', label: 'Судження', type: 'ref', ref: 'judgments', list: true, required: true },
          { id: 'effect', label: 'Якщо спостерігається', type: 'select', list: true, options: ['Підтримує судження', 'Послаблює судження'] },
          { id: 'state', label: 'Стан', type: 'select', list: true, options: ['Не спостерігається', 'Спостерігається'] },
          { id: 'observed', label: 'Коли помічено', type: 'date', list: true },
          { id: 'evidence', label: 'Що це показало', type: 'links', refs: [['int', 'intake']] },
          { id: 'owner', label: 'Хто стежить', type: 'user' },
        ],
      },
    ],
    views: [{ id: 'review', name: 'Перегляд' }, { id: 'forecasts', name: 'Прогнози й калібрування' }],
  },

  sec: {
    tagline: 'Інциденти, перевірки, захист периметра',
    registers: [
      {
        id: 'incidents', name: 'Інциденти', one: 'інцидент', icon: 'shield', title: 'title', level: 1,
        stages: ['Виявлено', 'Аналіз', 'Локалізовано', 'Усунено', 'Закрито'],
        fields: [
          { id: 'title', label: 'Суть', type: 'text', required: true },
          { id: 'severity', label: 'Критичність', type: 'select', list: true, options: ['Критична', 'Висока', 'Середня', 'Низька'] },
          { id: 'system', label: 'Система', type: 'text', list: true },
          { id: 'detected', label: 'Виявлено', type: 'date', list: true },
          { id: 'owner', label: 'Відповідальний', type: 'user', list: true },
          { id: 'details', label: 'Хронологія й заходи', type: 'longtext' },
          { id: 'file', label: 'Звіт', type: 'file' },
        ],
      },
      {
        id: 'audits', name: 'Перевірки', one: 'перевірку', icon: 'check', title: 'name', level: 1,
        fields: [
          { id: 'name', label: 'Назва', type: 'text', required: true },
          { id: 'scope', label: 'Обсяг', type: 'text', list: true },
          { id: 'date', label: 'Дата', type: 'date', list: true },
          { id: 'result', label: 'Результат', type: 'select', list: true, options: ['Заплановано', 'Без зауважень', 'Є зауваження', 'Критичні вади'] },
          { id: 'findings', label: 'Зауважень', type: 'number', list: true },
          { id: 'file', label: 'Звіт', type: 'file' },
        ],
      },
    ],
  },

  ops: {
    tagline: 'Маршрути, постачальники, поставки',
    registers: [
      {
        id: 'routes', name: 'Маршрути', one: 'маршрут', icon: 'map', title: 'name', level: 1,
        fields: [
          { id: 'name', label: 'Назва', type: 'text', required: true },
          { id: 'from', label: 'Звідки', type: 'text', list: true },
          { id: 'fromAt', label: 'Координати початку', type: 'coords' },
          { id: 'to', label: 'Куди', type: 'text', list: true },
          { id: 'toAt', label: 'Координати кінця', type: 'coords' },
          { id: 'transport', label: 'Транспорт', type: 'select', list: true, options: ['Авто', 'Залізниця', 'Авіа', 'Морем', 'Змішаний'] },
          { id: 'schedule', label: 'Графік', type: 'text', list: true },
          { id: 'state', label: 'Стан', type: 'select', list: true, options: ['Планується', 'Діє', 'Призупинено', 'Архів'] },
          { id: 'owner', label: 'Відповідальний', type: 'user' },
          { id: 'notes', label: 'Примітки', type: 'longtext' },
        ],
      },
      {
        id: 'suppliers', name: 'Постачальники', one: 'постачальника', icon: 'truck', title: 'name', level: 1,
        fields: [
          { id: 'name', label: 'Назва', type: 'text', required: true },
          { id: 'category', label: 'Категорія', type: 'select', list: true, options: ['Транспорт', 'Зв’язок', 'Обладнання', 'Паливо', 'Харчування', 'Послуги', 'Інше'] },
          { id: 'contact', label: 'Контактна особа', type: 'text', list: true },
          { id: 'phone', label: 'Телефон', type: 'text' },
          { id: 'email', label: 'Пошта', type: 'text' },
          { id: 'contract', label: 'Договір до', type: 'date', list: true },
          { id: 'rating', label: 'Оцінка', type: 'select', list: true, options: ['5 — відмінно', '4 — добре', '3 — задовільно', '2 — погано', '1 — не працювати'] },
          { id: 'state', label: 'Стан', type: 'select', list: true, options: ['Активний', 'На перевірці', 'Призупинений'] },
          { id: 'contractFile', label: 'Договір', type: 'file' },
        ],
      },
      {
        id: 'deliveries', name: 'Поставки', one: 'поставку', icon: 'arrowDown', title: 'item', level: 1,
        stages: ['Замовлено', 'Підтверджено', 'В дорозі', 'Отримано', 'Проблема'],
        fields: [
          { id: 'item', label: 'Що', type: 'text', required: true },
          { id: 'qty', label: 'Кількість', type: 'text', list: true },
          { id: 'supplier', label: 'Постачальник', type: 'ref', ref: 'suppliers', list: true },
          { id: 'route', label: 'Маршрут', type: 'ref', ref: 'routes' },
          { id: 'eta', label: 'Очікується', type: 'date', list: true },
          { id: 'owner', label: 'Приймає', type: 'user' },
          { id: 'notes', label: 'Примітки', type: 'longtext' },
        ],
      },
    ],
  },

  acad: {
    tagline: 'Навчальні матеріали, курси, атестація',
    registers: [
      {
        id: 'materials', name: 'Матеріали', one: 'матеріал', icon: 'book', title: 'title', level: 0,
        fields: [
          { id: 'title', label: 'Назва', type: 'text', required: true },
          { id: 'kind', label: 'Тип', type: 'select', list: true, options: ['Курс', 'Лекція', 'Методичка', 'Практикум', 'Відео', 'Тест', 'Кейс'] },
          { id: 'topic', label: 'Тема', type: 'text', list: true },
          { id: 'grade', label: 'Рівень', type: 'select', list: true, options: ['Базовий', 'Середній', 'Поглиблений'] },
          { id: 'audience', label: 'Для кого', type: 'select', list: true, options: ['Персонал', 'Партнери', 'Усі'] },
          { id: 'author', label: 'Автор', type: 'user' },
          { id: 'duration', label: 'Тривалість', type: 'text' },
          { id: 'file', label: 'Файл', type: 'file' },
          { id: 'about', label: 'Опис', type: 'longtext' },
        ],
      },
      {
        id: 'courses', name: 'Курси', one: 'курс', icon: 'users', title: 'name', level: 0,
        stages: ['Планується', 'Набір', 'Триває', 'Завершено'],
        fields: [
          { id: 'name', label: 'Назва', type: 'text', required: true },
          { id: 'trainer', label: 'Викладач', type: 'user', list: true },
          { id: 'start', label: 'Початок', type: 'date', list: true },
          { id: 'end', label: 'Кінець', type: 'date' },
          { id: 'seats', label: 'Місць', type: 'number', list: true },
          { id: 'program', label: 'Програма', type: 'longtext' },
        ],
      },
      {
        id: 'certs', name: 'Атестації', one: 'атестацію', icon: 'check', title: 'who', level: 1,
        fields: [
          { id: 'who', label: 'Хто', type: 'user', required: true },
          { id: 'course', label: 'Курс', type: 'ref', ref: 'courses', list: true },
          { id: 'date', label: 'Дата', type: 'date', list: true },
          { id: 'result', label: 'Результат', type: 'select', list: true, options: ['Склав', 'Не склав', 'Перескладання'] },
          { id: 'score', label: 'Бал', type: 'number', list: true },
        ],
      },
    ],
  },

  res: {
    tagline: 'Гіпотези, експерименти, впровадження',
    registers: [
      {
        id: 'studies', name: 'Дослідження', one: 'дослідження', icon: 'atom', title: 'title', level: 1,
        stages: ['Гіпотеза', 'Дизайн', 'Експеримент', 'Висновки', 'Впроваджено'],
        fields: [
          { id: 'title', label: 'Назва', type: 'text', required: true },
          { id: 'hypothesis', label: 'Гіпотеза', type: 'longtext' },
          { id: 'method', label: 'Метод', type: 'text', list: true },
          { id: 'lead', label: 'Керівник', type: 'user', list: true },
          { id: 'forDiv', label: 'Для напряму', type: 'select', list: true, options: ['Розвідка', 'Аналітика', 'ІТ', 'Кібербезпека', 'Операції', 'Академія'] },
          { id: 'results', label: 'Результати', type: 'longtext' },
          { id: 'file', label: 'Звіт', type: 'file' },
        ],
      },
    ],
  },
};

export const registersOf = (div) => WORKSPACES[div]?.registers || [];
export const registerOf = (div, id) => registersOf(div).find((r) => r.id === id);
export const viewsOf = (div) => WORKSPACES[div]?.views || [];
