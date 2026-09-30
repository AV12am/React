// Academy catalogue: tracks, courses and which courses must be passed before asking for a clearance.
// The texts and tests live in the track files next to this one and load only when the Academy is opened.

export const PASS = 0.8;            // share of correct answers to pass
export const VALID_DAYS = 365;      // a pass counts for a year, then the course is taken again

export const GRADES = { Б: 'Базовий', С: 'Середній', П: 'Поглиблений' };

export const TRACKS = [
  { id: 'intro', name: 'Вступ і культура безпеки', about: 'Для всіх у перший тиждень: платформа, грифи, захист облікового запису.' },
  { id: 'int', name: 'Види розвідки', about: 'Розвідувальний цикл, HUMINT, SIGINT, GEOINT, FININT, CYBINT, MASINT і TECHINT: що це, що законно для компанії, як оцінювати.' },
  { id: 'osint', name: 'Робота з інформацією та OSINT', about: 'Відкриті джерела, оцінка, перевірка, право й етика.' },
  { id: 'analysis', name: 'Аналітика', about: 'Мислення, методики, мова ймовірностей і види аналітичних звітів.' },
  { id: 'geo', name: 'Карти та геодані', about: 'Координатні системи й робота з картою платформи.' },
  { id: 'cyber', name: 'Кібербезпека та IT', about: 'Інциденти, безпечна розробка, доступи, моделювання загроз.' },
  { id: 'ops', name: 'Операції та логістика', about: 'Планування операцій (TLP), постачальники, ланцюг постачання, відрядження, домедична допомога.' },
  { id: 'lead', name: 'Керівникам напрямів', about: 'Доступи, постановка завдань і приймання продуктів.' },
];

// id, track, title, grade (Б/С/П), minutes
export const COURSES = [
  ['platform', 'intro', 'Як працює Reaction Core', 'Б', 15],
  ['levels', 'intro', 'Рівні секретності та Traffic Light Protocol', 'Б', 25],
  ['phishing', 'intro', 'Ключі доступу, паролі, фішинг і соціальна інженерія', 'Б', 20],
  ['hygiene', 'intro', 'Особиста цифрова гігієна', 'Б', 20],
  ['nox', 'intro', 'Робота з NOX і NON OCULIS HOMINUM', 'П', 25],

  ['cycle', 'int', 'Розвідувальний цикл і види розвідки', 'Б', 25],
  ['humint', 'int', 'HUMINT: розвідка з людських джерел', 'С', 35],
  ['sigint', 'int', 'SIGINT: радіоелектронна розвідка', 'С', 30],
  ['geoint', 'int', 'GEOINT та IMINT: геопросторова і видова розвідка', 'С', 30],
  ['finint', 'int', 'FININT: фінансова розвідка', 'С', 25],
  ['cybint', 'int', 'CYBINT: розвідка кіберзагроз', 'С', 30],
  ['masint', 'int', 'MASINT і TECHINT: вимірювально-сигнатурна і технічна розвідка', 'П', 20],

  ['osint', 'osint', 'OSINT: відкриті джерела', 'Б', 30],
  ['grading', 'osint', 'Оцінка джерел: шкала Адміралтейства', 'Б', 20],
  ['verify', 'osint', 'Перевірка фото й відео', 'С', 30],
  ['law', 'osint', 'Право та етика: персональні дані й межі дозволеного', 'Б', 25],
  ['infra', 'osint', 'Безпечна дослідницька інфраструктура', 'С', 20],

  ['bias', 'analysis', 'Когнітивні упередження аналітика', 'Б', 20],
  ['sat', 'analysis', 'Структуровані аналітичні методики', 'С', 35],
  ['estimative', 'analysis', 'Мова ймовірностей і рівень упевненості', 'С', 20],
  ['writing', 'analysis', 'Аналітичне письмо і брифінг', 'Б', 25],
  ['reports', 'analysis', 'Види аналітичних звітів', 'С', 40],
  ['disinfo', 'analysis', 'Дезінформація та інформаційні операції', 'С', 25],

  ['coords', 'geo', 'Координати: градуси, DMS, MGRS', 'Б', 20],
  ['map', 'geo', 'Карта платформи: позначки, виміри, шари', 'Б', 15],

  ['incident', 'cyber', 'Інцидент: перша година', 'Б', 20],
  ['secdev', 'cyber', 'Безпечна розробка: OWASP Top 10', 'С', 30],
  ['access', 'cyber', 'Мінімальні права, облікові записи, резервні копії', 'С', 20],
  ['threat', 'cyber', 'Моделювання загроз', 'П', 30],

  ['tlp', 'ops', 'Планування операцій: TLP', 'С', 40],
  ['suppliers', 'ops', 'Перевірка постачальників і контрагентів', 'С', 25],
  ['supply', 'ops', 'Ризики ланцюга постачання', 'С', 20],
  ['travel', 'ops', 'Безпека у відрядженнях', 'Б', 20],
  ['firstaid', 'ops', 'Домедична допомога', 'Б', 25],

  ['leadaccess', 'lead', 'Надання й відкликання доступів', 'С', 15],
  ['tasking', 'lead', 'Постановка завдань і приймання аналітичних продуктів', 'С', 25],
].map(([id, track, title, grade, minutes]) => ({ id, track, title, grade, minutes }));

export const courseById = (id) => COURSES.find((c) => c.id === id);

/** Courses to pass before asking for this clearance level (1 — UMBRA, 2 — NOX). */
export const REQUIRED = {
  1: ['levels', 'phishing', 'law'],
  2: ['nox', 'incident'],
};
export const requiredFor = (level) => (REQUIRED[level] || []).map(courseById);

/** This person's result for a course: null, or { best, passed, at, attempts, fresh }. */
export function resultOf(user, id) {
  const r = user?.training?.[id];
  if (!r) return null;
  const fresh = r.passed && (Date.now() - Date.parse(r.at)) / 86400000 <= VALID_DAYS;
  return { ...r, fresh };
}
export const hasPassed = (user, id) => !!resultOf(user, id)?.fresh;
export const missingFor = (user, level) => requiredFor(level).filter((c) => !hasPassed(user, c.id));

// Track file per track id; each exports `default` = { [courseId]: { summary, body, quiz } }.
export const loadTrack = (track) => ({
  intro: () => import('./intro.js'),
  int: () => import('./int.js'),
  osint: () => import('./osint.js'),
  analysis: () => import('./analysis.js'),
  geo: () => import('./geo.js'),
  cyber: () => import('./cyber.js'),
  ops: () => import('./ops.js'),
  lead: () => import('./lead.js'),
})[track]().then((m) => m.default);
