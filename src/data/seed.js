// Demo data for VOLOSHYNSKY Core. All people, projects and figures are fictional.

export const CLEARANCE = [
  { id: 0, short: 'Відкрито', full: 'Відкрита інформація' },
  { id: 1, short: 'ДСК', full: 'Для службового користування' },
  { id: 2, short: 'Таємно', full: 'Таємно' },
  { id: 3, short: 'Цілком таємно', full: 'Цілком таємно' },
];

export const ROLES = [
  { id: 'admin', name: 'Адміністратор', note: 'Повне керування платформою та доступами' },
  { id: 'lead', name: 'Керівник напряму', note: 'Керує людьми та ресурсами свого напряму' },
  { id: 'analyst', name: 'Аналітик', note: 'Працює з джерелами, звітами та оцінками' },
  { id: 'engineer', name: 'Інженер', note: 'Інфраструктура, розробка, підтримка' },
  { id: 'operator', name: 'Оперативник', note: 'Польова робота, обмежений доступ до сховища' },
  { id: 'guest', name: 'Підрядник', note: 'Тимчасовий доступ до окремих папок' },
];

// Module permissions per role: 0 — немає, 1 — перегляд, 2 — редагування, 3 — керування
export const MODULES = [
  { id: 'overview', name: 'Огляд і метрики' },
  { id: 'divisions', name: 'Напрями' },
  { id: 'access', name: 'Доступи та люди' },
  { id: 'vault', name: 'Сховище' },
  { id: 'audit', name: 'Журнал аудиту' },
  { id: 'settings', name: 'Налаштування системи' },
];

export const PERMISSIONS = {
  admin: { overview: 3, divisions: 3, access: 3, vault: 3, audit: 3, settings: 3 },
  lead: { overview: 1, divisions: 2, access: 2, vault: 3, audit: 1, settings: 0 },
  analyst: { overview: 1, divisions: 1, access: 0, vault: 2, audit: 0, settings: 0 },
  engineer: { overview: 1, divisions: 1, access: 1, vault: 2, audit: 1, settings: 1 },
  operator: { overview: 1, divisions: 1, access: 0, vault: 1, audit: 0, settings: 0 },
  guest: { overview: 0, divisions: 0, access: 0, vault: 1, audit: 0, settings: 0 },
};

export const DIVISIONS = [
  { id: 'int', code: 'РОЗ', name: 'Розвідка', icon: 'compass', lead: 'u02', status: 'ok',
    about: 'Збір і верифікація даних з восьми класів джерел: HUMINT, OSINT, SIGINT, GEOINT, FININT, SOCMINT, IMINT, TECHINT.',
    projects: ['Карта постачання «Меридіан»', 'Верифікація джерел Q3', 'OSINT-моніторинг кордону'] },
  { id: 'ana', code: 'АН', name: 'Аналітика', icon: 'chart', lead: 'u04', status: 'ok',
    about: 'Синтез даних в оцінки та рекомендації. Багато джерел — один центр — єдине рішення.',
    projects: ['Щотижнева оцінка ризиків', 'Модель прогнозу логістики', 'Звіт для партнерів'] },
  { id: 'it', code: 'ІТ', name: 'ІТ та інфраструктура', icon: 'cpu', lead: 'u06', status: 'warn',
    about: 'Внутрішні системи, сховище, мережа, робочі місця та розробка продуктів компанії.',
    projects: ['Міграція сховища на кластер B', 'Core 0.2', 'Оновлення робочих станцій'] },
  { id: 'sec', code: 'КБ', name: 'Кібербезпека', icon: 'shield', lead: 'u08', status: 'ok',
    about: 'Захист периметра, моніторинг загроз, реагування на інциденти, аудит доступів.',
    projects: ['Пентест периметра', 'MFA для підрядників', 'Навчальна фішинг-кампанія'] },
  { id: 'ops', code: 'ОП', name: 'Операції та логістика', icon: 'truck', lead: 'u10', status: 'ok',
    about: 'Планування і забезпечення польової роботи, транспорт, обладнання, зв’язок.',
    projects: ['Ротація обладнання зв’язку', 'Маршрути Схід-2', 'Склад №3'] },
  { id: 'acad', code: 'АК', name: 'Академія', icon: 'book', lead: 'u12', status: 'ok',
    about: 'Tradecraft for intelligence: навчання персоналу та партнерів, методички, атестація.',
    projects: ['Курс «Основи OSINT»', 'Атестація аналітиків', 'Бібліотека кейсів'] },
];

