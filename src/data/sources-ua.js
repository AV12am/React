// Базовий набір відкритих джерел для реєстру «Джерела» (Розвідка): ті, з яких платформа сама збирає Morning briefing,
// CONTEXT News, карту тривог, індекс ризику й перевірку контрагентів, та загальновідомі офіційні й аналітичні
// джерела. Усе — відкриті (OSINT / FININT / GEOINT): людських джерел тут немає й бути не може.
// Рядок: [id, назва, клас, надійність (літера A–F), опис, посилання, де використовується]
// Оцінка надійності — наша робоча, як відправна точка: змінюйте її за власним досвідом роботи з джерелом.

import { RELIABILITY } from './workspaces.js';

const GRADE = Object.fromEntries(RELIABILITY.map((r) => [r[0], r]));

const ROWS = [
  // ── Новини України (стрічки CONTEXT News)
  ['ukrinform', 'Укрінформ', 'OSINT', 'B', 'Державне інформагентство України.', 'https://www.ukrinform.ua', 'CONTEXT News, Morning briefing'],
  ['pravda', 'Українська правда', 'OSINT', 'B', 'Загальнонаціональне інтернет-видання.', 'https://www.pravda.com.ua', 'CONTEXT News, Morning briefing'],
  ['interfax-ua', 'Інтерфакс-Україна', 'OSINT', 'B', 'Інформагентство: політика, економіка, війна.', 'https://interfax.com.ua', 'CONTEXT News, Morning briefing'],
  ['unian', 'УНІАН', 'OSINT', 'C', 'Інформагентство; швидкі новини.', 'https://www.unian.ua', 'CONTEXT News, Morning briefing'],
  ['eurointegration', 'Європейська правда', 'OSINT', 'B', 'Видання про євроінтеграцію України.', 'https://www.eurointegration.com.ua', 'CONTEXT News (євроінтеграція)'],
  ['kyivindependent', 'The Kyiv Independent', 'OSINT', 'B', 'Англомовне українське видання.', 'https://kyivindependent.com', 'CONTEXT News, Morning briefing'],
  ['zn', 'Дзеркало тижня', 'OSINT', 'B', 'Аналітичне видання.', 'https://zn.ua', 'CONTEXT News'],
  ['defence-ua', 'Defence-UA', 'OSINT', 'C', 'Військово-оборонне видання.', 'https://defence-ua.com', 'CONTEXT News (оборона)'],
  ['mil-in-ua', 'Mil.in.ua', 'OSINT', 'C', 'Військово-технічне видання.', 'https://mil.in.ua', 'CONTEXT News (оборона)'],
  ['armyinform', 'АрміяInform', 'OSINT', 'B', 'Інформаційне агентство Міністерства оборони.', 'https://armyinform.com.ua', 'CONTEXT News (оборона)'],
  // ── Світові медіа
  ['bbc-world', 'BBC News — World', 'OSINT', 'A', 'Світові новини BBC (англійською).', 'https://www.bbc.com/news/world', 'CONTEXT News, GPR-огляд'],
  ['bbc-ua', 'BBC News Україна', 'OSINT', 'A', 'Українська служба BBC.', 'https://www.bbc.com/ukrainian', 'CONTEXT News'],
  ['bbc-ru', 'BBC News Русская служба', 'OSINT', 'B', 'Російська служба BBC: як подає події російськомовна аудиторія.', 'https://www.bbc.com/russian', 'CONTEXT News (моніторинг)'],
  ['dw', 'Deutsche Welle', 'OSINT', 'A', 'Німецька міжнародна мовна корпорація.', 'https://www.dw.com', 'CONTEXT News, GPR-огляд'],
  ['aljazeera', 'Al Jazeera', 'OSINT', 'B', 'Міжнародний мовник із Катару.', 'https://www.aljazeera.com', 'CONTEXT News, GPR-огляд'],
  ['france24', 'France 24', 'OSINT', 'B', 'Французький міжнародний мовник.', 'https://www.france24.com', 'CONTEXT News, GPR-огляд'],
  ['guardian', 'The Guardian — World', 'OSINT', 'B', 'Британське видання; окрема стрічка про Україну.', 'https://www.theguardian.com/world', 'CONTEXT News, GPR-огляд'],
  ['nyt', 'The New York Times — World', 'OSINT', 'B', 'Світові новини NYT.', 'https://www.nytimes.com/section/world', 'CONTEXT News'],
  ['sky', 'Sky News — World', 'OSINT', 'B', 'Британський мовник.', 'https://news.sky.com/world', 'CONTEXT News, GPR-огляд'],
  ['npr', 'NPR — World', 'OSINT', 'B', 'Американське публічне радіо.', 'https://www.npr.org/sections/world/', 'CONTEXT News, GPR-огляд'],
  ['euronews', 'Euronews', 'OSINT', 'B', 'Європейський мовник.', 'https://www.euronews.com', 'CONTEXT News'],
  ['lemonde', 'Le Monde (англійською)', 'OSINT', 'B', 'Французька щоденна газета, міжнародний розділ.', 'https://www.lemonde.fr/en/', 'CONTEXT News'],
  ['politico-eu', 'Politico Europe', 'OSINT', 'B', 'Політика ЄС і НАТО.', 'https://www.politico.eu', 'CONTEXT News'],
  ['independent', 'The Independent — Europe', 'OSINT', 'C', 'Британська газета, розділ Європа.', 'https://www.independent.co.uk/news/world/europe', 'CONTEXT News'],
  ['un-news', 'UN News — мир і безпека', 'OSINT', 'A', 'Новини ООН: мир і безпека та загальна стрічка.', 'https://news.un.org', 'CONTEXT News, GPR-огляд'],
  ['defensenews', 'Defense News', 'OSINT', 'B', 'Оборонне видання (США).', 'https://www.defensenews.com', 'CONTEXT News (оборона)'],
  ['breakingdefense', 'Breaking Defense', 'OSINT', 'B', 'Оборонна політика й технології (США).', 'https://breakingdefense.com', 'CONTEXT News (оборона)'],
  ['economist', 'The Economist', 'OSINT', 'A', 'Міжнародні огляди й аналітика.', 'https://www.economist.com', 'GPR-огляд, Morning briefing'],
  ['foreignaffairs', 'Foreign Affairs', 'OSINT', 'A', 'Журнал із міжнародних відносин.', 'https://www.foreignaffairs.com', 'GPR-огляд'],
  ['mckinsey', 'McKinsey Insights', 'OSINT', 'B', 'Дослідження з економіки й управління.', 'https://www.mckinsey.com/insights', 'GPR-огляд'],
  // ── Російські медіа: лише для моніторингу того, що кажуть сторони
  ['tass', 'ТАСС', 'OSINT', 'D', 'Російське державне агентство. Для моніторингу офіційної риторики, не для встановлення фактів.', 'https://tass.com', 'CONTEXT News (моніторинг риторики)'],
  ['ria', 'РИА Новости', 'OSINT', 'D', 'Російське державне агентство. Для моніторингу риторики, не для фактів.', 'https://ria.ru', 'CONTEXT News (моніторинг риторики)'],
  ['lenta', 'Lenta.ru', 'OSINT', 'D', 'Російське видання під державним впливом. Моніторинг риторики.', 'https://lenta.ru', 'CONTEXT News (моніторинг риторики)'],
  ['meduza', 'Meduza', 'OSINT', 'B', 'Незалежне російськомовне видання (за межами Росії).', 'https://meduza.io', 'CONTEXT News (моніторинг)'],
  ['moscowtimes', 'The Moscow Times', 'OSINT', 'B', 'Незалежне видання про Росію.', 'https://www.themoscowtimes.com', 'CONTEXT News (моніторинг)'],
  // ── Дані й сервіси, що живлять бриф та платформу
  ['gdelt', 'GDELT Project', 'OSINT', 'C', 'Глобальна база новин і подій, з тоном і географією; пошук за темою й країною.', 'https://www.gdeltproject.org', 'CONTEXT News (картинки й пошук), Ситуація, Дашборд'],
  ['alerts-in-ua', 'alerts.in.ua', 'OSINT', 'B', 'Дані офіційних повітряних тривог за областями.', 'https://alerts.in.ua', 'Morning briefing, карта (шар тривог)'],
  ['gpr', 'Caldara–Iacoviello GPR', 'OSINT', 'A', 'Індекс геополітичного ризику (щоденний), 100 — середнє 1985–2019.', 'https://www.matteoiacoviello.com/gpr.htm', 'Morning briefing, шкала тривожності'],
  ['geoboundaries', 'geoBoundaries', 'GEOINT', 'A', 'Відкриті межі областей (CC BY 4.0).', 'https://www.geoboundaries.org', 'Morning briefing (карта тривог)'],
  ['deepstate', 'DeepStateMap', 'GEOINT', 'B', 'Відкрита карта бойових дій і зміни лінії фронту.', 'https://deepstatemap.live', 'Карта (шар конфлікту)'],
  ['acled', 'ACLED', 'OSINT', 'A', 'Дані про події політичного насильства й протестів зі світу.', 'https://acleddata.com', 'Карта (шар конфлікту)'],
  ['prozorro', 'Prozorro', 'FININT', 'A', 'Державні закупівлі України: тендери, замовники, переможці.', 'https://prozorro.gov.ua', 'Картка компанії, Ситуація'],
  ['gleif', 'GLEIF', 'FININT', 'A', 'Глобальна база LEI: ідентифікатори юросіб і їхні зв’язки.', 'https://www.gleif.org', 'Картка компанії'],
  ['opendatabot', 'Opendatabot', 'FININT', 'B', 'Агрегатор відкритих реєстрів України: ЄДР, суди, борги.', 'https://opendatabot.ua', 'Довідник організацій, картка компанії'],
  ['clarity', 'Clarity Project', 'FININT', 'B', 'Агрегатор відкритих даних про компанії й тендери.', 'https://clarity-project.info', 'Довідник організацій'],
  ['edr', 'ЄДР юридичних осіб (Мін’юст)', 'FININT', 'A', 'Єдиний державний реєстр: державне джерело про юридичних осіб і ФОП.', 'https://usr.minjust.gov.ua', 'Довідник організацій'],
  ['wikimedia', 'Wikimedia Commons', 'OSINT', 'C', 'Вільні зображення для ілюстрацій новин.', 'https://commons.wikimedia.org', 'CONTEXT News (зображення)'],
  ['openverse', 'Openverse', 'OSINT', 'C', 'Пошук вільних зображень.', 'https://openverse.org', 'CONTEXT News (зображення)'],
  // ── Санкції
  ['ofac', 'OFAC — SDN і суміжні списки', 'FININT', 'A', 'Санкційні списки Мінфіну США.', 'https://sanctionslist.ofac.treas.gov', 'Спостереження: контрагенти й санкції'],
  ['eu-sanctions', 'Консолідований санкційний список ЄС', 'FININT', 'A', 'Фінансові санкції ЄС (FSF).', 'https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions', 'Спостереження: контрагенти й санкції'],
  ['nsdc-sanctions', 'Реєстр санкцій РНБО', 'FININT', 'A', 'Санкції РНБО України щодо юросіб.', 'https://drs.nsdc.gov.ua', 'Спостереження: контрагенти й санкції'],
  // ── Державні джерела України
  ['bank-gov', 'Національний банк України', 'FININT', 'A', 'Курси, ставка, банківська статистика, звіти.', 'https://bank.gov.ua', 'Morning briefing (економіка), прогнози'],
  ['ukrstat', 'Держстат України', 'OSINT', 'A', 'Офіційна статистика.', 'https://ukrstat.gov.ua', 'Прогнози'],
  ['minfin', 'Мінфін України', 'FININT', 'A', 'Державний бюджет і борг.', 'https://mof.gov.ua', 'Прогнози (держбюджет)'],
  ['rada', 'Верховна Рада України', 'OSINT', 'A', 'Законопроєкти, голосування, стенограми.', 'https://www.rada.gov.ua', 'Прогнози, Morning briefing'],
  ['president', 'Офіс Президента України', 'OSINT', 'A', 'Укази, звернення.', 'https://www.president.gov.ua', 'Morning briefing'],
  ['kmu', 'Кабінет Міністрів України', 'OSINT', 'A', 'Постанови й розпорядження.', 'https://www.kmu.gov.ua', 'Morning briefing'],
  ['mod', 'Міністерство оборони України', 'OSINT', 'B', 'Офіційні повідомлення про оборону.', 'https://www.mil.gov.ua', 'CONTEXT News (оборона)'],
  ['zsu', 'Генеральний штаб ЗСУ', 'OSINT', 'B', 'Зведення про ситуацію на фронті.', 'https://www.facebook.com/GeneralStaff.ua', 'CONTEXT News (оборона)'],
  ['dsns', 'ДСНС України', 'OSINT', 'B', 'Наслідки обстрілів, надзвичайні ситуації.', 'https://dsns.gov.ua', 'Morning briefing (безпека)'],
  ['data-gov-ua', 'Єдиний державний вебпортал відкритих даних', 'OSINT', 'B', 'Набори відкритих даних органів влади.', 'https://data.gov.ua', 'Ситуація (власні дані)'],
  // ── Міжнародні організації й статистика
  ['eurostat', 'Eurostat', 'OSINT', 'A', 'Статистика ЄС.', 'https://ec.europa.eu/eurostat', 'Прогнози'],
  ['eeas', 'EEAS — Європейська служба зовнішніх дій', 'OSINT', 'A', 'Позиції й заяви ЄС.', 'https://www.eeas.europa.eu', 'Прогнози (євроінтеграція)'],
  ['nato', 'НАТО', 'OSINT', 'A', 'Заяви й документи Альянсу.', 'https://www.nato.int', 'Morning briefing'],
  ['iaea', 'МАГАТЕ', 'OSINT', 'A', 'Звіти про ядерну безпеку, зокрема щодо ЗАЕС.', 'https://www.iaea.org', 'Morning briefing (безпека)'],
  ['imf', 'МВФ', 'OSINT', 'A', 'Макроекономічні прогнози й програми.', 'https://www.imf.org', 'Прогнози'],
  ['worldbank', 'Світовий банк', 'OSINT', 'A', 'Економічні дані й оцінки відбудови.', 'https://www.worldbank.org', 'Прогнози'],
  ['fed', 'Федеральна резервна система США', 'FININT', 'A', 'Ставка, протоколи FOMC.', 'https://www.federalreserve.gov', 'Прогнози (ставка ФРС)'],
  // ── Аналітичні центри
  ['isw', 'Institute for the Study of War (ISW)', 'OSINT', 'B', 'Щоденні оцінки ситуації на фронті.', 'https://understandingwar.org', 'Morning briefing, CONTEXT News (оборона)'],
  ['csis', 'CSIS', 'OSINT', 'A', 'Американський центр стратегічних досліджень.', 'https://www.csis.org', 'Прогнози'],
  ['chathamhouse', 'Chatham House', 'OSINT', 'A', 'Британський аналітичний центр з міжнародних відносин.', 'https://www.chathamhouse.org', 'Прогнози'],
  ['rusi', 'RUSI', 'OSINT', 'A', 'Королівський об’єднаний інститут оборонних досліджень.', 'https://rusi.org', 'Прогнози (оборона)'],
  ['ecfr', 'ECFR', 'OSINT', 'A', 'Європейська рада з міжнародних відносин.', 'https://ecfr.eu', 'Прогнози'],
  ['atlanticcouncil', 'Atlantic Council', 'OSINT', 'A', 'Аналітичний центр: безпека, Україна, ЄС, США.', 'https://www.atlanticcouncil.org', 'Прогнози'],
  ['carnegie', 'Carnegie Endowment', 'OSINT', 'A', 'Аналітика з міжнародної політики.', 'https://carnegieendowment.org', 'Прогнози'],
  ['kse', 'KSE Institute', 'OSINT', 'A', 'Київська школа економіки: економіка війни, санкції.', 'https://kse.ua', 'Прогнози (економіка)'],
  ['cds', 'Центр економічної стратегії', 'OSINT', 'B', 'Українські економічні й безпекові аналітичні матеріали.', 'https://ces.org.ua', 'Прогнози (економіка)'],
  // ── IT і компанії
  ['dou', 'DOU', 'OSINT', 'B', 'Спільнота й дослідження українського IT-ринку.', 'https://dou.ua', 'Картка компанії (IT)'],
  ['clutch', 'Clutch', 'OSINT', 'C', 'Відгуки клієнтів про IT-компанії.', 'https://clutch.co', 'Картка компанії (IT)'],
  ['crunchbase', 'Crunchbase', 'FININT', 'C', 'Інвестиції й раунди стартапів.', 'https://www.crunchbase.com', 'Картка компанії (IT)'],
  ['linkedin-co', 'LinkedIn — сторінки компаній', 'SOCMINT', 'C', 'Публічні сторінки компаній: персонал, вакансії, новини.', 'https://www.linkedin.com', 'Картка компанії'],
];

/** Records for the «Джерела» register — open sources (LUMEN), active, with the link and where each is used. */
export const SOURCES_UA = ROWS.map(([id, name, cls, grade, about, url, used]) => ({
  id: `src-${id}`, name, class: cls, reliability: GRADE[grade], access: 'Відкриті дані', state: 'Активне', url,
  notes: `${about}\nВикористовується: ${used}.`,
}));
