// Reference data for Reaction Core: roles, modules, divisions and the first-run state.

// Classification levels live in clearance.js (LUMEN · UMBRA · NOX + NON OCULIS HOMINUM).
export { CLEARANCE } from './clearance.js';

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
  { id: 'map', name: 'Карта й відстеження' },
  { id: 'audit', name: 'Журнал аудиту' },
  { id: 'settings', name: 'Налаштування системи' },
];

export const PERMISSIONS = {
  admin: { overview: 3, divisions: 3, access: 3, vault: 3, map: 3, audit: 3, settings: 3 },
  lead: { overview: 1, divisions: 2, access: 2, vault: 3, map: 2, audit: 1, settings: 0 },
  analyst: { overview: 1, divisions: 1, access: 0, vault: 2, map: 2, audit: 0, settings: 0 },
  engineer: { overview: 1, divisions: 1, access: 1, vault: 2, map: 1, audit: 1, settings: 1 },
  operator: { overview: 1, divisions: 1, access: 0, vault: 1, map: 2, audit: 0, settings: 0 },
  guest: { overview: 0, divisions: 0, access: 0, vault: 1, map: 0, audit: 0, settings: 0 },
};

export const DIVISIONS = [
  { id: 'int', name: 'Розвідка', icon: 'compass', lead: null, status: 'ok',
    about: 'Збір і верифікація даних з восьми класів джерел: HUMINT, OSINT, SIGINT, GEOINT, FININT, SOCMINT, IMINT, TECHINT.',
    projects: [] },
  { id: 'ana', name: 'Аналітика', icon: 'chart', lead: null, status: 'ok',
    about: 'Синтез даних в оцінки та рекомендації. Багато джерел — один центр — єдине рішення.',
    projects: [] },
  { id: 'it', name: 'ІТ та інфраструктура', icon: 'cpu', lead: null, status: 'ok',
    about: 'Внутрішні системи, сховище, мережа, робочі місця та розробка продуктів компанії.',
    projects: [] },
  { id: 'sec', name: 'Кібербезпека', icon: 'shield', lead: null, status: 'ok',
    about: 'Захист периметра, моніторинг загроз, реагування на інциденти, аудит доступів.',
    projects: [] },
  { id: 'ops', name: 'Операції та логістика', icon: 'truck', lead: null, status: 'ok',
    about: 'Планування і забезпечення польової роботи, транспорт, обладнання, зв’язок.',
    projects: [] },
  { id: 'acad', name: 'Академія', icon: 'book', lead: null, status: 'ok',
    about: 'Tradecraft for intelligence: навчання персоналу та партнерів, методички, атестація.',
    projects: [] },
  { id: 'res', name: 'Дослідження', icon: 'atom', lead: null, status: 'ok',
    about: 'Пошуковий напрям: нові методи верифікації, робота з відкритими даними, інструменти OSINT і моделі довіри до джерел. Те, що завтра стане робочим для інших напрямів.',
    projects: [] },
];

// First-run account. Change the name and code in «Доступ», then invite the team.
export const USERS = [
  { id: 'u01', code: 'V-001', name: 'Адміністратор', role: 'admin', division: 'it', clearance: 2, status: 'active', mfa: true, lastSeen: null, title: 'Адміністратор платформи' },
];

export const REQUESTS = [];

export const FOLDERS = [
  { id: 'f-shared', name: 'Спільне', division: null, clearance: 0 },
];

const MB = 1024 * 1024;
export const FILES = [];

export const STORAGE_QUOTA = 2 * 1024 * MB; // локальне сховище пристрою


export const SEED_AUDIT = [];