const d = (daysAgo, h = 10, m = 0) => {
  const t = new Date();
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, m, 0, 0);
  if (t > Date.now()) t.setDate(t.getDate() - 1);
  return t.toISOString();
};

export const USERS = [
  { id: 'u01', code: 'V-001', name: 'Андрій Мельник', role: 'admin', division: 'it', clearance: 3, status: 'active', mfa: true, lastSeen: d(0, 9, 12), title: 'Головний адміністратор' },
  { id: 'u02', code: 'V-014', name: 'Олена Кравчук', role: 'lead', division: 'int', clearance: 3, status: 'active', mfa: true, lastSeen: d(0, 8, 40), title: 'Керівниця розвідки' },
  { id: 'u03', code: 'V-022', name: 'Тарас Бондар', role: 'analyst', division: 'int', clearance: 2, status: 'active', mfa: true, lastSeen: d(0, 11, 5), title: 'Аналітик OSINT' },
  { id: 'u04', code: 'V-031', name: 'Ірина Шевчук', role: 'lead', division: 'ana', clearance: 3, status: 'active', mfa: true, lastSeen: d(1, 18, 20), title: 'Керівниця аналітики' },
  { id: 'u05', code: 'V-037', name: 'Максим Ткаченко', role: 'analyst', division: 'ana', clearance: 2, status: 'active', mfa: true, lastSeen: d(0, 10, 2), title: 'Старший аналітик' },
  { id: 'u06', code: 'V-040', name: 'Дмитро Коваленко', role: 'lead', division: 'it', clearance: 2, status: 'active', mfa: true, lastSeen: d(0, 7, 55), title: 'CTO' },
  { id: 'u07', code: 'V-044', name: 'Софія Лисенко', role: 'engineer', division: 'it', clearance: 1, status: 'active', mfa: true, lastSeen: d(0, 12, 30), title: 'DevOps-інженерка' },
  { id: 'u08', code: 'V-051', name: 'Роман Гнатюк', role: 'lead', division: 'sec', clearance: 3, status: 'active', mfa: true, lastSeen: d(0, 6, 48), title: 'CISO' },
  { id: 'u09', code: 'V-058', name: 'Юлія Марченко', role: 'engineer', division: 'sec', clearance: 2, status: 'active', mfa: true, lastSeen: d(2, 16, 0), title: 'Аналітикиня SOC' },
  { id: 'u10', code: 'V-063', name: 'Віктор Савчук', role: 'lead', division: 'ops', clearance: 2, status: 'active', mfa: true, lastSeen: d(1, 9, 10), title: 'Керівник операцій' },
  { id: 'u11', code: 'V-067', name: 'Назар Павленко', role: 'operator', division: 'ops', clearance: 1, status: 'active', mfa: false, lastSeen: d(4, 14, 0), title: 'Оперативник' },
  { id: 'u12', code: 'V-072', name: 'Катерина Бойко', role: 'lead', division: 'acad', clearance: 1, status: 'active', mfa: true, lastSeen: d(0, 13, 15), title: 'Директорка академії' },
  { id: 'u13', code: 'V-078', name: 'Павло Іваненко', role: 'analyst', division: 'int', clearance: 1, status: 'suspended', mfa: true, lastSeen: d(21, 11, 0), title: 'Молодший аналітик' },
  { id: 'u14', code: 'C-003', name: 'Остап Руденко', role: 'guest', division: 'acad', clearance: 0, status: 'active', mfa: false, lastSeen: d(3, 15, 40), title: 'Зовнішній викладач' },
  { id: 'u15', code: 'V-083', name: 'Марія Олійник', role: 'engineer', division: 'it', clearance: 1, status: 'invited', mfa: false, lastSeen: null, title: 'Frontend-розробниця' },
];

