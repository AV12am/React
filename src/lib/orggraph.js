// Граф зв'язків компаній: who owns what, read from each company's «Власники» field.
//
// Known owners (the state and its bodies, business groups, people, funds) are recognised by pattern,
// so an analyst's own edits to «Власники» join the graph too. A company that names another company of
// the register as its owner («НАК «Нафтогаз України» — 100 %») is linked to it directly.

export const OWNER_ENTITIES = [
  { id: 'state', name: 'Держава', kind: 'state', re: /держав/i },
  { id: 'kmu', name: 'Кабінет Міністрів', kind: 'state', parent: 'state', re: /Кабінет Міністрів|Кабмін/ },
  { id: 'fdmu', name: 'Фонд державного майна', kind: 'state', parent: 'state', re: /Фонд державного майна|ФДМУ/ },
  { id: 'minfin', name: 'Мінфін', kind: 'state', parent: 'state', re: /Мінфін/ },
  { id: 'mod', name: 'Міноборони', kind: 'state', parent: 'state', re: /Міноборони/ },
  { id: 'scm', name: 'СКМ · Рінат Ахметов', kind: 'group', re: /СКМ|Ахметов|ДТЕК/ },
  { id: 'smart', name: 'Smart Holding · Вадим Новинський', kind: 'group', re: /Smart Holding|Новинськ/ },
  { id: 'df', name: 'Group DF · Дмитро Фірташ', kind: 'group', re: /Group DF|Фірташ/ },
  { id: 'zhevago', name: 'Костянтин Жеваго', kind: 'person', re: /Жеваго/ },
  { id: 'verevsky', name: 'Андрій Веревський', kind: 'person', re: /Веревськ/ },
  { id: 'pinchuk', name: 'Інтерпайп · Віктор Пінчук', kind: 'group', re: /Пінчук|Інтерпайп/ },
  { id: 'shostak', name: 'Руслан Шостак і Валерій Кіптик', kind: 'person', re: /Шостак|Кіптик/ },
  { id: 'njj', name: 'NJJ Holding · Ксав’є Ньєль', kind: 'fund', re: /NJJ/ },
  { id: 'horizon', name: 'Horizon Capital', kind: 'fund', re: /Horizon Capital/ },
  { id: 'fozzy', name: 'Fozzy Group', kind: 'group', re: /Fozzy/ },
  { id: 'kolomoisky', name: 'Ігор Коломойський', kind: 'person', re: /Коломойськ/ },
  { id: 'tigipko', name: 'Сергій Тігіпко · TAS', kind: 'person', re: /Тігіпко|TAS Group/ },
  { id: 'poroshenko', name: 'Родина Порошенків', kind: 'person', re: /Порошенк/ },
  { id: 'vs', name: 'VS Energy', kind: 'group', re: /VS Energy/ },
  { id: 'kontinuum', name: 'Група «Континіум»', kind: 'group', re: /Континіум/ },
];

const plain = (s) => String(s || '').replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim();
// Another company named as an owner: in «quotes» or at the very start of the text, allowing a
// Ukrainian case ending («Турбоатома», «Електроважмашу») — so a person called Антонов is not «Антонов».
const mentions = (text, name) => {
  const n = plain(name);
  if (n.length < 4) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|«)${esc}\\p{L}{0,2}(?![\\p{L}])`, 'u').test(String(text).trim());
};

/** Owners named in a company's text: [{entity}] and [{org}] (another company of the register). */
export function ownersOf(org, orgs) {
  const text = org.owners || '';
  if (!text) return { entities: [], orgs: [] };
  const entities = OWNER_ENTITIES.filter((e) => e.re.test(text));
  // A sub-body of the state implies the state.
  if (entities.some((e) => e.parent === 'state') && !entities.some((e) => e.id === 'state')) entities.unshift(OWNER_ENTITIES[0]);
  const parents = orgs.filter((o) => o.id !== org.id && mentions(text, o.name));
  return { entities, orgs: parents };
}

/**
 * Nodes and links for the graph. Companies with no recognised owner are left out unless `all`.
 * @returns {{ nodes: {id, kind, name, org?}[], links: {source, target, kind}[] }}
 */
export function buildGraph(orgs, { all = false, hideState = false } = {}) {
  const nodes = new Map();
  const links = [];
  const add = (n) => { if (!nodes.has(n.id)) nodes.set(n.id, n); return nodes.get(n.id); };
  for (const o of orgs) {
    const { entities, orgs: parents } = ownersOf(o, orgs);
    const ents = hideState ? entities.filter((e) => e.kind !== 'state') : entities;
    if (!ents.length && !parents.length && !all) continue;
    add({ id: o.id, kind: 'company', name: o.name, org: o });
    for (const e of ents) {
      // The state's bodies hang off the state; the company links to the most specific body named.
      if (e.id === 'state' && ents.some((x) => x.parent === 'state')) continue;
      add({ id: `e:${e.id}`, kind: e.kind, name: e.name });
      links.push({ source: `e:${e.id}`, target: o.id, kind: 'owns' });
      if (e.parent) {
        add({ id: `e:${e.parent}`, kind: 'state', name: OWNER_ENTITIES.find((x) => x.id === e.parent).name });
        if (!links.some((l) => l.source === `e:${e.parent}` && l.target === `e:${e.id}`)) links.push({ source: `e:${e.parent}`, target: `e:${e.id}`, kind: 'body' });
      }
    }
    for (const p of parents) {
      add({ id: p.id, kind: 'company', name: p.name, org: p });
      links.push({ source: p.id, target: o.id, kind: 'parent' });
    }
  }
  return { nodes: [...nodes.values()], links };
}

/** Companies that share an owner with this one, grouped by that owner (for the company card). */
export function relatedThroughOwners(org, orgs) {
  const mine = ownersOf(org, orgs);
  const groups = [];
  for (const e of mine.entities) {
    if (e.id === 'state' && mine.entities.length > 1) continue; // the body is more telling than «Держава»
    const peers = orgs.filter((o) => o.id !== org.id && ownersOf(o, orgs).entities.some((x) => x.id === e.id));
    if (peers.length) groups.push({ id: e.id, name: e.name, peers });
  }
  const parents = mine.orgs;
  const children = orgs.filter((o) => o.id !== org.id && ownersOf(o, orgs).orgs.some((p) => p.id === org.id));
  if (parents.length) groups.unshift({ id: 'parents', name: 'Власник — компанія реєстру', peers: parents });
  if (children.length) groups.unshift({ id: 'children', name: 'Дочірні й залежні компанії', peers: children });
  return groups;
}
