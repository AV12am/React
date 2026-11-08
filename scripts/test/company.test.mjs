import test from 'node:test';
import assert from 'node:assert/strict';
import { registerOf } from '../../api/_company.js';

test('the register card: head, founders and beneficiaries become people', () => {
  const out = registerOf({ data: { full_name: 'ТОВ «Приклад»', status: 'зареєстровано', ceo_name: 'Іваненко Іван', location: 'Київ', authorised_capital: 1000,
    activities: [{ code: '62.01', name: 'Комп’ютерне програмування', is_primary: true }],
    founders: [{ name: 'ТОВ «Холдинг»', capital: 900 }], beneficiaries: [{ title: 'Петренко Петро', country: 'Україна' }] } });
  assert.equal(out.card.name, 'ТОВ «Приклад»');
  assert.equal(out.card.head, 'Іваненко Іван');
  assert.equal(out.card.activity, '62.01 Комп’ютерне програмування');
  assert.equal(out.card.capital, '1000');
  assert.deepEqual(out.people.map((p) => p.role), ['Керівник', 'Засновник', 'Бенефіціар']);
  assert.equal(out.people[1].share, '900 грн');
  assert.equal(out.people[2].country, 'Україна');
});

test('an empty answer is no company', () => {
  assert.equal(registerOf({}), null);
  assert.equal(registerOf([]), null);
});