export const REQUESTS = [
  { id: 'r01', user: 'u03', kind: 'clearance', from: 2, to: 3, reason: 'Робота з матеріалами «Меридіан» рівня ЦТ.', at: d(0, 9, 30), status: 'pending' },
  { id: 'r02', user: 'u07', kind: 'folder', folder: 'f-sec-inc', reason: 'Розслідування інциденту з VPN-шлюзом.', at: d(0, 8, 15), status: 'pending' },
  { id: 'r03', user: 'u14', kind: 'folder', folder: 'f-acad', reason: 'Підготовка модуля курсу «Основи OSINT».', at: d(1, 17, 5), status: 'pending' },
  { id: 'r04', user: 'u11', kind: 'clearance', from: 1, to: 2, reason: 'Призначення на маршрут Схід-2.', at: d(2, 12, 0), status: 'pending' },
  { id: 'r05', user: 'u05', kind: 'folder', folder: 'f-int-rep', reason: 'Зведена оцінка за вересень.', at: d(5, 10, 0), status: 'approved' },
];

export const FOLDERS = [
  { id: 'f-shared', name: 'Спільне', division: null, clearance: 0 },
  { id: 'f-int-rep', name: 'Розвідка · Звіти', division: 'int', clearance: 2 },
  { id: 'f-int-src', name: 'Розвідка · Джерела', division: 'int', clearance: 3 },
  { id: 'f-ana', name: 'Аналітика · Оцінки', division: 'ana', clearance: 2 },
  { id: 'f-it', name: 'ІТ · Документація', division: 'it', clearance: 1 },
  { id: 'f-sec-inc', name: 'Кібербезпека · Інциденти', division: 'sec', clearance: 2 },
  { id: 'f-ops', name: 'Операції · Логістика', division: 'ops', clearance: 1 },
  { id: 'f-acad', name: 'Академія · Курси', division: 'acad', clearance: 0 },
];

const MB = 1024 * 1024;
export const FILES = [
  { id: 'x01', folder: 'f-shared', name: 'Брендбук VOLOSHYNSKY.pdf', size: 18.4 * MB, type: 'application/pdf', clearance: 0, owner: 'u12', at: d(12) },
  { id: 'x02', folder: 'f-shared', name: 'Шаблон звіту v4.docx', size: 0.3 * MB, type: 'application/msword', clearance: 0, owner: 'u04', at: d(30) },
  { id: 'x03', folder: 'f-shared', name: 'Правила інформаційної безпеки.pdf', size: 2.1 * MB, type: 'application/pdf', clearance: 1, owner: 'u08', at: d(45) },
  { id: 'x04', folder: 'f-int-rep', name: 'Щотижневий звіт 38.pdf', size: 4.7 * MB, type: 'application/pdf', clearance: 2, owner: 'u02', at: d(1) },
  { id: 'x05', folder: 'f-int-rep', name: 'Меридіан — карта постачання.geojson', size: 12.9 * MB, type: 'application/geo+json', clearance: 3, owner: 'u03', at: d(2) },
  { id: 'x06', folder: 'f-int-src', name: 'Реєстр джерел Q3.xlsx', size: 1.2 * MB, type: 'application/vnd.ms-excel', clearance: 3, owner: 'u02', at: d(6) },
  { id: 'x07', folder: 'f-int-rep', name: 'OSINT-дайджест 26.09.md', size: 0.05 * MB, type: 'text/markdown', clearance: 1, owner: 'u03', at: d(0) },
  { id: 'x08', folder: 'f-ana', name: 'Оцінка ризиків — вересень.pdf', size: 6.3 * MB, type: 'application/pdf', clearance: 2, owner: 'u05', at: d(3) },
  { id: 'x09', folder: 'f-ana', name: 'Модель логістики v2.ipynb', size: 3.4 * MB, type: 'application/json', clearance: 2, owner: 'u05', at: d(8) },
  { id: 'x10', folder: 'f-it', name: 'Архітектура Core.png', size: 1.8 * MB, type: 'image/png', clearance: 1, owner: 'u06', at: d(4) },
  { id: 'x11', folder: 'f-it', name: 'Runbook — сховище.md', size: 0.08 * MB, type: 'text/markdown', clearance: 1, owner: 'u07', at: d(9) },
  { id: 'x12', folder: 'f-sec-inc', name: 'INC-0412 VPN-шлюз.pdf', size: 0.9 * MB, type: 'application/pdf', clearance: 2, owner: 'u09', at: d(1) },
  { id: 'x13', folder: 'f-sec-inc', name: 'Звіт пентесту периметра.pdf', size: 5.5 * MB, type: 'application/pdf', clearance: 3, owner: 'u08', at: d(15) },
  { id: 'x14', folder: 'f-ops', name: 'Маршрути Схід-2.kml', size: 0.7 * MB, type: 'application/vnd.google-earth.kml+xml', clearance: 2, owner: 'u10', at: d(2) },
  { id: 'x15', folder: 'f-ops', name: 'Інвентар — склад №3.csv', size: 0.2 * MB, type: 'text/csv', clearance: 1, owner: 'u10', at: d(7) },
  { id: 'x16', folder: 'f-acad', name: 'Основи OSINT — модуль 1.pdf', size: 9.6 * MB, type: 'application/pdf', clearance: 0, owner: 'u12', at: d(20) },
  { id: 'x17', folder: 'f-acad', name: 'Кейс: верифікація фото.mp4', size: 148 * MB, type: 'video/mp4', clearance: 0, owner: 'u14', at: d(11) },
];

