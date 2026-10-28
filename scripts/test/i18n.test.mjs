// Мова інтерфейсу: whole texts, templates with changing parts, composite labels; user text is left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../../src/i18n/dom.js';
import * as EN from '../../src/i18n/en.js';

const t = createTranslator(EN);

test('whole texts keep their surrounding spaces', () => {
  assert.equal(t('Налаштування'), 'Settings');
  assert.equal(t('  Адміністрування '), '  Administration ');
  assert.equal(t('Hello'), null); // not Ukrainian — untouched
});

test('templates: numbers and names stay, interface words inside are translated', () => {
  assert.equal(t('Додано файлів: 3'), 'Files added: 3');
  assert.equal(t('5 хв тому'), '5 min ago');
  assert.equal(t('Пошук: продукти'), 'Search: products');
  assert.equal(t('28 жовтня 2026 р.'), '28 October 2026');
});

test('composite labels when every part is known; a person’s own text is not', () => {
  assert.equal(t('NOX · ніч — Не можна винести за межі системи.'), 'NOX · night — May not leave the system.');
  assert.equal(t('Опрацювання · Джерела · Методики'), 'Processing · Sources · Methods');
  assert.equal(t('Верифікація відео з Бахмута'), null);
});

test('the dictionary has no empty translations', () => {
  for (const [k, v] of Object.entries(EN.EXACT)) assert.ok(v && v.trim(), k);
  for (const [k, v] of EN.TEMPLATES) assert.equal(k.split('{}').length, v.replace(/\{\d+\}/g, '{}').split('{}').length, k);
});
