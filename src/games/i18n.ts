/**
 * ДВУЯЗЫЧНЫЙ ИНТЕРФЕЙС. Базовый язык — украинский (как игра и писалась),
 * английский нужен для itch: без него страница игры теряет половину читателей.
 *
 * Словарь один на всю игру и держится ПЛОСКИМ: тексты HUD рисуются каждый
 * кадр, поэтому смена языка ничего не пересобирает — достаточно заменить t,
 * а следующий же кадр нарисуется уже по-другому. По той же причине строки
 * нигде не кешируются в переменные при старте: только вызов t() в момент
 * отрисовки.
 *
 * Название игры «ФАЄРВОЛ» в словаре НЕТ — оно не переводится ни при каких
 * условиях; в английском под ним подписывается пояснение title.name_en.
 *
 * Параметры подставляются плейсхолдерами {0}, {1}, … по порядку аргументов.
 */
export type LangId = 'uk' | 'en';

export const STRINGS: Record<string, { uk: string; en: string }> = {
  // ── ТИТУЛ ──
  'title.sub': { uk: 'ТРИМАЙ ПОРТ · ХВИЛЯ ЗА ХВИЛЕЮ', en: 'HOLD THE PORT · WAVE AFTER WAVE' },
  // подпись под названием: только для тех, кто не прочтёт «ФАЄРВОЛ»
  'title.name_en': { uk: '', en: 'FIREWALL' },
  'title.best': { uk: 'РЕКОРД · {0} · {1}', en: 'BEST · {0} · {1}' },
  'title.tap': { uk: 'ТАП ПО ПУНКТУ', en: 'TAP AN ITEM' },
  'title.keys': { uk: '↑↓ ВИБІР · ENTER / SPACE — СТАРТ', en: '↑↓ SELECT · ENTER / SPACE — START' },
  // сам чит-код не переводится — он вводится клавишами, как в думе
  'title.idclev': { uk: 'IDCLEV {0}▂', en: 'IDCLEV {0}▂' },

  // ── ПУНКТЫ МЕНЮ ──
  'menu.play': { uk: 'НОВА ГРА', en: 'NEW GAME' },
  'menu.diff': { uk: 'СКЛАДНІСТЬ: {0}', en: 'DIFFICULTY: {0}' },
  'menu.arena': { uk: 'АРЕНА: {0}', en: 'ARENA: {0}' },
  'menu.arena.hint': { uk: 'базова, вбудовані та свої', en: 'default, built-in and your own' },
  'menu.lang': { uk: 'МОВА: УКРАЇНСЬКА', en: 'LANGUAGE: ENGLISH' },
  'menu.lang.hint': { uk: 'українська · english', en: 'ukrainian · english' },
  'menu.quality': { uk: 'ЯКІСТЬ: {0}', en: 'QUALITY: {0}' },
  'menu.quality.hint': { uk: 'якщо гра гальмує — постав НИЗЬКУ', en: 'if the game stutters, set LOW' },
  'quality.hi': { uk: 'ВИСОКА', en: 'HIGH' },
  'quality.lo': { uk: 'НИЗЬКА', en: 'LOW' },
  'menu.edit': { uk: 'РЕДАКТОР АРЕНИ', en: 'ARENA EDITOR' },

  // ── СЛОЖНОСТИ ──
  'diff.norm': { uk: 'ЗВИЧАЙНА', en: 'NORMAL' },
  'diff.norm.hint': { uk: 'як задумано', en: 'as intended' },
  'diff.hard': { uk: 'ВАЖКА', en: 'HARD' },
  'diff.hard.hint': { uk: "б'ють болючіше, аптечки скупіші", en: 'they hit harder, medkits are scarce' },
  'diff.core': { uk: 'ХАРДКОР', en: 'HARDCORE' },
  'diff.core.hint': { uk: 'місиво · набоїв більше, часу немає', en: 'carnage · more ammo, no time' },

  // ── АРЕНЫ ──
  // Это ЯРЛЫКИ для показа. Ключи хранилища (fw_arena_use, имена своих арен
  // в fw_arenas) не переводятся никогда — иначе чужой сейв перестанет
  // находиться после смены языка.
  'arena.default': { uk: 'БАЗОВА', en: 'DEFAULT' },
  'arena.draft': { uk: 'ЧЕРНЕТКА', en: 'DRAFT' },
  'arena.b0': { uk: 'ПІРАМІДА', en: 'PYRAMID' },
  'arena.b1': { uk: 'АРЕНА-ГЕЙТ', en: 'ARENA GATE' },

  // ── СТАТУС-БАР И БОЙ ──
  'hud.health': { uk: "ЗДОРОВ'Я", en: 'HEALTH' },
  'hud.ammo': { uk: 'НАБОЇ', en: 'AMMO' },
  'hud.armor': { uk: 'БРОНЯ', en: 'ARMOR' },
  'hud.weapons': { uk: 'ЗБРОЯ · ОЧКИ', en: 'WEAPONS · SCORE' },
  'hud.wave': { uk: 'ХВИЛЯ {0}', en: 'WAVE {0}' },
  'hud.alive': { uk: 'ПОТВОР: {0}', en: 'HOSTILES: {0}' },
  'hud.perWave': { uk: 'ЗА ХВИЛЮ +{0}', en: 'WAVE BONUS +{0}' },
  'hud.kills': { uk: 'ВБИТО: {0}', en: 'KILLS: {0}' },
  'hud.rush': { uk: 'ХВИЛЯ {0} — НАВАЛА БОМБІСТІВ!', en: 'WAVE {0} — BOMBER RUSH!' },
  'hud.cleared': { uk: 'ХВИЛЮ ЗАЧИЩЕНО', en: 'WAVE CLEARED' },
  'hud.score': { uk: 'ОЧКИ +{0}', en: 'SCORE +{0}' },
  'hud.next': { uk: 'наступна хвиля за {0}…', en: 'next wave in {0}…' },
  'hud.rkt': { uk: 'РАКЕТНИЦЯ — КЛАВІША 4', en: 'ROCKET LAUNCHER — KEY 4' },
  'hud.rkt.warn': {
    uk: "ОСКОЛКИ Б'ЮТЬ І ПО ТОБІ — НЕ СТРІЛЯЙ ВПРИТУЛ",
    en: 'SPLASH HITS YOU TOO — NEVER FIRE POINT-BLANK',
  },
  'hud.tip.locked': {
    uk: 'WASD — РУХ · МИША — ОГЛЯД · КЛІК — ВОГОНЬ · 1/2/3 — ЗБРОЯ',
    en: 'WASD — MOVE · MOUSE — LOOK · CLICK — FIRE · 1/2/3 — WEAPONS',
  },
  'hud.tip.free': {
    uk: 'КЛІКНИ, ЩОБ ЗАХОПИТИ МИШУ · АБО КЛАСИКА: ←→ ПОВОРОТ, ↑↓ РУХ, SPACE — ВОГОНЬ',
    en: 'CLICK TO LOCK THE MOUSE · OR CLASSIC: ←→ TURN, ↑↓ MOVE, SPACE — FIRE',
  },
  'hud.move': { uk: 'РУХ', en: 'MOVE' },
  'hud.look': { uk: 'ОГЛЯД', en: 'LOOK' },
  'hud.fire': { uk: 'ВОГОНЬ', en: 'FIRE' },

  // ── ЭКРАН СМЕРТИ ──
  'dead.title': { uk: 'ТЕБЕ РОЗІРВАЛИ', en: 'YOU GOT RIPPED APART' },
  'dead.sub': { uk: 'хвиль пройдено: {0} · потвор: {1}', en: 'waves cleared: {0} · kills: {1}' },
  'dead.cheated': {
    uk: 'РЕКОРД НЕ ЗАРАХОВАНО — БУВ СТРИБОК ПО ХВИЛЯХ',
    en: 'NO RECORD — YOU WARPED PAST WAVES',
  },
  'dead.record': { uk: 'НОВИЙ РЕКОРД!', en: 'NEW RECORD!' },
  'dead.again': { uk: 'Ще раз', en: 'Again' },
  'dead.menu': { uk: 'У меню', en: 'Menu' },
  'dead.tap': { uk: 'ТАП ПО КНОПКЕ', en: 'TAP A BUTTON' },
  'dead.keys': { uk: 'КЛІК · АБО ← / → І ENTER', en: 'CLICK · OR ← / → AND ENTER' },

  // ── НЕБО И ПОЛ (редактор и его строка состояния) ──
  'sky.hell': { uk: 'ПЕКЛО', en: 'HELL' },
  'sky.dusk': { uk: 'ЗАХІД', en: 'DUSK' },
  'sky.day': { uk: 'ДЕНЬ', en: 'DAY' },
  'sky.void': { uk: 'КВЕЙК', en: 'QUAKE' },
  'ground.checker': { uk: 'ШАХІВНИЦЯ', en: 'CHECKER' },
  'ground.sand': { uk: 'ПІСОК', en: 'SAND' },
  'ground.sand_road': { uk: 'ПІСОК + ДОРОГА', en: 'SAND + ROAD' },
  'ground.stone': { uk: 'КАМІНЬ', en: 'STONE' },
  'ground.cobble': { uk: 'БРУКІВКА', en: 'COBBLE' },

  // ── РЕДАКТОР: шапка и подсказки ──
  'ed.title': { uk: 'РЕДАКТОР АРЕНИ', en: 'ARENA EDITOR' },
  'ed.counts': {
    uk: 'пілони {0}/{1} · факели {2}/{3} · печатки {4}/{5} · предмети {6}/{7} · розмір {8}×{8} · небо: {9} · підлога: {10}'
      + ' · размер {8}×{8} · небо: {9} · пол: {10}',
    en: 'pillars {0}/{1} · torches {2}/{3} · seals {4}/{5} · items {6}/{7}'
      + ' · size {8}×{8} · sky: {9} · floor: {10}',
  },
  'ed.needSeals': {
    uk: 'потрібно мінімум 2 печатки спавну, інакше тест не запуститься',
    en: 'at least 2 spawn seals are needed, otherwise the test will not start',
  },
  'ed.help': {
    uk: 'ЛКМ поставити · ПКМ/X прибрати · цифра — категорія (повтор гортає) · колесо — всі варіанти · T поворот 45° · WASD+SPACE/SHIFT політ (R швидше) · −/+ розмір · B небо · F підлога · G тест · Q титул · K/L зберегти/завантажити · E/I експорт/імпорт'
      + ' · WASD+SPACE/SHIFT полёт (R быстрее) · −/+ размер · B небо · F пол · G тест · Q титул · K/L сохранить/загрузить · E/I экспорт/импорт',
    en: 'LMB place · RMB/X remove · digit — category (press again to cycle) · wheel — all variants · T rotate 45°'
      + ' · WASD+SPACE/SHIFT fly (R faster) · −/+ size · B sky · F floor · G test · Q title · K/L save/load · E/I export/import',
  },
  'ed.hello': {
    uk: 'РЕДАКТОР: ЛКМ — поставити, ПКМ — прибрати, G — тест',
    en: 'EDITOR: LMB — place, RMB — remove, G — test',
  },

  // ── РЕДАКТОР: сообщения eSay и диалоги ──
  'ed.rot': { uk: 'ПОВОРОТ: {0}°', en: 'ROTATION: {0}°' },
  'ed.floor': { uk: 'ПІДЛОГА: {0}', en: 'FLOOR: {0}' },
  'ed.sky': { uk: 'НЕБО: {0}', en: 'SKY: {0}' },
  'ed.copied': { uk: 'АРЕНУ СКОПІЙОВАНО В БУФЕР', en: 'ARENA COPIED TO CLIPBOARD' },
  'ed.noClip': { uk: 'БУФЕР НЕДОСТУПНИЙ', en: 'CLIPBOARD UNAVAILABLE' },
  'ed.pastePrompt': { uk: 'Встав JSON арени:', en: 'Paste arena JSON:' },
  'ed.imported': { uk: 'АРЕНУ ІМПОРТОВАНО', en: 'ARENA IMPORTED' },
  'ed.notArena': { uk: 'НЕ СХОЖЕ НА АРЕНУ (потрібно ≥2 печатки)', en: 'NOT AN ARENA (need ≥2 seals)' },
  'ed.badJson': { uk: 'БИТИЙ JSON', en: 'BROKEN JSON' },
  'ed.defaultLoaded': { uk: 'БАЗОВУ АРЕНУ ЗАВАНТАЖЕНО', en: 'DEFAULT ARENA LOADED' },
  'ed.maxSize': { uk: 'БІЛЬШЕ НІКУДИ (40)', en: 'NO BIGGER THAN THIS (40)' },
  'ed.minSize': { uk: 'МЕНШЕ НІКУДИ (16)', en: 'NO SMALLER THAN THIS (16)' },
  'ed.size': { uk: 'РОЗМІР {0}×{0}', en: 'SIZE {0}×{0}' },
  'ed.sizeCut': { uk: " · ЗРІЗАНО ОБ'ЄКТІВ: {0}", en: ' · OBJECTS CUT: {0}' },
  'ed.namePrompt': { uk: "Ім'я арени (до 24 символів):", en: 'Arena name (up to 24 characters):' },
  'ed.nameTaken': { uk: "ЦЕ ІМ'Я ЗАЙНЯТЕ", en: 'THAT NAME IS TAKEN' },
  'ed.saved': { uk: 'ЗБЕРЕЖЕНО: {0}', en: 'SAVED: {0}' },
  'ed.loadPrompt': {
    uk: "Є: {0}\\nІм'я — завантажити, «-ім'я» — видалити:",
    en: 'Available: {0}\nName — load, "-name" — delete:',
  },
  'ed.deleted': { uk: 'ВИДАЛЕНО: {0}', en: 'DELETED: {0}' },
  'ed.noSuchOwn': { uk: 'ТАКОЇ СВОЄЇ АРЕНИ НЕМАЄ', en: 'NO SUCH ARENA OF YOURS' },
  'ed.notFound': { uk: 'НЕ ЗНАЙШОВ ТАКОЇ АРЕНИ', en: 'ARENA NOT FOUND' },
  'ed.loaded': { uk: 'ЗАВАНТАЖЕНО: {0}', en: 'LOADED: {0}' },
  'ed.needTwoSeals': { uk: 'МІНІМУМ ДВІ ПЕЧАТКИ СПАВНУ', en: 'AT LEAST TWO SPAWN SEALS' },
  'ed.capPillars': { uk: 'ПІЛОНІВ НЕ БІЛЬШЕ {0}', en: 'NO MORE THAN {0} PILLARS' },
  'ed.capTorches': { uk: 'ФАКЕЛІВ НЕ БІЛЬШЕ {0}', en: 'NO MORE THAN {0} TORCHES' },
  'ed.capSeals': { uk: 'ПЕЧАТОК НЕ БІЛЬШЕ {0}', en: 'NO MORE THAN {0} SEALS' },
  'ed.capPickups': { uk: 'ПРЕДМЕТІВ НЕ БІЛЬШЕ {0}', en: 'NO MORE THAN {0} ITEMS' },
  'ed.occupied': { uk: 'ЗАЙНЯТО — СПОЧАТКУ ПРИБЕРИ (ПКМ)', en: 'OCCUPIED — REMOVE IT FIRST (RMB)' },

  // ── РЕДАКТОР: хотбар (категории и варианты внутри них) ──
  'ed.g.wall': { uk: 'СТІНА', en: 'WALL' },
  'ed.i.wall': { uk: 'СТІНА', en: 'WALL' },
  'ed.i.wall_long': { uk: 'ДОВГА', en: 'LONG' },
  'ed.i.wall_short': { uk: 'КОРОТКА', en: 'SHORT' },
  'ed.g.column': { uk: 'КОЛОНА', en: 'COLUMN' },
  'ed.i.pillar': { uk: 'ПІЛОН', en: 'PILLAR' },
  'ed.i.pillar_big': { uk: 'ПІЛОН+', en: 'PILLAR+' },
  'ed.i.column': { uk: 'КОЛОНА', en: 'COLUMN' },
  'ed.i.obelisk': { uk: 'ОБЕЛІСК', en: 'OBELISK' },
  'ed.i.statue': { uk: 'СТАТУЯ', en: 'STATUE' },
  'ed.g.platform': { uk: 'ПЛАТФОРМИ', en: 'PLATFORMS' },
  'ed.i.steps': { uk: 'СХОДИ', en: 'STEPS' },
  'ed.i.steps_wide': { uk: 'ШИРОКІ', en: 'WIDE' },
  'ed.i.dais': { uk: 'ПЛАТФОРМА', en: 'PLATFORM' },
  'ed.i.pad': { uk: 'МАЙДАНЧИК', en: 'PAD' },
  'ed.g.pyramid': { uk: 'ПІРАМІДА', en: 'PYRAMID' },
  'ed.i.pyramid': { uk: 'ПІРАМІДА', en: 'PYRAMID' },
  'ed.i.pyramid_great': { uk: 'ВЕЛИКА', en: 'GREAT' },
  'ed.g.rubble': { uk: 'УЛАМКИ', en: 'RUBBLE' },
  'ed.i.rubble': { uk: 'ЗАВАЛ', en: 'DEBRIS' },
  'ed.i.rocks': { uk: 'КАМІННЯ', en: 'ROCKS' },
  'ed.i.boulder': { uk: 'БРИЛА', en: 'BOULDER' },
  'ed.g.torch': { uk: 'ФАКЕЛ', en: 'TORCH' },
  'ed.i.torch': { uk: 'ФАКЕЛ', en: 'TORCH' },
  'ed.g.seal': { uk: 'ПЕЧАТКА', en: 'SEAL' },
  'ed.i.seal': { uk: 'ПЕЧАТКА', en: 'SEAL' },
  'ed.g.health': { uk: "ЗДОРОВ'Я", en: 'HEALTH' },
  'ed.i.med': { uk: 'АПТЕЧКА', en: 'MEDKIT' },
  'ed.i.arm': { uk: 'БРОНЯ', en: 'ARMOR' },
  'ed.g.ammo': { uk: 'НАБОЇ', en: 'AMMO' },
  'ed.i.bul': { uk: 'НАБОЇ', en: 'BULLETS' },
  'ed.i.shl': { uk: 'ШРІТ', en: 'SHELLS' },
  'ed.i.box': { uk: 'ЯЩИК', en: 'CRATE' },
  'ed.g.start': { uk: 'СТАРТ', en: 'START' },
  'ed.i.start': { uk: 'СТАРТ', en: 'START' },
};

/** Есть ли такой ключ. Нужен там, где ярлык может прийти из данных (арены). */
export const hasStr = (key: string): boolean => key in STRINGS;

/**
 * Переводчик под выбранный язык. Пропавший ключ возвращается как есть —
 * дырку видно на экране сразу, а игра не падает посреди боя.
 */
export function makeT(lang: LangId) {
  return (key: string, ...args: (string | number)[]): string => {
    const row = STRINGS[key];
    if (!row) return key;
    const s = row[lang];
    if (!args.length) return s;
    return s.replace(/\{(\d+)\}/g, (m, i: string) => {
      const v = args[Number(i)];
      return v === undefined ? m : String(v);
    });
  };
}

export type T = ReturnType<typeof makeT>;