export const STORAGE_QUOTA = 2 * 1024 * MB; // 2 ГБ для демо

// Reports received per intelligence source class this week.
export const SOURCES = [
  { id: 'OSINT', value: 318 },
  { id: 'SOCMINT', value: 211 },
  { id: 'SIGINT', value: 127 },
  { id: 'IMINT', value: 88 },
  { id: 'GEOINT', value: 64 },
  { id: 'HUMINT', value: 42 },
  { id: 'TECHINT', value: 36 },
  { id: 'FININT', value: 29 },
];

// Finished assessments per week, last 12 weeks (oldest first).
export const WEEKLY = [38, 41, 36, 44, 47, 45, 52, 49, 55, 58, 54, 61];

export const SYSTEMS = [
  { name: 'Core API', status: 'ok', note: 'Відповідь 84 мс' },
  { name: 'Сховище · кластер A', status: 'ok', note: 'Реплікація в нормі' },
  { name: 'Сховище · кластер B', status: 'warn', note: 'Міграція 72%' },
  { name: 'VPN-шлюз', status: 'ok', note: 'Інцидент INC-0412 закрито' },
  { name: 'Пошта', status: 'ok', note: 'Черга порожня' },
  { name: 'SIEM', status: 'ok', note: '1,2 млн подій / добу' },
];

export const SEED_AUDIT = [
  { at: d(0, 9, 30), actor: 'u03', type: 'access', text: 'Запит на підвищення допуску до «Цілком таємно»' },
  { at: d(0, 9, 12), actor: 'u01', type: 'auth', text: 'Вхід у систему · MFA підтверджено' },
  { at: d(0, 8, 51), actor: 'u02', type: 'vault', text: 'Переглянуто «Реєстр джерел Q3.xlsx»' },
  { at: d(0, 8, 15), actor: 'u07', type: 'access', text: 'Запит доступу до папки «Кібербезпека · Інциденти»' },
  { at: d(0, 7, 2), actor: 'u08', type: 'security', text: 'Заблоковано 14 спроб входу з невідомих IP' },
  { at: d(1, 18, 22), actor: 'u04', type: 'vault', text: 'Завантажено «Оцінка ризиків — вересень.pdf»' },
  { at: d(1, 17, 5), actor: 'u14', type: 'access', text: 'Запит доступу до папки «Академія · Курси»' },
  { at: d(1, 12, 40), actor: 'u01', type: 'access', text: 'Призупинено обліковий запис V-078' },
  { at: d(2, 10, 0), actor: 'u06', type: 'system', text: 'Розпочато міграцію сховища на кластер B' },
];
