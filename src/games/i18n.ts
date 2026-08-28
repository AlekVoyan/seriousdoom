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
  'title.keys': { uk: '↑↓ ВЫБОР · ENTER / SPACE — СТАРТ', en: '↑↓ SELECT · ENTER / SPACE — START' },
  // сам чит-код не переводится — он вводится клавишами, как в думе
  'title.idclev': { uk: 'IDCLEV {0}▂', en: 'IDCLEV {0}▂' },

  // ── ПУНКТЫ МЕНЮ ──
  'menu.play': { uk: 'НОВА ГРА', en: 'NEW GAME' },
  'menu.diff': { uk: 'СКЛАДНІСТЬ: {0}', en: 'DIFFICULTY: {0}' },
  'menu.arena': { uk: 'АРЕНА: {0}', en: 'ARENA: {0}' },
  'menu.arena.hint': { uk: 'базова, вбудовані та свої', en: 'default, built-in and your own' },
  'menu.lang': { uk: 'МОВА: УКРАЇНСЬКА', en: 'LANGUAGE: ENGLISH' },
  'menu.lang.hint': { uk: 'українська · english', en: 'ukrainian · english' },
  'menu.edit': { uk: 'РЕДАКТОР АРЕНИ', en: 'ARENA EDITOR' },

  // ── СЛОЖНОСТИ ──
  'diff.norm': { uk: 'ЗВИЧАЙНА', en: 'NORMAL' },
  'diff.norm.hint': { uk: 'як задумано', en: 'as intended' },
  'diff.hard': { uk: 'ВАЖКА', en: 'HARD' },
  'diff.hard.hint': { uk: 'бьют больнее, аптечки скупее', en: 'they hit harder, medkits are scarce' },
  'diff.core': { uk: 'ХАРДКОР', en: 'HARDCORE' },
  'diff.core.hint': { uk: 'месиво · патронов больше, времени нет', en: 'carnage · more ammo, no time' },

  // ── АРЕНЫ ──
  // Это ЯРЛЫКИ для показа. Ключи хранилища (fw_arena_use, имена своих арен
  // в fw_arenas) не переводятся никогда — иначе чужой сейв перестанет
  // находиться после смены языка.
  'arena.default': { uk: 'БАЗОВА', en: 'DEFAULT' },
  'arena.draft': { uk: 'ЧЕРНЕТКА', en: 'DRAFT' },
  'arena.b0': { uk: 'ПІРАМІДА', en: 'PYRAMID' },
  'arena.b1': { uk: 'АРЕНА-ГЕЙТ', en: 'ARENA GATE' },

  // ── СТАТУС-БАР И БОЙ ──
  'hud.health': { uk: 'ЗДОРОВЬЕ', en: 'HEALTH' },
  'hud.ammo': { uk: 'ПАТРОНЫ', en: 'AMMO' },
  'hud.armor': { uk: 'БРОНЯ', en: 'ARMOR' },
  'hud.weapons': { uk: 'ОРУЖИЕ · ОЧКИ', en: 'WEAPONS · SCORE' },
  'hud.wave': { uk: 'ВОЛНА {0}', en: 'WAVE {0}' },
  'hud.alive': { uk: 'ТВАРЕЙ: {0}', en: 'HOSTILES: {0}' },
  'hud.perWave': { uk: 'ЗА ВОЛНУ +{0}', en: 'WAVE BONUS +{0}' },
  'hud.kills': { uk: 'УБИТО: {0}', en: 'KILLS: {0}' },
  'hud.rush': { uk: 'ВОЛНА {0} — НАПЛЫВ БОМБИСТОВ!', en: 'WAVE {0} — BOMBER RUSH!' },
  'hud.cleared': { uk: 'ВОЛНА ЗАЧИЩЕНА', en: 'WAVE CLEARED' },
  'hud.score': { uk: 'ОЧКИ +{0}', en: 'SCORE +{0}' },
  'hud.next': { uk: 'следующая волна через {0}…', en: 'next wave in {0}…' },
  'hud.rkt': { uk: 'РАКЕТНИЦА — КЛАВИША 4', en: 'ROCKET LAUNCHER — KEY 4' },
  'hud.rkt.warn': {
    uk: 'ОСКОЛКИ БЬЮТ И ПО ТЕБЕ — НЕ СТРЕЛЯЙ В УПОР',
    en: 'SPLASH HITS YOU TOO — NEVER FIRE POINT-BLANK',
  },
  'hud.tip.locked': {
    uk: 'WASD — ХОД · МЫШЬ — ОБЗОР · КЛИК — ОГОНЬ · 1/2/3 — ОРУЖИЕ',
    en: 'WASD — MOVE · MOUSE — LOOK · CLICK — FIRE · 1/2/3 — WEAPONS',
  },
  'hud.tip.free': {
    uk: 'КЛИКНИ ДЛЯ ЗАХВАТА МЫШИ · ИЛИ КЛАССИКА: ←→ ПОВОРОТ, ↑↓ ХОД, SPACE — ОГОНЬ',
    en: 'CLICK TO LOCK THE MOUSE · OR CLASSIC: ←→ TURN, ↑↓ MOVE, SPACE — FIRE',
  },
  'hud.move': { uk: 'ХОД', en: 'MOVE' },
  'hud.look': { uk: 'ОБЗОР', en: 'LOOK' },
  'hud.fire': { uk: 'ОГОНЬ', en: 'FIRE' },

  // ── ЭКРАН СМЕРТИ ──
  'dead.title': { uk: 'ТЕБЯ РАЗОРВАЛИ', en: 'YOU GOT RIPPED APART' },
  'dead.sub': { uk: 'волн пройдено: {0} · твари: {1}', en: 'waves cleared: {0} · kills: {1}' },
  'dead.cheated': {
    uk: 'РЕКОРД НЕ ЗАСЧИТАН — БЫЛ ПРЫЖОК ПО ВОЛНАМ',
    en: 'NO RECORD — YOU WARPED PAST WAVES',
  },
  'dead.record': { uk: 'НОВЫЙ РЕКОРД!', en: 'NEW RECORD!' },
  'dead.again': { uk: 'Ещё раз', en: 'Again' },
  'dead.menu': { uk: 'В меню', en: 'Menu' },
  'dead.tap': { uk: 'ТАП ПО КНОПКЕ', en: 'TAP A BUTTON' },
  'dead.keys': { uk: 'КЛИК · ИЛИ ← / → И ENTER', en: 'CLICK · OR ← / → AND ENTER' },

  // ── НЕБО И ПОЛ (редактор и его строка состояния) ──
  'sky.hell': { uk: 'ПЕКЛО', en: 'HELL' },
  'sky.dusk': { uk: 'ЗАКАТ', en: 'DUSK' },
  'sky.day': { uk: 'ДЕНЬ', en: 'DAY' },
  'sky.void': { uk: 'КВЕЙК', en: 'QUAKE' },
  'ground.checker': { uk: 'ШАХМАТКА', en: 'CHECKER' },
  'ground.sand': { uk: 'ПЕСОК', en: 'SAND' },
  'ground.sand_road': { uk: 'ПЕСОК + ДОРОГА', en: 'SAND + ROAD' },
  'ground.stone': { uk: 'КАМЕНЬ', en: 'STONE' },
  'ground.cobble': { uk: 'БРУСЧАТКА', en: 'COBBLE' },

  // ── РЕДАКТОР: шапка и подсказки ──
  'ed.title': { uk: 'РЕДАКТОР АРЕНЫ', en: 'ARENA EDITOR' },
  'ed.counts': {
    uk: 'пилоны {0}/{1} · факелы {2}/{3} · печати {4}/{5} · предметы {6}/{7}'
      + ' · размер {8}×{8} · небо: {9} · пол: {10}',
    en: 'pillars {0}/{1} · torches {2}/{3} · seals {4}/{5} · items {6}/{7}'
      + ' · size {8}×{8} · sky: {9} · floor: {10}',
  },
  'ed.needSeals': {
    uk: 'нужно минимум 2 печати спавна, иначе тест не запустится',
    en: 'at least 2 spawn seals are needed, otherwise the test will not start',
  },
  'ed.help': {
    uk: 'ЛКМ поставить · ПКМ/X убрать · цифра — категория (повтор листает) · колесо — все варианты · T поворот 45°'
      + ' · WASD+SPACE/SHIFT полёт (R быстрее) · −/+ размер · B небо · F пол · G тест · Q титул · K/L сохранить/загрузить · E/I экспорт/импорт',
    en: 'LMB place · RMB/X remove · digit — category (press again to cycle) · wheel — all variants · T rotate 45°'
      + ' · WASD+SPACE/SHIFT fly (R faster) · −/+ size · B sky · F floor · G test · Q title · K/L save/load · E/I export/import',
  },
  'ed.hello': {
    uk: 'РЕДАКТОР: ЛКМ — поставить, ПКМ — убрать, G — тест',
    en: 'EDITOR: LMB — place, RMB — remove, G — test',
  },

  // ── РЕДАКТОР: сообщения eSay и диалоги ──
  'ed.rot': { uk: 'ПОВОРОТ: {0}°', en: 'ROTATION: {0}°' },
  'ed.floor': { uk: 'ПОЛ: {0}', en: 'FLOOR: {0}' },
  'ed.sky': { uk: 'НЕБО: {0}', en: 'SKY: {0}' },
  'ed.copied': { uk: 'АРЕНА СКОПИРОВАНА В БУФЕР', en: 'ARENA COPIED TO CLIPBOARD' },
  'ed.noClip': { uk: 'БУФЕР НЕДОСТУПЕН', en: 'CLIPBOARD UNAVAILABLE' },
  'ed.pastePrompt': { uk: 'Вставь JSON арены:', en: 'Paste arena JSON:' },
  'ed.imported': { uk: 'АРЕНА ИМПОРТИРОВАНА', en: 'ARENA IMPORTED' },
  'ed.notArena': { uk: 'НЕ ПОХОЖЕ НА АРЕНУ (нужно ≥2 печатей)', en: 'NOT AN ARENA (need ≥2 seals)' },
  'ed.badJson': { uk: 'БИТЫЙ JSON', en: 'BROKEN JSON' },
  'ed.defaultLoaded': { uk: 'БАЗОВАЯ АРЕНА ЗАГРУЖЕНА', en: 'DEFAULT ARENA LOADED' },
  'ed.maxSize': { uk: 'БОЛЬШЕ НЕКУДА (40)', en: 'NO BIGGER THAN THIS (40)' },
  'ed.minSize': { uk: 'МЕНЬШЕ НЕКУДА (16)', en: 'NO SMALLER THAN THIS (16)' },
  'ed.size': { uk: 'РАЗМЕР {0}×{0}', en: 'SIZE {0}×{0}' },
  'ed.sizeCut': { uk: ' · СРЕЗАНО ОБЪЕКТОВ: {0}', en: ' · OBJECTS CUT: {0}' },
  'ed.namePrompt': { uk: 'Имя арены (до 24 символов):', en: 'Arena name (up to 24 characters):' },
  'ed.nameTaken': { uk: 'ЭТО ИМЯ ЗАНЯТО', en: 'THAT NAME IS TAKEN' },
  'ed.saved': { uk: 'СОХРАНЕНО: {0}', en: 'SAVED: {0}' },
  'ed.loadPrompt': {
    uk: 'Есть: {0}\nИмя — загрузить, «-имя» — удалить:',
    en: 'Available: {0}\nName — load, "-name" — delete:',
  },
  'ed.deleted': { uk: 'УДАЛЕНО: {0}', en: 'DELETED: {0}' },
  'ed.noSuchOwn': { uk: 'ТАКОЙ СВОЕЙ АРЕНЫ НЕТ', en: 'NO SUCH ARENA OF YOURS' },
  'ed.notFound': { uk: 'НЕ НАШЁЛ ТАКУЮ АРЕНУ', en: 'ARENA NOT FOUND' },
  'ed.loaded': { uk: 'ЗАГРУЖЕНО: {0}', en: 'LOADED: {0}' },
  'ed.needTwoSeals': { uk: 'МИНИМУМ ДВЕ ПЕЧАТИ СПАВНА', en: 'AT LEAST TWO SPAWN SEALS' },
  'ed.capPillars': { uk: 'ПИЛОНОВ НЕ БОЛЬШЕ {0}', en: 'NO MORE THAN {0} PILLARS' },
  'ed.capTorches': { uk: 'ФАКЕЛОВ НЕ БОЛЬШЕ {0}', en: 'NO MORE THAN {0} TORCHES' },
  'ed.capSeals': { uk: 'ПЕЧАТЕЙ НЕ БОЛЬШЕ {0}', en: 'NO MORE THAN {0} SEALS' },
  'ed.capPickups': { uk: 'ПРЕДМЕТОВ НЕ БОЛЬШЕ {0}', en: 'NO MORE THAN {0} ITEMS' },
  'ed.occupied': { uk: 'ЗАНЯТО — СНАЧАЛА УБЕРИ (ПКМ)', en: 'OCCUPIED — REMOVE IT FIRST (RMB)' },

  // ── РЕДАКТОР: хотбар (категории и варианты внутри них) ──
  'ed.g.wall': { uk: 'СТЕНА', en: 'WALL' },
  'ed.i.wall': { uk: 'СТЕНА', en: 'WALL' },
  'ed.i.wall_long': { uk: 'ДЛИННАЯ', en: 'LONG' },
  'ed.i.wall_short': { uk: 'КОРОТКАЯ', en: 'SHORT' },
  'ed.g.column': { uk: 'КОЛОННА', en: 'COLUMN' },
  'ed.i.pillar': { uk: 'ПИЛОН', en: 'PILLAR' },
  'ed.i.pillar_big': { uk: 'ПИЛОН+', en: 'PILLAR+' },
  'ed.i.column': { uk: 'КОЛОННА', en: 'COLUMN' },
  'ed.i.obelisk': { uk: 'ОБЕЛИСК', en: 'OBELISK' },
  'ed.i.statue': { uk: 'СТАТУЯ', en: 'STATUE' },
  'ed.g.platform': { uk: 'ПЛАТФОРМЫ', en: 'PLATFORMS' },
  'ed.i.steps': { uk: 'СТУПЕНИ', en: 'STEPS' },
  'ed.i.steps_wide': { uk: 'ШИРОКИЕ', en: 'WIDE' },
  'ed.i.dais': { uk: 'ПЛАТФОРМА', en: 'PLATFORM' },
  'ed.i.pad': { uk: 'ПЛОЩАДКА', en: 'PAD' },
  'ed.g.pyramid': { uk: 'ПИРАМИДА', en: 'PYRAMID' },
  'ed.i.pyramid': { uk: 'ПИРАМИДА', en: 'PYRAMID' },
  'ed.i.pyramid_great': { uk: 'ВЕЛИКАЯ', en: 'GREAT' },
  'ed.g.rubble': { uk: 'ОБЛОМКИ', en: 'RUBBLE' },
  'ed.i.rubble': { uk: 'РАЗВАЛ', en: 'DEBRIS' },
  'ed.i.rocks': { uk: 'КАМНИ', en: 'ROCKS' },
  'ed.i.boulder': { uk: 'ГЛЫБА', en: 'BOULDER' },
  'ed.g.torch': { uk: 'ФАКЕЛ', en: 'TORCH' },
  'ed.i.torch': { uk: 'ФАКЕЛ', en: 'TORCH' },
  'ed.g.seal': { uk: 'ПЕЧАТЬ', en: 'SEAL' },
  'ed.i.seal': { uk: 'ПЕЧАТЬ', en: 'SEAL' },
  'ed.g.health': { uk: 'ЗДОРОВЬЕ', en: 'HEALTH' },
  'ed.i.med': { uk: 'АПТЕЧКА', en: 'MEDKIT' },
  'ed.i.arm': { uk: 'БРОНЯ', en: 'ARMOR' },
  'ed.g.ammo': { uk: 'ПАТРОНЫ', en: 'AMMO' },
  'ed.i.bul': { uk: 'ПАТРОНЫ', en: 'BULLETS' },
  'ed.i.shl': { uk: 'ДРОБЬ', en: 'SHELLS' },
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
