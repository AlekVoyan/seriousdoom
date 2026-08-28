import * as THREE from 'three';
import type { MiniGameOpts } from '../core/types';
import { makeRng } from '../core/rng';
import { box, type MiniGame3D, type MiniGame3DContext } from '../core/three3d';
import { isTouchDevice, createMultiTouch, inCircle, drawButton, fitFont } from '../core/mobile';
import { createPentagram, createEmberCloud, createDustCloud, buildMonster, buildWeapon, buildPickup, buildProp, buildRocket, bakeStatic, ROCKET, DEFAULT_ARENA, BUILTIN_ARENAS, ARENA_CAPS, validateArena, type ArenaDef, type Pentagram } from './doomModels';
import { createDoomAudio, type SfxId, type SfxLoop } from '../core/audioDoom';
import { createMusicDirector } from '../core/musicDirector';
import { makeT, hasStr, STRINGS, type LangId } from './i18n';

/**
 * Фриланс — плейтест шутера. ОРИГИНАЛЬНЫЙ воксельный оммаж: интерфейс и повадки —
 * ретро-шутер 1993-го (титул на красно-чёрном, статус-бар с ЛИЦОМ, автоприцел по
 * вертикали, вспышки урона), роспись монстров и режим — «выживание против волн».
 * Всё нарисовано своими кубами, ни одного чужого ассета или строки чужого кода.
 *
 * Один просторный уровень, волны валят со всех сторон, за отбитую волну дают
 * очки по арифметической прогрессии, смерть → «Ещё раз / В меню».
 *
 * Монстры (6 типов × 2 ранга): Гнар, Безголовый бомбист, Костяной скакун,
 * Рогач, Гарпия, Механоид. Каждая 5-я волна — наплыв бомбистов.
 * Оружие: пистолет → дробовик (в.3) → пулемёт (в.6), цифры 1/2/3.
 *
 * Управление: мышь+WASD (клик — захват мыши) ИЛИ классика ←→ поворот, ↑↓ ход,
 * Ctrl/Space — огонь. Тач: левый стик — ход, правый — обзор, кнопка — огонь.
 */
// полуразмер арены задаёт ArenaDef.size (let ARENA внутри start)
const WALL_H = 7;
const EYE = 1.62;
const P_RADIUS = 0.55;
/**
 * СЛОЖНОСТЬ. Здоровье тварей НЕ трогаем — растёт только их напор и плотность,
 * а лечиться становится труднее. Так игра давит темпом, а не «губками для пуль».
 * Логика взята у первоисточников: в думе высокая сложность = больше тварей и
 * быстрее их атаки, в сэме — ещё и заметно больше народу разом плюс ветераны.
 */
interface Diff {
  /** он же ключ рекорда (fw_best) и ключ названия в словаре: diff.<key>[.hint] */
  key: 'norm' | 'hard' | 'core';
  col: string;
  dmg: number;        // множитель урона от тварей
  heal: number;       // множитель аптечек и брони
  budget: number;     // множитель бюджета волны
  cap: number;        // потолок тварей на арене
  rate: number;       // множитель паузы между спавнами (меньше = чаще)
  vetFrom: number;    // с какой волны идут ветераны
  vetMax: number;     // предельная доля ветеранов
  atk: number;        // множитель перезарядки атак твари (меньше = злее)
  ammoMul: number;    // множитель потолков боезапаса и щедрости пикапов
  respawn: number;    // через сколько секунд возвращается подобранное
  breather: number;   // пауза между волнами
  score: number;      // множитель очков за волну
  boomAlways: boolean; // камикадзе подмешиваются в каждую волну, не только в наплывы
}
const DIFFS: Diff[] = [
  {
    key: 'norm', col: '#7bd88f',
    dmg: 1, heal: 1, budget: 1, cap: 26, rate: 1, vetFrom: 4, vetMax: 0.5,
    atk: 1, ammoMul: 1, respawn: 14, breather: 4, score: 1, boomAlways: false,
  },
  {
    key: 'hard', col: '#e8c840',
    dmg: 1.5, heal: 0.6, budget: 1.3, cap: 32, rate: 0.85, vetFrom: 2, vetMax: 0.65,
    atk: 0.8, ammoMul: 1, respawn: 12, breather: 3.5, score: 1.35, boomAlways: true,
  },
  {
    key: 'core', col: '#ff4a2a',
    dmg: 2, heal: 0.45, budget: 1.85, cap: 44, rate: 0.55, vetFrom: 1, vetMax: 0.8,
    atk: 0.6, ammoMul: 1.6, respawn: 8, breather: 2, score: 1.9, boomAlways: true,
  },
];

const BASE_SCORE = 60;
const STEP_SCORE = 40;

const C_FLOOR_A = 0x3a3230;
const C_FLOOR_B = 0x2e2624;
const C_WALL = 0x4a2c26;
const C_WALL_TRIM = 0x6a3a2c;
const C_LAVA = 0xd8541e;
const C_PILLAR = 0x5a4a44;
const C_GIB_RED = 0xa01c18;

type MK = 'gnaar' | 'boom' | 'kleer' | 'bull' | 'harpy' | 'mech';
interface MDef {
  name: string; hp: number; speed: number; melee: number; radius: number; h: number;
  color: number; cost: number; ranged?: boolean; flying?: boolean; explode?: number;
}
const MDEFS: Record<MK, MDef> = {
  gnaar: { name: 'ГНАР', hp: 30, speed: 2.6, melee: 7, radius: 0.6, h: 1.7, color: 0x7a5c8a, cost: 1 },
  boom: { name: 'БОМБИСТ', hp: 22, speed: 4.6, melee: 0, radius: 0.55, h: 1.8, color: 0xb8a070, cost: 1, explode: 24 },
  kleer: { name: 'СКАКУН', hp: 45, speed: 5.4, melee: 11, radius: 0.5, h: 1.9, color: 0xd8d2c0, cost: 2 },
  bull: { name: 'РОГАЧ', hp: 75, speed: 8.2, melee: 19, radius: 0.85, h: 1.6, color: 0x8a4a2a, cost: 3 },
  harpy: { name: 'ГАРПИЯ', hp: 26, speed: 4.2, melee: 8, radius: 0.5, h: 1.2, color: 0x6a8ab0, cost: 2, flying: true },
  mech: { name: 'МЕХАНОИД', hp: 95, speed: 1.9, melee: 0, radius: 0.8, h: 2.6, color: 0x59606a, cost: 4, ranged: true },
};

interface Mon {
  kind: MK; vet: boolean; grp: THREE.Group; parts: THREE.Mesh[];
  /** клоны материалов (геометрия общая на вариант — её не освобождать) */
  mats: THREE.Material[];
  /** вспышка «всё белое» при попадании */
  setFlash(on: boolean): void;
  x: number; z: number; y: number; hp: number; maxHp: number;
  vx: number; vz: number; t: number; atkCd: number; hurtT: number;
  state: 'walk' | 'charge' | 'wind' | 'leap' | 'recover';
  windT: number; ph: number; leapT: number; hitThisLeap: boolean;
  /** сторона обхода после сорванного тарана (рогач) */
  dodge: number;
  /** обход препятствия: сколько ещё идём вдоль него и от какой нормали */
  skirtT: number; skirtNx: number; skirtNz: number;
  /** непрерывный вой (камикадзе) — гаснет вместе с монстром */
  wail?: SfxLoop;
}
interface Gib { x: number; y: number; z: number; vx: number; vy: number; vz: number; rotX: number; rotZ: number; rx: number; rz: number; s: number; col: number; life: number }
interface Ball { mi: number; li: number; x: number; y: number; z: number; vx: number; vz: number; life: number }
interface Pickup { grp: THREE.Group; kind: 'med' | 'arm' | 'bul' | 'box' | 'shl' | 'rkt' | 'launcher'; x: number; z: number; taken: number }
interface Puff { x: number; y: number; z: number; vy: number; life: number; max: number; col: number }
/**
 * Событие журнала звуков (?sfxlog=1). Промо-ролик снимается захватом экрана, а
 * WebAudio приходит в запись с плавающей задержкой — поэтому картинку пишем
 * молча, а дорожку собирают потом по этим отметкам (t — секунды performance.now).
 * `h` — номер зацикленного голоса: без него не понять, какой из воев сдвинулся.
 * Трек `listener` — положение и взгляд бойца: без него пространство не
 * пересобрать, вся панорама и глухота считаются ОТНОСИТЕЛЬНО него.
 */
interface SfxEv {
  t: number;
  type?: 'loopStart' | 'loopMove' | 'loopStop' | 'marker' | 'listener';
  id?: SfxId; x?: number; z?: number; yaw?: number; h?: number; fade?: number;
}

const WEAPONS = [
  { name: 'ПИСТОЛЕТ', dmg: 15, cd: 0.36, spread: 0.02, pellets: 1, ammo: 'bul' as const, use: 1 },
  { name: 'ДРОБОВИК', dmg: 10, cd: 0.82, spread: 0.13, pellets: 7, ammo: 'shl' as const, use: 1 },
  { name: 'ПУЛЕМЁТ', dmg: 11, cd: 0.09, spread: 0.055, pellets: 1, ammo: 'bul' as const, use: 1 },
  { name: 'РАКЕТНИЦА', dmg: 90, cd: 0.95, spread: 0, pellets: 1, ammo: 'rkt' as const, use: 1 },
];
/** волна, на которой ракетница появляется на арене (после зачистки 15-й) */
const RKT_WAVE = 16;
/**
 * Заряд камикадзе бьёт и по СВОИМ. Урон растёт вместе с живучестью тварей, так
 * что доля от здоровья бомбиста постоянна — целый взрыв соседа переживает.
 */
const BOOM_SPLASH = { dmg: 14, radius: 4.5 };

export const doom: MiniGame3D = {
  id: 'doom',
  title: 'Фриланс — отбить DDoS',
  engine: 'reflex',
  reference: 'ретро-шутер 1993 / оборона от DDoS',
  trigger: 'Фриланс: держать порт под DDoS',
  implemented: true,
  dim: '3d',
  persp: true,
  start(ctx: MiniGame3DContext, opts: MiniGameOpts) {
    const stress = (opts.stress as number) ?? 20;
    const s01 = Math.max(0, Math.min(1, stress / 100));
    const rng = makeRng(Math.floor(Math.random() * 2 ** 31) + 1);
    const cam = ctx.camera as unknown as THREE.PerspectiveCamera;
    const mob = isTouchDevice();
    void document.fonts?.load?.('16px "PixelHalf"');
    const FONT = (n: number) => `${n}px "PixelHalf", ui-monospace, monospace`;
    const FAM = '"PixelHalf", ui-monospace, monospace';
    /** служебный моноширинный: счётчики и подсказки редактора */
    const MONO = 'ui-monospace, monospace';

    // ── ЯЗЫК ИНТЕРФЕЙСА ──
    // Выбранный лежит в fw_lang; если игрок ещё не выбирал — берём по локали
    // браузера (славянская → украинский, иначе английский). Отладочный ?lang=
    // перебивает всё, но в хранилище НЕ пишется: ссылка для скриншотов не
    // должна менять настройку живого игрока.
    const qs = new URLSearchParams(location.search);
    const pickLang = (): LangId => {
      const flag = qs.get('lang');
      if (flag === 'uk' || flag === 'en') return flag;
      try {
        const saved = localStorage.getItem('fw_lang');
        if (saved === 'uk' || saved === 'en') return saved;
      } catch { /* приватный режим */ }
      return /^(uk|ru|be)/i.test(navigator.language ?? '') ? 'uk' : 'en';
    };
    let lang: LangId = pickLang();
    // Строки нигде не кешируются: HUD рисуется каждый кадр, поэтому смена
    // языка — это просто новый t, пересобирать нечего.
    let t = makeT(lang);
    const setLang = (l: LangId) => {
      lang = l;
      t = makeT(l);
      try { localStorage.setItem('fw_lang', l); } catch { /* приватный режим */ }
    };
    const toggleLang = () => setLang(lang === 'uk' ? 'en' : 'uk');
    /** название и подсказка сложности — по её ключу */
    const dName = (d: Diff) => t(`diff.${d.key}`);
    const dHint = (d: Diff) => t(`diff.${d.key}.hint`);

    cam.fov = 78; cam.near = 0.1; cam.far = 220; cam.updateProjectionMatrix();

    // ── АД: красное небо, туман, пол-шахматка, стены, лава, пилоны, факелы ──
    ctx.scene.background = new THREE.Color(0x2a0a08);
    ctx.scene.fog = new THREE.Fog(0x300c08, 22, 80);
    // ── СОЛНЦЕ (для неба «день»): яркий диск в небе + линзовый флейр в HUD ──
    const SUN_POS = new THREE.Vector3(-70, 118, -150);   // над пирамидой, в лицо бойцу
    const sunSprite = (() => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g2 = c.getContext('2d')!;
      const grad = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,240,1)');
      grad.addColorStop(0.22, 'rgba(255,244,200,0.9)');
      grad.addColorStop(0.5, 'rgba(255,224,150,0.32)');
      grad.addColorStop(1, 'rgba(255,210,120,0)');
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 128, 128);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false,
      }));
      spr.position.copy(SUN_POS);
      spr.scale.setScalar(52);
      spr.visible = false;
      ctx.scene.add(spr);
      return spr;
    })();

    // ── БАГРОВЫЙ КУПОЛ (небо «КВЕЙК»): тёмный верх, огненный горизонт, хмары ──
    const skyDome = (() => {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 256;
      const g2 = c.getContext('2d')!;
      const grad = g2.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#12040a');
      grad.addColorStop(0.42, '#4a0c0a');
      grad.addColorStop(0.72, '#8e1c0c');
      grad.addColorStop(0.86, '#d84416');
      grad.addColorStop(1, '#e85a1e');
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 512, 256);
      // тучи: тёмные рваные пятна, нарисованные с горизонтальным заворотом
      let hsh = 1234567;
      const rnd = () => { hsh = (hsh * 1103515245 + 12345) & 0x7fffffff; return hsh / 0x7fffffff; };
      for (let i = 0; i < 90; i++) {
        const cx = rnd() * 512, cy = rnd() * rnd() * 190;
        const rx = 26 + rnd() * 80, ry = 7 + rnd() * 18;
        const dark = rnd() < 0.72;
        g2.fillStyle = dark
          ? `rgba(16,3,6,${(0.10 + rnd() * 0.22).toFixed(3)})`
          : `rgba(214,70,22,${(0.08 + rnd() * 0.14).toFixed(3)})`;
        for (const off of [-512, 0, 512]) {
          g2.beginPath();
          g2.ellipse(cx + off, cy, rx, ry, 0, 0, Math.PI * 2);
          g2.fill();
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(190, 28, 14),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
      );
      dome.visible = false;
      ctx.scene.add(dome);
      return dome;
    })();

    /** небо арены: фон, туман и базовый свет; титул всегда адский */
    const applySky = (sky: ArenaDef['sky']) => {
      const cfg = sky === 'day'
        ? { bg: 0x6fa8dc, fog: 0x9cc2e0, near: 46, far: 195, amb: 1.0, dir: 0.75, fill: 0.1 }
        : sky === 'dusk'
          ? { bg: 0x542012, fog: 0x4c1e10, near: 30, far: 115, amb: 0.74, dir: 0.42, fill: 0.28 }
          : sky === 'void'
            ? { bg: 0x0d0608, fog: 0x150a0e, near: 24, far: 92, amb: 0.5, dir: 0.24, fill: 0.36 }
            : { bg: 0x2a0a08, fog: 0x300c08, near: 22, far: 80, amb: 0.62, dir: 0.3, fill: 0.4 };
      (ctx.scene.background as THREE.Color).setHex(cfg.bg);
      const f = ctx.scene.fog as THREE.Fog;
      f.color.setHex(cfg.fog); f.near = cfg.near; f.far = cfg.far;
      ctx.scene.traverse((o) => {
        const l = o as THREE.Light;
        if ((o as THREE.AmbientLight).isAmbientLight) l.intensity = cfg.amb;
        else if ((o as THREE.DirectionalLight).isDirectionalLight && o !== hellFill) l.intensity = cfg.dir;
      });
      hellFill.intensity = cfg.fill;
      sunSprite.visible = sky === 'day';
      skyDome.visible = sky === 'void';
    };

    // ── АРЕНА ──
    // Неподвижная часть (пол, стены, лава) фиксирована. Переменная часть
    // (пилоны, факелы, печати, пикапы, старт) описана ArenaDef: игра строит
    // её из данных, редактор те же данные редактирует и пересобирает.
    // Хранилище: fw_arenas = {имя: арена}, fw_arena_draft = черновик редактора,
    // fw_arena_use = 'default' | 'b:<номер встроенной>' | 'draft' | 'u:<имя>'.
    // Старый формат (fw_arena + use='custom') мигрирует в черновик.
    const loadStore = (): Record<string, ArenaDef> => {
      const res: Record<string, ArenaDef> = {};
      try {
        const o = JSON.parse(localStorage.getItem('fw_arenas') ?? '{}') as Record<string, unknown>;
        for (const [k, v] of Object.entries(o)) {
          const d = validateArena(v);
          if (d && k.length <= 24) res[k] = d;
        }
      } catch { /* пусто */ }
      return res;
    };
    const saveStore = (st: Record<string, ArenaDef>) => {
      try { localStorage.setItem('fw_arenas', JSON.stringify(st)); } catch { /* нет места */ }
    };
    try {   // миграция старого формата
      if (localStorage.getItem('fw_arena') && !localStorage.getItem('fw_arena_draft')) {
        localStorage.setItem('fw_arena_draft', localStorage.getItem('fw_arena')!);
        if (localStorage.getItem('fw_arena_use') === 'custom') localStorage.setItem('fw_arena_use', 'draft');
        localStorage.removeItem('fw_arena');
      }
    } catch { /* noop */ }

    /**
     * Ярлык встроенной арены на языке интерфейса. Перевода может не быть
     * (добавили новую встроенную — словарь ещё не догнал), тогда показываем
     * её собственное имя из doomModels.
     */
    const builtinLabel = (i: number): string =>
      hasStr(`arena.b${i}`) ? t(`arena.b${i}`) : BUILTIN_ARENAS[i].name;
    /** варианты для переключателя в титуле: базовая, встроенные, черновик, свои */
    const arenaOptions = (): { token: string; label: string }[] => {
      const opts = [{ token: 'default', label: t('arena.default') }];
      BUILTIN_ARENAS.forEach((_, i) => opts.push({ token: `b:${i}`, label: builtinLabel(i) }));
      if (localStorage.getItem('fw_arena_draft')) opts.push({ token: 'draft', label: t('arena.draft') });
      for (const nm of Object.keys(loadStore())) opts.push({ token: `u:${nm}`, label: nm });
      return opts;
    };
    /**
     * Имена, которые нельзя занять своей ареной: и собственные имена
     * встроенных, и их ярлыки на ОБОИХ языках — иначе после переключения
     * языка своя арена начнёт спорить со встроенной в диалоге загрузки.
     */
    const reservedArenaNames = (): Set<string> => {
      const res = new Set<string>();
      const both = (key: string) => { const r = STRINGS[key]; if (r) { res.add(r.uk); res.add(r.en); } };
      both('arena.default'); both('arena.draft');
      BUILTIN_ARENAS.forEach((b, i) => { res.add(b.name); both(`arena.b${i}`); });
      return res;
    };
    /** названия неба и пола — общие у редактора и его строки состояния */
    const skyName = (s: ArenaDef['sky']) => t(`sky.${s ?? 'hell'}`);
    const groundName = (gr: ArenaDef['ground']) => t(`ground.${gr ?? 'checker'}`);
    const loadArena = (): ArenaDef => {
      const use = localStorage.getItem('fw_arena_use') ?? 'default';
      try {
        if (use.startsWith('b:')) {
          const b = BUILTIN_ARENAS[Number(use.slice(2))];
          if (b) return structuredClone(b.def);
        } else if (use === 'draft') {
          const v = validateArena(JSON.parse(localStorage.getItem('fw_arena_draft') ?? ''));
          if (v) return v;
        } else if (use.startsWith('u:')) {
          const st = loadStore();
          const d = st[use.slice(2)];
          if (d) return structuredClone(d);
        }
      } catch { /* битое — базовая */ }
      return structuredClone(DEFAULT_ARENA);
    };
    let A: ArenaDef = loadArena();
    let ARENA = A.size;   // полуразмер: обновляется при пересборке арены

    // всё строится в buildArenaLive: размер арены теперь часть ArenaDef
    interface Pillar {
      x: number; z: number; r: number; rz: number;
      /** поворот в градусах (0/45/90/135) — только визуал */
      rot: number;
      /** полуширины ОПИСАННОГО прямоугольника — для коллизий и линии огня */
      ex: number; ez: number;
      kind: 'block' | 'obelisk' | 'wall' | 'pyramid' | 'rubble' | 'column' | 'steps' | 'rock' | 'statue';
    }
    /** проходимая платформа: на неё можно зайти, край — пандус-«ступеньки» */
    interface Dais { x: number; z: number; rx: number; rz: number; rot: number; ex: number; ez: number; h: number }
    interface Torch { light: THREE.PointLight; flame: THREE.Mesh; ph: number }
    let pillars: Pillar[] = [];
    let daises: Dais[] = [];
    let torches: Torch[] = [];
    let portals: Pentagram[] = [];
    let portalLights: THREE.PointLight[] = [];
    let SPAWNS: [number, number][] = [];
    let arenaGrp: THREE.Group | null = null;    // запечённые пилоны и стойки факелов
    let arenaBits: THREE.Object3D[] = [];       // пламя, света, печати, черепа

    /** высота пола в точке: платформы поднимают, край — плавный подъём ~1 м */
    const groundY = (x: number, z: number): number => {
      let y = 0;
      for (const d of daises) {
        const inX = d.ex - Math.abs(x - d.x);
        const inZ = d.ez - Math.abs(z - d.z);
        if (inX <= 0 || inZ <= 0) continue;
        const k = Math.min(1, Math.min(inX, inZ) / 1.1);
        y = Math.max(y, d.h * k);
      }
      return y;
    };

    const buildArenaLive = (def: ArenaDef) => {
      ARENA = def.size;
      const varG = new THREE.Group();
      // пол-шахматка и стены — размер из def (дробный шаг цикла покрывает любой чётный размер)
      const TS = 4;
      const ground = def.ground ?? 'checker';
      // песок: оттенки выбираются детерминированно от клетки — пересборка
      // редактора не «переливает» пустыню заново
      const SAND = [0xc4a26c, 0xb8965e, 0xcfae78, 0xbd9c66, 0xd4b582];
      const ROAD = [0x8f7f62, 0x9a8a6c];
      for (let ix = -ARENA / TS; ix < ARENA / TS; ix++) {
        for (let iz = -ARENA / TS; iz < ARENA / TS; iz++) {
          const cx = ix * TS + TS / 2;
          let col: number;
          if (ground === 'checker') col = (ix + iz) % 2 ? C_FLOOR_A : C_FLOOR_B;
          else if (ground === 'sand_road' && Math.abs(cx) < TS) col = ROAD[(((ix + iz) % 2) + 2) % 2];
          else {
            const STONE = [0x4c4238, 0x554a40, 0x453c34, 0x5c5046];
            const COBBLE = [0x4a3440, 0x543a46, 0x412f3a, 0x5a4050];
            const h = Math.abs((ix * 73856093) ^ (iz * 19349663));
            col = ground === 'stone' ? STONE[h % STONE.length]
              : ground === 'cobble' ? COBBLE[h % COBBLE.length]
                : SAND[h % SAND.length];
          }
          const t = box(TS - 0.06, 0.3, TS - 0.06, col);
          t.position.set(cx, -0.15, iz * TS + TS / 2);
          varG.add(t);
        }
      }
      for (const [wx, wz, ww, wd] of [
        [0, -ARENA, ARENA * 2 + 2, 1], [0, ARENA, ARENA * 2 + 2, 1],
        [-ARENA, 0, 1, ARENA * 2 + 2], [ARENA, 0, 1, ARENA * 2 + 2],
      ] as [number, number, number, number][]) {
        const w = box(ww, WALL_H, wd, C_WALL);
        w.position.set(wx, WALL_H / 2, wz);
        varG.add(w);
        const trim = box(ww + 0.1, 0.5, wd + 0.1, C_WALL_TRIM);
        trim.position.set(wx, 1.1, wz);
        varG.add(trim);
        const top = box(ww + 0.3, 0.6, wd + 0.3, C_WALL_TRIM);
        top.position.set(wx, WALL_H, wz);
        varG.add(top);
      }
      for (const [lx, lz, lw, ld] of [
        [0, -ARENA - 9, ARENA * 2 + 26, 18], [0, ARENA + 9, ARENA * 2 + 26, 18],
        [-ARENA - 9, 0, 18, ARENA * 2 + 2], [ARENA + 9, 0, 18, ARENA * 2 + 2],
      ] as [number, number, number, number][]) {
        // Basic, не Standard: лава сама светится, а PBR на четырёх экранных
        // плоскостях перемножал каждый пиксель на все ~25 источников сцены —
        // взгляд на лаву в упор ронял кадры
        const lava = new THREE.Mesh(
          new THREE.BoxGeometry(lw, 0.3, ld),
          new THREE.MeshBasicMaterial({ color: 0xf26418 }),
        );
        lava.position.set(lx, -0.9, lz);
        ctx.scene.add(lava);
        arenaBits.push(lava);
      }
      // описанный прямоугольник повёрнутого следа: 0/90 — точный, 45/135 — рамка
      const ext = (rx: number, rz: number, rot: number): [number, number] =>
        rot === 0 ? [rx, rz] : rot === 90 ? [rz, rx] : [(rx + rz) * 0.7071, (rx + rz) * 0.7071];
      pillars = def.pillars
        .filter((p) => p.kind !== 'dais')
        .map((p) => {
          const rz = p.rz ?? p.r, rot = p.rot ?? 0;
          const [ex, ez] = ext(p.r, rz, rot);
          return { x: p.x, z: p.z, r: p.r, rz, rot, ex, ez, kind: (p.kind ?? 'block') as Pillar['kind'] };
        });
      daises = def.pillars
        .filter((p) => p.kind === 'dais')
        .map((p) => {
          const rz = p.rz ?? p.r, rot = p.rot ?? 0;
          const [ex, ez] = ext(p.r, rz, rot);
          return { x: p.x, z: p.z, rx: p.r, rz, rot, ex, ez, h: 0.9 };
        });
      // платформы: ржавый верх и две ступеньки-юбки по периметру
      for (const d of daises) {
        const sub = new THREE.Group();
        sub.position.set(d.x, 0, d.z);
        sub.rotation.y = (d.rot * Math.PI) / 180;
        const put = (w: number, h: number, dd: number, c: number, oy: number) => {
          const m = box(w, h, dd, c); m.position.y = oy; sub.add(m);
        };
        put(d.rx * 2 + 1.0, 0.3, d.rz * 2 + 1.0, 0x6a3416, 0.15);
        put(d.rx * 2 + 0.5, 0.3, d.rz * 2 + 0.5, 0x84421c, 0.45);
        put(d.rx * 2, 0.34, d.rz * 2, 0xa04c1e, 0.73);
        put(d.rx * 2 - 1.2, 0.06, d.rz * 2 - 1.2, 0x7a3a18, 0.93);
        varG.add(sub);
      }
      for (const p of pillars) {
        // структура собирается в подгруппе со смещениями от центра — так
        // поворот на 45° достаётся бесплатно, а bakeStatic запечёт мировую позу
        const sub = new THREE.Group();
        sub.position.set(p.x, 0, p.z);
        sub.rotation.y = (p.rot * Math.PI) / 180;
        varG.add(sub);
        const put = (w: number, h: number, dd: number, c: number, ox: number, oy: number, oz: number, ry = 0) => {
          const m = box(w, h, dd, c);
          m.position.set(ox, oy, oz);
          m.rotation.y = ry;
          sub.add(m);
          return m;
        };
        if (p.kind === 'obelisk') {
          put(p.r * 2 + 0.6, 0.8, p.rz * 2 + 0.6, C_WALL_TRIM, 0, 0.4, 0);
          put(p.r * 2, 3.4, p.rz * 2, C_PILLAR, 0, 2.5, 0);
          put(p.r * 1.5, 3.4, p.rz * 1.5, C_PILLAR, 0, 5.9, 0);
          put(p.r * 1.05, 3.0, p.rz * 1.05, C_PILLAR, 0, 9.1, 0);
          put(p.r * 0.7, 0.9, p.rz * 0.7, C_LAVA, 0, 11.05, 0);
        } else if (p.kind === 'wall') {
          put(p.r * 2, 4.2, p.rz * 2, C_WALL, 0, 2.1, 0);
          put(p.r * 2 + 0.3, 0.5, p.rz * 2 + 0.3, C_WALL_TRIM, 0, 4.35, 0);
          put(p.r * 2 + 0.4, 0.4, p.rz * 2 + 0.4, C_WALL_TRIM, 0, 0.2, 0);
        } else if (p.kind === 'column') {
          put(p.r * 2 + 0.5, 0.6, p.rz * 2 + 0.5, C_WALL_TRIM, 0, 0.3, 0);
          put(p.r * 1.6, 5.4, p.rz * 1.6, C_PILLAR, 0, 3.3, 0);
          put(p.r * 2 + 0.4, 0.5, p.rz * 2 + 0.4, C_WALL_TRIM, 0, 6.25, 0);
          put(p.r * 2, 0.4, p.rz * 2, C_PILLAR, 0, 6.7, 0);
        } else if (p.kind === 'steps') {
          const alongZ = p.rz <= p.r;
          const n = 3;
          for (let i = 0; i < n; i++) {
            const h = 0.55 * (i + 1);
            if (alongZ) {
              const dd = (p.rz * 2) / n;
              put(p.r * 2, h, dd, i % 2 ? C_PILLAR : C_WALL_TRIM, 0, h / 2, p.rz - dd * (i + 0.5));
            } else {
              const dd = (p.r * 2) / n;
              put(dd, h, p.rz * 2, i % 2 ? C_PILLAR : C_WALL_TRIM, p.r - dd * (i + 0.5), h / 2, 0);
            }
          }
        } else if (p.kind === 'statue') {
          put(p.r * 2 + 0.4, 0.5, p.rz * 2 + 0.4, 0x3a2620, 0, 0.25, 0);
          put(p.r * 2, 1.7, p.rz * 2, 0x4c3228, 0, 1.35, 0);
          put(p.r * 2 + 0.3, 0.3, p.rz * 2 + 0.3, 0x3a2620, 0, 2.35, 0);
          const B = 0xd8d2c0, BD = 0xb8b2a0;
          put(0.34, 0.9, 0.4, BD, -0.28, 2.95, 0);
          put(0.34, 0.9, 0.4, BD, 0.28, 2.95, 0);
          put(1.0, 1.1, 0.55, B, 0, 3.95, 0);
          put(0.3, 0.8, 0.34, B, -0.62, 4.0, 0);
          put(0.3, 0.7, 0.34, B, 0.62, 4.35, 0);
          put(0.26, 0.8, 0.3, B, 0.62, 5.05, 0);
          put(0.3, 0.24, 0.3, BD, 0.62, 5.55, 0);
          put(0.5, 0.5, 0.45, B, 0, 4.8, 0);
          put(0.5, 0.14, 0.2, BD, 0, 4.56, -0.2);
        } else if (p.kind === 'rock') {
          let hsh = Math.abs(Math.round(p.x * 53 + p.z * 29)) + 3;
          const rnd = () => { hsh = (hsh * 1103515245 + 12345) & 0x7fffffff; return hsh / 0x7fffffff; };
          const n = 2 + Math.floor(rnd() * 2);
          const RC = [0x6a6058, 0x5a5048, 0x746a60];
          for (let i = 0; i < n; i++) {
            const w = p.r * (0.7 + rnd() * 0.9);
            const h = 0.6 + rnd() * (p.r * 1.1);
            put(w, h, p.rz * (0.7 + rnd() * 0.9), RC[Math.floor(rnd() * RC.length)],
              (rnd() - 0.5) * p.r, h / 2 - 0.05, (rnd() - 0.5) * p.rz, (rnd() - 0.5) * 0.9);
          }
        } else if (p.kind === 'rubble') {
          const CH = [C_PILLAR, C_WALL_TRIM, 0x6a5a4c, C_WALL];
          let hsh = Math.abs(Math.round(p.x * 31 + p.z * 17)) + 7;
          const rnd = () => { hsh = (hsh * 1103515245 + 12345) & 0x7fffffff; return hsh / 0x7fffffff; };
          const n = 9 + Math.floor(rnd() * 4);
          for (let i = 0; i < n; i++) {
            const w = 0.7 + rnd() * (p.r * 0.6);
            const dd = 0.6 + rnd() * (p.rz * 1.2);
            const h = 0.5 + rnd() * 1.6;
            put(w, h, dd, CH[Math.floor(rnd() * CH.length)],
              (rnd() - 0.5) * (p.r * 2 - w), h / 2 - 0.06 + rnd() * 0.3, (rnd() - 0.5) * (p.rz * 2 - dd), (rnd() - 0.5) * 0.6);
          }
          const big = put(p.r * 0.9, 1.4, p.rz * 1.1, C_PILLAR, 0, 1.5, 0, 0.2);
          void big;
        } else if (p.kind === 'pyramid') {
          const tiers = 5;
          for (let i = 0; i < tiers; i++) {
            const k = 1 - i / tiers;
            put(p.r * 2 * k, 1.7, p.rz * 2 * k, i % 2 ? C_PILLAR : C_WALL, 0, 0.85 + i * 1.7, 0);
          }
          put(1.1, 1.1, 1.1, C_LAVA, 0, tiers * 1.7 + 0.5, 0);
        } else {
          put(p.r * 2, 5, p.rz * 2, C_PILLAR, 0, 2.5, 0);
          put(p.r * 2 + 0.5, 0.5, p.rz * 2 + 0.5, C_WALL_TRIM, 0, 5.2, 0);
          put(p.r * 2 + 0.6, 0.4, p.rz * 2 + 0.6, C_WALL_TRIM, 0, 0.2, 0);
          // череп — узнаваемая деталь больших пилонов (модель общая с меню)
          if (p.r > 2) {
            const skull = bakeStatic(buildProp('skull'));
            skull.scale.setScalar(1.25);
            skull.position.set(p.x, 2.5, p.z - p.rz - 0.15);
            ctx.scene.add(skull);
            arenaBits.push(skull);
          }
        }
      }
      torches = [];
      for (const t of def.torches) {
        // стойка до кронштейна: факел может стоять и посреди арены
        const pole = box(0.16, 2.6, 0.16, 0x241c18);
        pole.position.set(t.x, 1.3, t.z);
        varG.add(pole);
        const bracket = box(0.3, 0.9, 0.3, 0x2a2220);
        bracket.position.set(t.x, 3.0, t.z);
        varG.add(bracket);
        const flame = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.7, 0.45),
          new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a20, emissiveIntensity: 1.6, roughness: 1 }),
        );
        flame.position.set(t.x, 3.7, t.z);
        ctx.scene.add(flame);
        arenaBits.push(flame);
        const light = new THREE.PointLight(0xff8a3a, 1.5, 18, 1.6);
        light.position.set(t.x, 3.9, t.z);
        ctx.scene.add(light);
        arenaBits.push(light);
        torches.push({ light, flame, ph: rng() * 6.28 });
      }
      SPAWNS = def.seals.map((sl) => [sl.x, sl.z] as [number, number]);
      portals = [];
      portalLights = [];
      for (const [spx, spz] of SPAWNS) {
        const pent = createPentagram(1.75);
        pent.grp.position.set(spx, groundY(spx, spz), spz);
        pent.grp.rotation.y = rng() * Math.PI * 2;
        ctx.scene.add(pent.grp);
        arenaBits.push(pent.grp);
        portals.push(pent);
        const pl = new THREE.PointLight(0xff2a10, 0.6, 7, 1.8);
        pl.position.set(spx, 0.5, spz);
        ctx.scene.add(pl);
        arenaBits.push(pl);
        portalLights.push(pl);
      }
      arenaGrp = bakeStatic(varG);
      ctx.scene.add(arenaGrp);
    };
    const disposeArenaLive = () => {
      if (arenaGrp) { ctx.scene.remove(arenaGrp); disposeTree(arenaGrp); arenaGrp = null; }
      for (const o of arenaBits) { ctx.scene.remove(o); disposeTree(o); }
      arenaBits = [];
      pillars = []; torches = []; portals = []; portalLights = []; SPAWNS = [];
    };
    buildArenaLive(A);

    // ── ДИОРАМА ТИТУЛА ──
    // Живёт высоко над ареной: в титуле камера уезжает туда, и в кадре только
    // два черепа в красном мареве, а арену не видно даже на дальней границе.
    const MENU_Y = 300, MENU_DIST = 6.5, SK_BASE = 1.8;
    const menuRig = new THREE.Group();
    menuRig.position.set(0, MENU_Y, 0);
    menuRig.visible = false;
    ctx.scene.add(menuRig);

    const menuSkulls: THREE.Group[] = [];
    const menuEyes: THREE.PointLight[] = [];
    for (const side of [-1, 1]) {
      const sk = bakeStatic(buildProp('skull'));
      sk.userData.side = side;
      menuRig.add(sk);
      menuSkulls.push(sk);
      // ВАЖНО: свет — прямо в сцену, а не в menuRig. Спрятать группу значит
      // убрать её источники из списка, а это пересборка программ (см. lagtest.html).
      // Лампы живут всегда, на арене просто гасятся; диорама на 300 м выше,
      // добить до пола они всё равно не могут.
      const eye = new THREE.PointLight(0xff3410, 0, 9, 1.7);   // угли в глазницах
      ctx.scene.add(eye);
      menuEyes.push(eye);
    }
    const menuKey = new THREE.PointLight(0xffa055, 0, 30, 1.2);
    menuKey.position.set(0, MENU_Y + 2.2, 4.4);
    ctx.scene.add(menuKey);

    // крупные искры: поднимаются из-под черепов и гаснут чуть выше них
    interface MPart { on: boolean; side: number; jx: number; jz: number; y0: number; vy: number; life: number; max: number; spin: number; rot: number; s: number; col: THREE.Color }
    const MP_MAX = 54;
    const mparts: MPart[] = [];
    for (let i = 0; i < MP_MAX; i++) {
      mparts.push({ on: false, side: 1, jx: 0, jz: 0, y0: 0, vy: 1, life: 0, max: 1, spin: 0, rot: 0, s: 1, col: new THREE.Color() });
    }
    const mpCloud = createEmberCloud(MP_MAX, 1);
    menuRig.add(mpCloud.mesh);
    const mpTmp = new THREE.Color();
    let mpT = 0, menuSX = 6, menuTop = 4, mpWarm = false;

    /** раскладка титула под текущее соотношение сторон + анимация */
    const updateMenuRig = (dt: number, t: number) => {
      const halfH = Math.tan((cam.fov * Math.PI) / 360) * MENU_DIST;
      const halfW = halfH * cam.aspect;
      // на узком экране черепа съезжают к центру и мельчают, но остаются «по бокам»
      const sc = SK_BASE * Math.min(1, halfW / 8.6);
      // край черепа в кадре ≈ 0.94 × масштаб; держим от него зазор до границы
      menuSX = Math.max(2.2, Math.min(halfW * 0.66, halfW - 1.05 * sc - 0.55));
      menuTop = sc * 1.15 + 1.9;                 // гаснут заметно выше макушки
      for (const sk of menuSkulls) {
        const side = sk.userData.side as number;
        sk.scale.setScalar(sc);
        sk.position.set(side * menuSX, Math.sin(t * 1.1 + side) * 0.14, 0);
        // Модель лицом в −Z, камера с +Z — разворот на π. Плюс доворот к камере:
        // череп сильно смещён от оси, без этого он показывает щёку, а не лицо.
        const aim = Math.atan2(-side * menuSX, MENU_DIST) * 0.8;
        sk.rotation.y = Math.PI + aim + Math.sin(t * 0.5 + side * 1.4) * 0.22;
      }
      for (let i = 0; i < menuEyes.length; i++) {
        const side = i === 0 ? -1 : 1;
        menuEyes[i].position.set(side * menuSX, MENU_Y + sc * 0.78, 0.7);
        menuEyes[i].intensity = 2.6 + 1.1 * Math.sin(t * 2.4 + side * 2);
      }
      menuKey.intensity = 3.0 + 0.6 * Math.sin(t * 1.7);

      // прогрев: к первому кадру титула столбы уже стоят, а не начинают с нуля
      let spawns = 0;
      if (!mpWarm) { mpWarm = true; spawns = mparts.length; }
      mpT -= dt;
      if (mpT <= 0) { spawns = Math.max(spawns, 1); mpT = 0.05; }
      for (let q = 0; q < spawns; q++) {
        const free = mparts.find((p) => !p.on);
        if (free) {
          free.side = Math.random() < 0.5 ? -1 : 1;
          free.jx = (Math.random() - 0.5) * 2.7;
          free.jz = (Math.random() - 0.5) * 1.9 - 0.15;
          free.y0 = -2.0 - Math.random() * 0.7;
          free.vy = 1.05 + Math.random() * 0.95;
          free.max = (menuTop - free.y0) / free.vy;
          free.life = 0;
          free.spin = (Math.random() - 0.5) * 3.4;
          free.rot = Math.random() * 6.28;
          free.s = 0.13 + Math.random() * 0.19;                   // крупные, но не щепки
          // разброс по температуре: от жёлто-белых до тёмно-багровых
          const heat = Math.random();
          free.col.setHSL(0.02 + heat * 0.075, 1, 0.3 + heat * 0.33);
          free.on = true;
          if (q > 0) free.life = Math.random() * free.max;        // разбросать по высоте
        }
      }
      let mpLive = 0;
      for (const p of mparts) {
        if (!p.on) continue;
        p.life += dt;
        const k = p.life / p.max;
        if (k >= 1) { p.on = false; continue; }
        p.rot += dt * p.spin;
        mpTmp.copy(p.col).multiplyScalar(0.95 * (1 - k * k));
        mpCloud.put(mpLive++, p.side * menuSX + p.jx, p.y0 + p.vy * p.life, p.jz,
          p.s, p.rot * 0.6, p.rot, mpTmp);
      }
      mpCloud.commit(mpLive);
    };

    // ── свет ──
    ctx.scene.traverse((o) => {
      const a = o as THREE.AmbientLight, d = o as THREE.DirectionalLight;
      if (a.isAmbientLight) (o as THREE.Light).intensity = 0.62;
      else if (d.isDirectionalLight) (o as THREE.Light).intensity = 0.3;
    });
    const hellSun = new THREE.DirectionalLight(0xff8a5a, 1.15);
    hellSun.position.set(-20, 30, -10);
    ctx.scene.add(hellSun);
    const hellFill = new THREE.DirectionalLight(0x9a6aff, 0.4);
    hellFill.position.set(14, 16, 18);
    ctx.scene.add(hellFill);
    // «фонарь» игрока — монстры читаются даже в дальних углах
    const playerLamp = new THREE.PointLight(0xffd0a0, 1.5, 30, 1.3);
    ctx.scene.add(playerLamp);
    const muzzleLight = new THREE.PointLight(0xfff0c0, 0, 22, 1.6);

    // ── ПУЛЫ: в бою ничего не создаём и ничего не добавляем в сцену ──
    // Точечный свет НЕЛЬЗЯ подключать/отключать на лету: при смене их числа
    // three пересобирает программы для всех материалов сцены. Замер (lagtest.html)
    // дал средний кадр 13 мс вместо 1.8 и провал до 167 мс — это и есть лаг
    // от механоидов. Свет живёт всегда, гасим и зажигаем яркостью.
    const BALL_MAX = 14, BALL_LIGHTS = 6;
    const ballGeo = new THREE.SphereGeometry(0.26, 10, 8);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xff8020, emissive: 0xff6010, emissiveIntensity: 2, roughness: 1 });
    const ballMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < BALL_MAX; i++) {
      const bm = new THREE.Mesh(ballGeo, ballMat);
      bm.visible = false;
      ctx.scene.add(bm);
      ballMeshes.push(bm);
    }
    const ballLights: THREE.PointLight[] = [];
    for (let i = 0; i < BALL_LIGHTS; i++) {
      const bl = new THREE.PointLight(0xff7020, 0, 8, 1.6);
      ctx.scene.add(bl);
      ballLights.push(bl);
    }
    /** освободить геометрию и материалы поддерева — иначе копятся в видеопамяти */
    const disposeTree = (o: THREE.Object3D) => {
      o.traverse((c) => {
        const mm = c as THREE.Mesh;
        if (!mm.isMesh) return;
        mm.geometry?.dispose();
        const mt = mm.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mt)) { for (const x of mt) { if (!x.userData.shared) x.dispose(); } }
        else if (mt && !mt.userData.shared) mt.dispose();
      });
    };
    ctx.scene.add(muzzleLight);

    // ── оружие в руках (воксель-модель у нижнего края) ──
    const gunGrp = new THREE.Group();
    cam.add(gunGrp);
    // Все четыре ствола собраны один раз; переключение — только видимость.
    // Раньше каждая смена оружия пересобирала модель и ничего не освобождала.
    const gunModels: THREE.Group[] = [];
    for (let i = 0; i < WEAPONS.length; i++) {
      const gm = buildWeapon(i).grp;
      gm.visible = false;
      gunGrp.add(gm);
      gunModels.push(gm);
    }
    ctx.scene.add(cam);
    const buildGun = (idx: number) => {
      for (let i = 0; i < gunModels.length; i++) gunModels[i].visible = i === idx;
    };
    let weapon = 0;
    const owned = [true, false, false];
    buildGun(0);

    // ── состояние игрока ──
    /** скорость бойца; автопилоту она же нужна, чтобы мерить «сколько прошли за кадр» */
    const SPD = 7.4;
    let px = A.start.x, pz = A.start.z, yaw = 0, pitch = 0;
    let pY = 0;   // высота пола под игроком (платформы)
    let hp = 100, armor = 0;
    const ammo = { bul: 60, shl: 0, rkt: 0 };
    let fireCd = 0, bob = 0, kick = 0, flashT = 0, flashCol = 0;
    // отладка: ?wave=20 стартует сразу с двадцатой, ?perf=1 включает счётчик
    // (сам qs разобран выше — он нужен уже для ?lang)
    const startWaveAt = Math.max(1, Math.min(99, Number(qs.get('wave')) || 1));
    let showPerf = qs.get('perf') === '1';
    // Флаги под запись промо-роликов. Дубль идёт целиком, без монтажных склеек:
    // боец не должен умирать посреди волны (?god=1) и не должен занимать руки
    // (?bot=1), музыка кладётся отдельным слоем (?music=0), а звуки собираются
    // по журналу (?sfxlog=1) — в захвате экрана они плывут по времени.
    const godMode = qs.get('god') === '1';
    const botMode = qs.get('bot') === '1';
    const sfxLog = qs.get('sfxlog') === '1';
    // ?spawn=x,z,yaw (yaw в градусах, по умолчанию 0) — откуда и куда смотрит
    // боец в начале забега: сцену промо надо начинать с нужного места, а не с
    // того, что записано в арене
    const spawnFlag = (() => {
      const raw = qs.get('spawn');
      if (!raw) return null;
      const [sx, sz, sy] = raw.split(',').map(Number);
      if (!Number.isFinite(sx) || !Number.isFinite(sz)) return null;
      return { x: sx, z: sz, yaw: Number.isFinite(sy) ? (sy * Math.PI) / 180 : 0 };
    })();
    // startWave() делает wave++, поэтому держим на единицу меньше
    let wave = startWaveAt - 1, score = 0, kills = 0, totalKills = 0;
    type Phase = 'title' | 'wave' | 'clear' | 'dead' | 'edit';
    let phase: Phase = 'title';
    let phaseT = 0, time = 0;
    let waveBudget = 0, spawnCd = 0, alive = 0;
    /** отложенный спавн: печать заряжается SPAWN_LEAD секунд, потом из неё лезет монстр */
    const SPAWN_LEAD = 2;
    interface Pending { pi: number; k: MK; vet: boolean; t: number }
    const pending: Pending[] = [];
    let titleSel = 0, endSel = 0;
    // выбор запоминается между забегами
    let diffIx = Math.max(0, DIFFS.findIndex((d) => d.key === localStorage.getItem('fw_diff')));
    let D = DIFFS[diffIx];
    type MenuAct = 'play' | 'diff' | 'arena' | 'lang' | 'edit';
    const titleMenu = (): { label: string; act: MenuAct; hint?: string }[] => {
      const it: { label: string; act: MenuAct; hint?: string }[] = [
        { label: t('menu.play'), act: 'play' },
        { label: t('menu.diff', dName(D)), act: 'diff', hint: dHint(D) },
        { label: t('menu.arena', arenaLabel()), act: 'arena', hint: t('menu.arena.hint') },
        { label: t('menu.lang'), act: 'lang', hint: t('menu.lang.hint') },
        { label: t('menu.edit'), act: 'edit' },
      ];
      return it;
    };
    const setDiff = (ix: number) => {
      diffIx = (ix + DIFFS.length) % DIFFS.length;
      D = DIFFS[diffIx];
      try { localStorage.setItem('fw_diff', D.key); } catch { /* приватный режим */ }
    };
    // ── РЕКОРД ──
    // Свой на каждую сложность: у хардкора множитель очков почти вдвое больше,
    // и общий рекорд всегда принадлежал бы ему — сравнивать было бы нечего.
    // Забеги с прыжком по волнам (?wave= и IDCLEV) в рекорд НЕ идут: там первая
    // же зачищенная волна даёт очки за все пропущенные.
    const BEST_KEY = 'fw_best';
    const loadBest = (): Record<string, number> => {
      const res: Record<string, number> = {};
      let o: Record<string, unknown> = {};
      try { o = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, unknown>; }
      catch { /* битое — считаем, что рекордов нет */ }
      for (const dd of DIFFS) {
        const v = o[dd.key];
        res[dd.key] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
      }
      return res;
    };
    const best = loadBest();
    let cheated = startWaveAt > 1;
    let newRecord = false;
    /** записать очки забега в рекорд текущей сложности; true — если побит */
    const bankScore = (): boolean => {
      if (cheated || score <= best[D.key]) return false;
      best[D.key] = score;
      try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* приватный режим */ }
      return true;
    };

    let faceLook = 0, faceLookT = 0, faceOw = 0;
    let launcherMsg = 0;       // сколько ещё секунд показывать подсказку о ракетнице
    // пиксельные искры-огонь, поднимающиеся сквозь название на титуле
    interface TitleSpark { x: number; y: number; vy: number; drift: number; life: number; max: number; sz: number }
    const titleFire: TitleSpark[] = [];
    let fireLast = 0;

    // чит с титула, как в думе: набрать IDCLEV, потом две цифры волны
    let cheatBuf = '';
    let warpDigits: string | null = null;
    let warpTo: number | null = null;
    let rktArmed = false;      // ствол уже выложен на арену

    const mons: Mon[] = [];
    const gibs: Gib[] = [];
    const balls: Ball[] = [];
    const pickups: Pickup[] = [];
    const puffs: Puff[] = [];
    // ── ГИБЫ И ПЫЛЬ: по одному вызову отрисовки на всю систему ──
    // Гибы освещённые и непрозрачные — хватает матрицы и цвета экземпляра.
    const GIB_MAX = 170;
    const gibMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      GIB_MAX,
    );
    gibMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gibMesh.count = 0;
    gibMesh.frustumCulled = false;      // границы по базовому кубу, а куски летят далеко
    ctx.scene.add(gibMesh);

    // ── РАКЕТЫ ИГРОКА ──
    // Тот же порядок, что у файерболов: пул мешей и пул света, ничего не
    // подключается к сцене на лету (смена числа источников = пересборка программ).
    const RKT_MAX = 8, RKT_LIGHTS = 4;
    interface Rocket { mi: number; li: number; x: number; y: number; z: number; vx: number; vz: number; life: number }
    const rockets: Rocket[] = [];
    const rktMeshes: THREE.Group[] = [];
    for (let i = 0; i < RKT_MAX; i++) {
      const rm = buildRocket();
      rm.visible = false;
      ctx.scene.add(rm);
      rktMeshes.push(rm);
    }
    // подсветка парящей ракетницы: живёт всегда, гасится яркостью
    const launcherLight = new THREE.PointLight(0xffa040, 0, 12, 1.5);
    ctx.scene.add(launcherLight);

    const rktLights: THREE.PointLight[] = [];
    for (let i = 0; i < RKT_LIGHTS; i++) {
      const rl = new THREE.PointLight(0xffb060, 0, 9, 1.6);
      ctx.scene.add(rl);
      rktLights.push(rl);
    }

    // Пыль — общий модуль: обычное смешивание + своя прозрачность у каждой пылинки
    const PUFF_MAX = 260;
    const dust = createDustCloud(PUFF_MAX, 0.2);
    ctx.scene.add(dust.mesh);
    const instDummy = new THREE.Object3D();
    const instCol = new THREE.Color();    // не плодим Color на каждую искру

    // ── монстры: модели из общей библиотеки (её же показывает /assets.html) ──
    const buildMon = (k: MK, vet: boolean) => {
      const r = buildMonster(k, vet);
      ctx.scene.add(r.grp);
      return r;
    };

    /** голос типа: раздаётся, когда монстр вылезает из печати */
    const VOICE: Record<MK, SfxId> = {
      gnaar: 'gnaar', boom: 'boomWail', kleer: 'kleerRattle',
      bull: 'bullSnort', harpy: 'harpyFlap', mech: 'mechServo',
    };
    const spawnMon = (k: MK, vet: boolean, sx: number, sz: number) => {
      const d = MDEFS[k];
      const { grp, parts, mats, setFlash } = buildMon(k, vet);
      const hpMul = (vet ? 1.7 : 1) * (1 + 0.05 * wave);
      const m: Mon = {
        kind: k, vet, grp, parts, mats, setFlash,
        x: sx, z: sz, y: d.flying ? 2.2 : 0,
        hp: d.hp * hpMul, maxHp: d.hp * hpMul,
        vx: 0, vz: 0, t: 0, atkCd: 0, hurtT: 0,
        state: 'walk', windT: 0, ph: rng() * 6.28, leapT: 0, hitThisLeap: false,
        dodge: 1, skirtT: 0, skirtNx: 0, skirtNz: 0,
      };
      grp.position.set(sx, m.y, sz);
      grp.rotation.y = Math.atan2(-(px - sx), -(pz - sz));   // из печати — уже лицом к цели
      mons.push(m);
      alive++;
      // вспышка телепорта: гул портала уже отыграл при зарядке печати,
      // здесь монстр подаёт голос — сразу слышно, кто и с какой стороны вылез
      if (k === 'boom') giveWail(m);
      else sfx.play(VOICE[k], { x: sx, z: sz });
      for (let i = 0; i < 8; i++) puff(sx + (rng() - 0.5), 0.5 + rng() * 1.5, sz + (rng() - 0.5), 0xb060ff, 0.5);
    };

    /**
     * Вой камикадзе. Одновременных голосов немного (LOOP_MAX в audioDoom) — иначе
     * на наплыве получается каша вместо хора. Но раздавать их по порядку спавна
     * нельзя: вой это ПРЕДУПРЕЖДЕНИЕ, орать должны те, кто уже бежит на тебя.
     * Поэтому голоса переезжают к ближайшим, а дальние замолкают.
     */
    const WAIL_MAX = 4;
    let wailT = 0;
    const giveWail = (m: Mon) => {
      const w = sfx.loop('boomWail', { x: m.x, z: m.z });
      m.wail = w.isLive() ? w : undefined;
    };
    const tickWails = (dt: number) => {
      wailT -= dt;
      if (wailT > 0) return;
      wailT = 0.4;
      const booms = mons.filter((m) => m.kind === 'boom');
      if (booms.length <= WAIL_MAX) {
        for (const m of booms) if (!m.wail) giveWail(m);
        return;
      }
      const d2 = (m: Mon) => (m.x - px) ** 2 + (m.z - pz) ** 2;
      booms.sort((a, b) => d2(a) - d2(b));
      booms.forEach((m, i) => {
        if (i < WAIL_MAX) { if (!m.wail) giveWail(m); }
        else if (m.wail) { m.wail.stop(0.3); m.wail = undefined; }
      });
    };

    function puff(x: number, y: number, z: number, col: number, max: number) {
      if (puffs.length >= PUFF_MAX) return;     // пул выбран — лишнюю искру просто не рисуем
      puffs.push({ x, y, z, vy: 1.2 + rng(), life: 0, max, col });
    }

    // ── гибы: кубики цвета монстра + красные ──
    const gibify = (m: Mon) => {
      m.wail?.stop(0.12);           // вой обрывается вместе с носителем
      const d = MDEFS[m.kind];
      const base = new THREE.Color(d.color);
      if (m.vet) base.lerp(new THREE.Color(0x9a1010), 0.35);
      const baseHex = base.getHex();
      const n = 10 + Math.floor(rng() * 6);
      for (let i = 0; i < n; i++) {
        if (gibs.length >= GIB_MAX) break;
        const red = rng() < 0.4;
        gibs.push({
          x: m.x + (rng() - 0.5) * 0.6, y: m.y + 0.4 + rng() * d.h * 0.7, z: m.z + (rng() - 0.5) * 0.6,
          vx: (rng() - 0.5) * 7, vy: 3 + rng() * 5, vz: (rng() - 0.5) * 7,
          rotX: rng() * 3, rotZ: rng() * 3,
          rx: (rng() - 0.5) * 12, rz: (rng() - 0.5) * 12,
          s: 0.14 + rng() * 0.2,
          col: red ? C_GIB_RED : baseHex,
          life: 2.6 + rng(),
        });
      }
      ctx.scene.remove(m.grp);
      for (const mt of m.mats) mt.dispose();   // геометрия общая на вариант — живёт в кеше
    };

    /**
     * Взрыв заряда камикадзе: свет, искры, звук и осколки ПО СВОИМ.
     * Срабатывает и когда он добежал до бойца, и когда его застрелили — заряд-то
     * при нём. Урон растёт вместе с живучестью тварей, поэтому доля от здоровья
     * бомбиста постоянна (14 из 22): целый камикадзе взрыв соседа переживает и
     * цепь сама не расходится. Подранок сдетонировать может — это честно, а
     * глубина цепочки всё равно ограничена blastDepth.
     */
    let blastDepth = 0;
    const boomBlast = (bx: number, bz: number, vet: boolean) => {
      for (let q = 0; q < 22; q++) {
        puff(bx + (rng() - 0.5) * 2, 0.6 + rng() * 2, bz + (rng() - 0.5) * 2,
          q % 3 ? 0xff8030 : 0xffe090, 0.5);
      }
      muzzleLight.position.set(bx, 1.4, bz);
      muzzleLight.intensity = 7;
      sfx.play('explosion', { x: bx, z: bz });
      if (blastDepth >= 2) return;
      blastDepth++;
      const dmg = BOOM_SPLASH.dmg * (1 + 0.05 * wave) * (vet ? 1.4 : 1);
      // список целей снимаем ЗАРАНЕЕ: чужая смерть может утащить за собой ещё
      // кого-то, и перебирать живой массив по индексам в этот момент нельзя
      const targets = mons.filter(
        (o) => Math.hypot(o.x - bx, o.z - bz) - MDEFS[o.kind].radius <= BOOM_SPLASH.radius,
      );
      for (const o of targets) {
        if (!mons.includes(o)) continue;
        const dd = Math.max(0, Math.hypot(o.x - bx, o.z - bz) - MDEFS[o.kind].radius);
        o.hp -= dmg * (1 - dd / BOOM_SPLASH.radius);
        o.hurtT = 0.14;
        if (o.hp <= 0) { sfx.play('monsterDie', { x: o.x, z: o.z }); killMon(o); }
      }
      blastDepth--;
    };

    /** снять тварь с арены: куски, счётчики и — если это камикадзе — взрыв заряда */
    const killMon = (m: Mon, count = true) => {
      const wasBoom = m.kind === 'boom';
      const bx = m.x, bz = m.z, vet = m.vet;
      gibify(m);
      const ix = mons.indexOf(m);
      if (ix >= 0) mons.splice(ix, 1);
      alive--;
      if (count) kills++;
      totalKills++;
      if (wasBoom) boomBlast(bx, bz, vet);
    };

    // ── пикапы ──
    const mkPickup = (kind: Pickup['kind'], x: number, z: number) => {
      const grp = buildPickup(kind);
      grp.position.set(x, 0, z);
      ctx.scene.add(grp);
      pickups.push({ grp, kind, x, z, taken: 0 });
    };
    const resetPickups = (def: ArenaDef = A, rktSwap = true) => {
      for (const p of pickups) ctx.scene.remove(p.grp);
      pickups.length = 0;
      // С 16-й волны обоймы становятся ракетами, но ПЕРВАЯ в списке остаётся:
      // из «bul» кормится ещё и пулемёт (в базовой арене порядок задан так же)
      const rkt = rktSwap && wave >= RKT_WAVE;
      let keptBul = false;
      for (const pk of def.pickups) {
        let kind: Pickup['kind'] = pk.kind;
        if (pk.kind === 'bul') {
          if (rkt && keptBul) kind = 'rkt';
          keptBul = true;
        }
        mkPickup(kind, pk.x, pk.z);
      }
    };
    resetPickups();

    // ── ввод: мышь+WASD, классика, тач ──
    const touch = mob ? createMultiTouch() : null;
    const sfx = createDoomAudio();
    const music = createMusicDirector(0.5);
    // ?music=0 — тишина, но переключение дорожек по фазам работает как обычно:
    // монтажёру нужны те же склейки, только своей копией музыки
    if (qs.get('music') === '0') music.setVolume(0);
    /** журнал звуков (?sfxlog=1); пустой, пока флаг не поднят */
    const sfxEvents: SfxEv[] = [];
    if (sfxLog) {
      (window as unknown as { __sfxLog: { events: SfxEv[] } }).__sfxLog = { events: sfxEvents };
      const now = () => performance.now() / 1000;
      // методы audioDoom — обычные замыкания без this, их можно подменить прямо
      // в объекте: так журнал видит ВСЕ вызовы, а не только те, что рядом
      const rawPlay = sfx.play, rawLoop = sfx.loop;
      let handles = 0;
      sfx.play = (id, at) => {
        sfxEvents.push(at ? { t: now(), id, x: at.x, z: at.z } : { t: now(), id });
        rawPlay(id, at);
      };
      sfx.loop = (id, at) => {
        const h = ++handles;
        sfxEvents.push({ type: 'loopStart', t: now(), id, x: at.x, z: at.z, h });
        const L = rawLoop(id, at);
        // move зовут каждый кадр — в журнал кладём ~10 отметок в секунду:
        // между ними положение всё равно интерполируется на монтаже
        let moveT = -1;
        return {
          isLive: L.isLive,
          move(x, z) {
            const t = now();
            if (t - moveT >= 0.1) { moveT = t; sfxEvents.push({ type: 'loopMove', t, x, z, h }); }
            L.move(x, z);
          },
          stop(fade) { sfxEvents.push({ type: 'loopStop', t: now(), fade, h }); L.stop(fade); },
        };
      };
      // Трек слушателя ~15 Гц. setListener зовётся раз в кадр и только в бою,
      // так что трек сам собой начинается с первого боевого кадра и не пишется
      // ни в титуле, ни в редакторе.
      const rawListener = sfx.setListener;
      let lisT = -1;
      sfx.setListener = (x, z, yaw) => {
        const t = now();
        if (t - lisT >= 1 / 15) { lisT = t; sfxEvents.push({ type: 'listener', t, x, z, yaw }); }
        rawListener(x, z, yaw);
      };
    }
    const keys = new Set<string>();
    let mDX = 0, mDY = 0, mouseDown = false, locked = false;
    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === 'F3') { showPerf = !showPerf; e.preventDefault(); }
      // Escape: первое нажатие браузер тратит на выход из захвата мыши, второе
      // (курсор уже свободен) уводит на титул. Иначе «верни мне курсор» стоило
      // бы забега — в отдельной сборке на Godot такой развилки нет, там Esc
      // сразу уходит в титул
      if (e.code === 'Escape' && !locked && (phase === 'wave' || phase === 'clear')) {
        toTitle();
        return;
      }
      // ── редактор ──
      if (phase === 'edit') {
        const mD = /^Digit(\d)$/.exec(e.code);
        if (mD) {
          const gi = mD[1] === '0' ? 9 : Number(mD[1]) - 1;
          if (gi < E_GROUPS.length) {
            if (gi === gSel && E_GROUPS[gi].items.length > 1) {
              vSel[gi] = (vSel[gi] + 1) % E_GROUPS[gi].items.length;   // повтор — вариант
            }
            gSel = gi;
          }
          return;
        }
        if (e.code === 'KeyX') { eClickR = true; return; }
        if (e.code === 'KeyT') { eRot = (eRot + 45) % 180; eSay(t('ed.rot', eRot)); return; }
        if (e.code === 'KeyF') {
          eDef.ground = eDef.ground === 'sand' ? 'sand_road'
            : eDef.ground === 'sand_road' ? 'stone'
              : eDef.ground === 'stone' ? 'cobble'
                : eDef.ground === 'cobble' ? 'checker' : 'sand';
          rebuildEditor();
          eSay(t('ed.floor', groundName(eDef.ground)));
          return;
        }
        if (e.code === 'KeyG') { testPlayFromEditor(); return; }
        if (e.code === 'KeyQ') { exitEditorToTitle(); return; }
        if (e.code === 'KeyE') {
          try {
            void navigator.clipboard?.writeText(JSON.stringify(eDef));
            eSay(t('ed.copied'));
          } catch { eSay(t('ed.noClip')); }
          return;
        }
        if (e.code === 'KeyI') {
          if (document.pointerLockElement) document.exitPointerLock?.();
          const raw = window.prompt(t('ed.pastePrompt'));
          if (raw) {
            try {
              const v = validateArena(JSON.parse(raw));
              if (v) { eDef = v; rebuildEditor(); eSay(t('ed.imported')); }
              else eSay(t('ed.notArena'));
            } catch { eSay(t('ed.badJson')); }
          }
          return;
        }
        if (e.code === 'KeyN') { eDef = structuredClone(DEFAULT_ARENA); rebuildEditor(); eSay(t('ed.defaultLoaded')); return; }
        if (e.code === 'Minus' || e.code === 'Equal' || e.code === 'NumpadSubtract' || e.code === 'NumpadAdd') {
          const grow = e.code === 'Equal' || e.code === 'NumpadAdd';
          const ns = Math.max(16, Math.min(40, eDef.size + (grow ? 2 : -2)));
          if (ns === eDef.size) { eSay(t(grow ? 'ed.maxSize' : 'ed.minSize')); return; }
          eDef.size = ns;
          // всё, что вылезло за новые стены, срезаем
          const B = ns - 2;
          const dropped =
            eDef.pillars.length + eDef.torches.length + eDef.seals.length + eDef.pickups.length;
          eDef.pillars = eDef.pillars.filter((o) => Math.abs(o.x) <= ns - 1 - o.r && Math.abs(o.z) <= ns - 1 - (o.rz ?? o.r));
          eDef.torches = eDef.torches.filter((o) => Math.abs(o.x) <= ns - 1 && Math.abs(o.z) <= ns - 1);
          eDef.seals = eDef.seals.filter((o) => Math.abs(o.x) <= B && Math.abs(o.z) <= B);
          eDef.pickups = eDef.pickups.filter((o) => Math.abs(o.x) <= B && Math.abs(o.z) <= B);
          eDef.start.x = Math.max(-B, Math.min(B, eDef.start.x));
          eDef.start.z = Math.max(-B, Math.min(B, eDef.start.z));
          const now =
            eDef.pillars.length + eDef.torches.length + eDef.seals.length + eDef.pickups.length;
          rebuildEditor();
          eSay(t('ed.size', ns * 2) + (dropped > now ? t('ed.sizeCut', dropped - now) : ''));
          return;
        }
        if (e.code === 'KeyB') {
          eDef.sky = eDef.sky === 'hell' ? 'dusk' : eDef.sky === 'dusk' ? 'day' : eDef.sky === 'day' ? 'void' : 'hell';
          applySky(eDef.sky);
          eSaveLocal();
          eSay(t('ed.sky', skyName(eDef.sky)));
          return;
        }
        if (e.code === 'KeyK') {
          if (document.pointerLockElement) document.exitPointerLock?.();
          const cur = arenaLabel();
          const nm = (window.prompt(t('ed.namePrompt'), cur === t('arena.draft') ? '' : cur) ?? '').trim().slice(0, 24);
          if (!nm) return;
          if (reservedArenaNames().has(nm)) { eSay(t('ed.nameTaken')); return; }
          const st = loadStore();
          st[nm] = structuredClone(eDef);
          saveStore(st);
          try { localStorage.setItem('fw_arena_use', `u:${nm}`); } catch { /* noop */ }
          eSay(t('ed.saved', nm));
          return;
        }
        if (e.code === 'KeyL') {
          if (document.pointerLockElement) document.exitPointerLock?.();
          const st = loadStore();
          // в списке — ЯРЛЫКИ на языке интерфейса, а искать умеем и по ним,
          // и по собственным именам встроенных: старая подсказка не должна
          // перестать работать после смены языка
          const names = [t('arena.default'), ...BUILTIN_ARENAS.map((_, i) => builtinLabel(i)), ...Object.keys(st)];
          const typed = (window.prompt(t('ed.loadPrompt', names.join(', '))) ?? '').trim();
          if (!typed) return;
          if (typed.startsWith('-')) {
            const nm = typed.slice(1).trim();
            if (st[nm]) { delete st[nm]; saveStore(st); eSay(t('ed.deleted', nm)); }
            else eSay(t('ed.noSuchOwn'));
            return;
          }
          const bi = BUILTIN_ARENAS.findIndex((b, i) => b.name === typed || builtinLabel(i) === typed);
          const def = typed === t('arena.default') || typed === 'БАЗОВА' ? DEFAULT_ARENA
            : bi >= 0 ? BUILTIN_ARENAS[bi].def : st[typed];
          if (!def) { eSay(t('ed.notFound')); return; }
          eDef = structuredClone(def);
          rebuildEditor();
          applySky(eDef.sky);
          eSay(t('ed.loaded', typed));
          return;
        }
      }
      // ── IDCLEV: по кодам клавиш, чтобы раскладка не мешала ──
      if (phase === 'title') {
        const mL = /^Key([A-Z])$/.exec(e.code);
        if (mL) {
          cheatBuf = (cheatBuf + mL[1]).slice(-6);
          if (cheatBuf.endsWith('IDCLEV')) { warpDigits = ''; sfx.play('menuMove'); }
        } else if (warpDigits !== null) {
          const mD = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
          if (mD) {
            warpDigits += mD[1];
            if (warpDigits.length >= 2) {
              warpTo = Math.max(1, Math.min(99, Number(warpDigits)));
              warpDigits = null;
            }
          } else if (!/^Shift/.test(e.code)) warpDigits = null;   // любая другая клавиша — отмена
        }
      }
      const inRun = phase === 'wave' || phase === 'clear';
      if (e.code === 'Digit1' && owned[0] && inRun) { weapon = 0; buildGun(0); sfx.play('weaponSwitch'); }
      if (e.code === 'Digit2' && owned[1] && inRun) { weapon = 1; buildGun(1); sfx.play('weaponSwitch'); }
      if (e.code === 'Digit3' && owned[2] && inRun) { weapon = 2; buildGun(2); sfx.play('weaponSwitch'); }
      if (e.code === 'Digit4' && owned[3] && inRun) { weapon = 3; buildGun(3); sfx.play('weaponSwitch'); }
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onMouseMove = (e: MouseEvent) => { if (locked) { mDX += e.movementX; mDY += e.movementY; } };
    const onMouseDown = (e: MouseEvent) => {
      mouseDown = true;
      if (phase === 'edit') {
        if (e.button === 0) eClickL = true;
        if (e.button === 2) eClickR = true;
      }
      if (!mob && !locked && phase !== 'title' && phase !== 'dead') {
        const el = document.querySelector('.mg-overlay canvas') as HTMLCanvasElement | null;
        void el?.requestPointerLock?.();
      }
    };
    const onCtxMenu = (e: Event) => { if (phase === 'edit') e.preventDefault(); };
    const onWheel = (e: WheelEvent) => {
      if (phase !== 'edit') return;
      // плоский список всех вариантов: колесо идёт по нему насквозь
      const flat: [number, number][] = [];
      E_GROUPS.forEach((gr, gi) => gr.items.forEach((_, vi) => flat.push([gi, vi])));
      let ix = flat.findIndex(([gi, vi]) => gi === gSel && vi === vSel[gSel]);
      ix = (ix + (e.deltaY > 0 ? 1 : flat.length - 1)) % flat.length;
      gSel = flat[ix][0];
      vSel[gSel] = flat[ix][1];
    };
    const onMouseUp = () => { mouseDown = false; };
    const onLockChange = () => { locked = !!document.pointerLockElement; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('contextmenu', onCtxMenu);
    window.addEventListener('wheel', onWheel);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onLockChange);
    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('contextmenu', onCtxMenu);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement) document.exitPointerLock?.();
      touch?.dispose();
      sfx.dispose();
      music.dispose();
      cam.remove(gunGrp);
      disposeTree(gunGrp);       // четыре собранных ствола
      for (const im of [gibMesh, dust.mesh]) { im.geometry.dispose(); (im.material as THREE.Material).dispose(); im.dispose(); }
      ballGeo.dispose(); ballMat.dispose();
    };

    // тач-раскладка
    const tLayout = () => {
      const W = HW(), H = HH();
      const r = Math.max(52, Math.min(W, H) * 0.13);
      return {
        r,
        moveC: { x: r + 24, y: H - r - 90 },
        lookC: { x: W - r - 24, y: H - r - 90 },
        fire: { x: W - r - 24, y: H - r * 3 - 110, r: r * 0.62 },
        wpn: { x: r + 24, y: H - r * 3 - 110, r: r * 0.5 },
      };
    };
    let tMove = { x: 0, y: 0 }, tLook = { x: 0, y: 0 }, tFire = false;
    let moveId = -1, lookId = -1;

    // ── стрельба ──
    const fire = () => {
      const w = WEAPONS[weapon];
      if (fireCd > 0) return;
      if (ammo[w.ammo] < w.use) { flashT = 0.12; flashCol = 1; sfx.play('dryClick'); return; }
      ammo[w.ammo] -= w.use;
      fireCd = w.cd;
      sfx.play(weapon === 0 ? 'pistol' : weapon === 1 ? 'shotgun' : weapon === 2 ? 'chaingun' : 'rocket');
      kick = weapon === 3 ? 2.2 : 1;                       // ракетницу ощутимо задирает
      muzzleLight.intensity = weapon === 3 ? 7 : 4.5;
      const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
      muzzleLight.position.set(px - sinY * 1.2, EYE - 0.2, pz - cosY * 1.2);

      // ── РАКЕТНИЦА: не хитскан, а снаряд ──
      if (weapon === 3) {
        const mi = rktMeshes.findIndex((q) => !q.visible);
        if (mi >= 0) {
          const li = rktLights.findIndex((q) => q.intensity === 0);
          const rx = -sinY, rz = -cosY;
          const sx = px + rx * 1.1, sz = pz + rz * 1.1;
          rktMeshes[mi].position.set(sx, EYE + pY - 0.15, sz);
          rktMeshes[mi].rotation.set(0, yaw, 0);
          rktMeshes[mi].visible = true;
          if (li >= 0) { rktLights[li].position.set(sx, EYE - 0.15, sz); rktLights[li].intensity = 2.6; }
          rockets.push({ mi, li, x: sx, y: EYE + pY - 0.15, z: sz, vx: rx * ROCKET.speed, vz: rz * ROCKET.speed, life: ROCKET.life });
        }
        return;
      }

      for (let p = 0; p < w.pellets; p++) {
        const sp = (rng() - 0.5) * w.spread * 2;
        const ay = yaw + sp;
        const dx = -Math.sin(ay), dz = -Math.cos(ay);
        // хитскан: ближайший монстр по лучу (автоприцел по вертикали, как в 1993)
        let best: Mon | null = null, bestT = 1e9;
        for (const m of mons) {
          const rx = m.x - px, rz = m.z - pz;
          const tAlong = rx * dx + rz * dz;
          if (tAlong < 0.12 || tAlong > 70) continue; // в упор тоже попадаем
          const perp = Math.abs(rx * dz - rz * dx);
          if (perp > MDEFS[m.kind].radius + 0.25) continue;
          if (tAlong < bestT) { bestT = tAlong; best = m; }
        }
        if (best) {
          best.hp -= w.dmg;
          best.hurtT = 0.14;
          const hx = px + dx * bestT, hz = pz + dz * bestT;
          for (let i = 0; i < 3; i++) puff(hx + (rng() - 0.5) * 0.4, best.y + 0.8 + rng() * 0.6, hz + (rng() - 0.5) * 0.4, C_GIB_RED, 0.35);
          sfx.play('monsterPain', { x: best.x, z: best.z });
          if (best.hp <= 0) {
            sfx.play('monsterDie', { x: best.x, z: best.z });
            sfx.play('gib', { x: best.x, z: best.z });
            killMon(best);
          }
        } else {
          // искры от стены
          const wallT = 40;
          puff(px + dx * wallT * 0.3, EYE, pz + dz * wallT * 0.3, 0xffd070, 0.2);
        }
      }
    };

    /** подрыв ракеты: прямое попадание по цели + осколки по площади и стрелку */
    const rocketBlast = (bx: number, by: number, bz: number, direct?: Mon) => {
      sfx.play('explosion', { x: bx, z: bz });
      muzzleLight.position.set(bx, by, bz);
      muzzleLight.intensity = 8;
      for (let q = 0; q < 26; q++) {
        puff(bx + (rng() - 0.5) * 3.2, by + (rng() - 0.5) * 2.2, bz + (rng() - 0.5) * 3.2,
          q % 3 ? 0xff8030 : 0xffe090, 0.55);
      }
      // тому, в кого воткнулась ракета, — полный прямой урон ДО осколков
      if (direct) direct.hp -= WEAPONS[3].dmg;
      // осколки — по спаду от ЭПИЦЕНТРА ДО КРАЯ твари: взрыв происходит на её
      // границе, и если мерить до центра, цель в упор получала бы 33 вместо 45
      for (const m of [...mons]) {          // копия: подорванный камикадзе тянет соседей
        if (!mons.includes(m)) continue;
        const d = Math.max(0, Math.hypot(m.x - bx, m.z - bz) - MDEFS[m.kind].radius);
        if (d > ROCKET.radius) continue;
        const k = 1 - d / ROCKET.radius;
        m.hp -= ROCKET.splash * k;
        m.hurtT = 0.14;
        if (m.hp <= 0) {
          sfx.play('monsterDie', { x: m.x, z: m.z });
          killMon(m);
        }
      }
      // себе — тот же спад, но слабее; проходит через броню, как любой урон
      const dSelf = Math.hypot(px - bx, pz - bz);
      if (dSelf < ROCKET.radius) {
        const k = 1 - dSelf / ROCKET.radius;
        hurt(ROCKET.splash * ROCKET.self * k);
      }
    };

    // ── урон игроку ──
    const hurt = (dmg: number) => {
      if (phase !== 'wave' && phase !== 'clear') return;
      flashT = 0.3; flashCol = 0;
      faceOw = 0.6;
      sfx.play('playerPain');
      // ?god=1: вся обратная связь на месте — вспышка, оскал на лице, крик, —
      // но полоска не тает. Дубль промо не должен обрываться на середине волны
      if (godMode) return;
      let d = dmg;
      if (armor > 0) { const abs = Math.min(armor, d * 0.4); armor -= abs; d -= abs; }
      hp -= d;
      if (hp <= 0) { hp = 0; newRecord = bankScore(); phase = 'dead'; phaseT = 0; endSel = 0; sfx.play('playerDie');
        music.play('end', { loop: false, fade: 0.5, onEnd: () => music.play('chill', { fade: 1.6 }) }); if (document.pointerLockElement) document.exitPointerLock?.(); }
    };

    // ── волны ──
    const waveScore = (n: number) => Math.round((BASE_SCORE + (n - 1) * STEP_SCORE) * D.score);
    const startWave = () => {
      // забег начинается с титула — только здесь ставим бойца на старт, между
      // волнами он остаётся там, где его застала зачистка
      if (phase === 'title') applyStart();
      wave++;
      kills = 0;
      waveBudget = Math.round((4 + wave * 2.4 + s01 * 2) * D.budget);
      spawnCd = 0.4;
      phase = 'wave'; phaseT = 0;
      applySky(A.sky);
      sfx.play('waveStart');
      music.play('main', { fade: 0.7 });
      // «>=», а не «===»: при прыжке на волну (IDCLEV / ?wave) выдача догоняет
      if (wave >= 3 && !owned[1]) { owned[1] = true; weapon = 1; buildGun(1); ammo.shl += 20; sfx.play('pickWeapon'); }
      if (wave >= 6 && !owned[2]) { owned[2] = true; weapon = 2; buildGun(2); ammo.bul += 100; sfx.play('pickWeapon'); }
      if (wave >= RKT_WAVE && !rktArmed) {
        // ствол не выдаётся в руки — за ним надо сходить, под огнём
        rktArmed = true;
        resetPickups();                                  // три обоймы из четырёх меняются на ракеты
        if (!owned[3]) {
          // на своих аренах точка (0,-14) может быть застроена — ищем свободную
          const spots: [number, number][] = [[0, -14], [0, 14], [14, 0], [-14, 0], [0, 0], [A.start.x, A.start.z - 4]];
          const [lx, lz] = spots.find(([qx, qz]) => !inPillar(qx, qz, 1)) ?? [0, -14];
          mkPickup('launcher', lx, lz);
          sfx.play('teleport', { x: lx, z: lz });
        }
      }
    };
    const pickKind = (): MK => {
      const pool: MK[] = ['gnaar'];
      if (wave >= 2 || D.boomAlways) pool.push('boom');
      if (wave >= 3) pool.push('kleer');
      if (wave >= 4) pool.push('harpy');
      if (wave >= 5) pool.push('bull');
      if (wave >= 6) pool.push('mech');
      // на поздних волнах — реже филлер
      const w2 = pool.filter((k) => !(wave > 8 && k === 'gnaar' && rng() < 0.5));
      return w2[Math.floor(rng() * w2.length)] ?? 'gnaar';
    };
    /**
     * Куда поставить бойца в начале забега. Обычно это A.start, но ?spawn его
     * перебивает. Чужие числа зажимаем в арену, а если точка пришлась на
     * структуру — флаг игнорируем ЦЕЛИКОМ: съёмочный флаг не должен уметь
     * запереть бойца в пилоне.
     */
    const applyStart = () => {
      px = A.start.x; pz = A.start.z; yaw = 0;
      if (!spawnFlag) return;
      const lim = ARENA - 2;
      const sx = Math.max(-lim, Math.min(lim, spawnFlag.x));
      const sz = Math.max(-lim, Math.min(lim, spawnFlag.z));
      if (inPillar(sx, sz, P_RADIUS)) return;
      px = sx; pz = sz; yaw = spawnFlag.yaw;
    };

    /** сброс забега: арена остаётся, всё остальное — как в начале */
    const resetRun = () => {
      for (const m of mons) { m.wail?.stop(0.1); ctx.scene.remove(m.grp); for (const mt of m.mats) mt.dispose(); }
      mons.length = 0; alive = 0;
      for (const b of balls) {
        ballMeshes[b.mi].visible = false;
        if (b.li >= 0) ballLights[b.li].intensity = 0;
      }
      balls.length = 0;
      gibs.length = 0; gibMesh.count = 0;
      puffs.length = 0; dust.commit(0);
      pending.length = 0;
      for (const p of portals) p.release(0.25);
      hp = 100; armor = 0; ammo.bul = Math.round(60 * D.ammoMul); ammo.shl = 0;
      owned[1] = false; owned[2] = false; owned[3] = false; weapon = 0; buildGun(0);
      ammo.rkt = 0; launcherMsg = 0; rktArmed = false; launcherLight.intensity = 0;
      for (const r of rockets) {
        rktMeshes[r.mi].visible = false;
        if (r.li >= 0) rktLights[r.li].intensity = 0;
      }
      rockets.length = 0;
      applyStart(); wave = startWaveAt - 1;
      // очки живут ровно один забег: это счёт за попытку, а не накопленный
      // заработок, как было у денег
      score = 0; kills = 0; totalKills = 0; newRecord = false;
      resetPickups();
    };
    const restart = () => {
      resetRun();
      music.play('main', { fade: 0.8 });
      startWave();
    };
    /** назад на титул: забег сброшен, меню игры и есть главный экран */
    const toTitle = () => {
      bankScore();          // брошенный забег тоже засчитываем: очки-то заработаны
      resetRun();
      applySky('hell');                 // титул всегда адский
      phase = 'title'; phaseT = 0; titleSel = 0;
      music.play('chill', { fade: 1.2 });
      if (document.pointerLockElement) document.exitPointerLock?.();
    };

    // ═══════════════ РЕДАКТОР АРЕНЫ (майнкрафт-стиль) ═══════════════
    // Полёт от первого лица, хотбар на 10 слотов, прицел подсвечивает клетку:
    // ЛКМ ставит, ПКМ/X убирает, 0-9 и колесо выбирают слот. Правки сразу
    // пересобирают арену (bakeStatic дёшев) и автосохраняются в localStorage.
    interface ESlot {
      /** ключ словаря, а не готовая подпись: язык меняется прямо в титуле */
      name: string;
      r: number; rz?: number; h: number;
      kind: 'pillar' | 'torch' | 'seal' | 'start' | 'med' | 'arm' | 'bul' | 'shl' | 'box';
      /** тип структуры для kind=pillar */
      pk?: 'block' | 'obelisk' | 'wall' | 'pyramid' | 'rubble' | 'column' | 'steps' | 'rock' | 'statue' | 'dais';
    }
    // Хотбар: цифра = категория; повторное нажатие листает варианты внутри,
    // колесо мыши листает ВСЕ варианты подряд, T поворачивает прямоугольные.
    const E_GROUPS: { name: string; items: ESlot[] }[] = [
      {
        name: 'ed.g.wall', items: [
          { name: 'ed.i.wall', r: 2.5, rz: 0.7, h: 4.4, kind: 'pillar', pk: 'wall' },
          { name: 'ed.i.wall_long', r: 4, rz: 0.7, h: 4.4, kind: 'pillar', pk: 'wall' },
          { name: 'ed.i.wall_short', r: 1.5, rz: 0.7, h: 4.4, kind: 'pillar', pk: 'wall' },
        ],
      },
      {
        name: 'ed.g.column', items: [
          { name: 'ed.i.pillar', r: 1.6, h: 5, kind: 'pillar', pk: 'block' },
          { name: 'ed.i.pillar_big', r: 2.2, h: 5, kind: 'pillar', pk: 'block' },
          { name: 'ed.i.column', r: 1.4, h: 6.9, kind: 'pillar', pk: 'column' },
          { name: 'ed.i.obelisk', r: 1.2, h: 11.5, kind: 'pillar', pk: 'obelisk' },
          { name: 'ed.i.statue', r: 1.3, h: 5.9, kind: 'pillar', pk: 'statue' },
        ],
      },
      {
        name: 'ed.g.platform', items: [
          { name: 'ed.i.steps', r: 2.2, rz: 1.6, h: 1.7, kind: 'pillar', pk: 'steps' },
          { name: 'ed.i.steps_wide', r: 3.6, rz: 1.6, h: 1.7, kind: 'pillar', pk: 'steps' },
          // проходимые: на них можно зайти, монстры карабкаются следом
          { name: 'ed.i.dais', r: 4.2, rz: 3.4, h: 1.0, kind: 'pillar', pk: 'dais' },
          { name: 'ed.i.pad', r: 2.6, h: 1.0, kind: 'pillar', pk: 'dais' },
        ],
      },
      {
        name: 'ed.g.pyramid', items: [
          { name: 'ed.i.pyramid', r: 6, h: 9, kind: 'pillar', pk: 'pyramid' },
          { name: 'ed.i.pyramid_great', r: 9, h: 13, kind: 'pillar', pk: 'pyramid' },
        ],
      },
      {
        name: 'ed.g.rubble', items: [
          { name: 'ed.i.rubble', r: 3, rz: 1.6, h: 2.4, kind: 'pillar', pk: 'rubble' },
          { name: 'ed.i.rocks', r: 1.4, h: 1.7, kind: 'pillar', pk: 'rock' },
          { name: 'ed.i.boulder', r: 0.8, h: 1.3, kind: 'pillar', pk: 'rock' },
        ],
      },
      { name: 'ed.g.torch', items: [{ name: 'ed.i.torch', r: 0.6, h: 3.9, kind: 'torch' }] },
      { name: 'ed.g.seal', items: [{ name: 'ed.i.seal', r: 2.0, h: 0.3, kind: 'seal' }] },
      {
        name: 'ed.g.health', items: [
          { name: 'ed.i.med', r: 0.6, h: 0.9, kind: 'med' },
          { name: 'ed.i.arm', r: 0.6, h: 0.9, kind: 'arm' },
        ],
      },
      {
        name: 'ed.g.ammo', items: [
          { name: 'ed.i.bul', r: 0.6, h: 0.9, kind: 'bul' },
          { name: 'ed.i.shl', r: 0.6, h: 0.9, kind: 'shl' },
          { name: 'ed.i.box', r: 0.6, h: 0.9, kind: 'box' },
        ],
      },
      { name: 'ed.g.start', items: [{ name: 'ed.i.start', r: 0.6, h: 1.9, kind: 'start' }] },
    ];
    let gSel = 0;
    const vSel: number[] = E_GROUPS.map(() => 0);
    const curSlot = (): ESlot => E_GROUPS[gSel].items[vSel[gSel]];
    let eRot = 0;   // T: поворот 0 → 45 → 90 → 135
    /** описанный прямоугольник слота с учётом поворота (для границ и правил) */
    const slotDims = (sl: ESlot): { rx: number; rz: number } => {
      const rz = sl.rz ?? sl.r;
      if (eRot === 90) return { rx: rz, rz: sl.r };
      if (eRot === 45 || eRot === 135) { const e = (sl.r + rz) * 0.7071; return { rx: e, rz: e }; }
      return { rx: sl.r, rz };
    };
    let eDef: ArenaDef = structuredClone(A);
    let eX = 0, eY = 9, eZ = 24, eYaw = 0, ePitch = -0.5;
    let eMsg = '', eMsgT = 0;
    let eClickL = false, eClickR = false;
    interface EFound { type: 'pillar' | 'torch' | 'seal' | 'pickup'; ix: number; x: number; z: number; r: number; rz: number; rot: number; h: number }
    let eAim: { x: number; z: number; ok: boolean } | null = null;
    let eFound: EFound | null = null;

    // привид размещения + рамка удаления + маркер старта
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    ghost.visible = false;
    ctx.scene.add(ghost);
    const wire = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff4030, wireframe: true }),
    );
    wire.visible = false;
    ctx.scene.add(wire);
    const startMarker = new THREE.Group();
    {
      const pole = box(0.14, 1.8, 0.14, 0x3aa050); pole.position.y = 0.9; startMarker.add(pole);
      const flag = box(0.7, 0.4, 0.08, 0x50e080); flag.position.set(0.42, 1.5, 0); startMarker.add(flag);
      const base = box(0.7, 0.12, 0.7, 0x2a7040); base.position.y = 0.06; startMarker.add(base);
    }
    startMarker.visible = false;
    ctx.scene.add(startMarker);

    const eSay = (m: string) => { eMsg = m; eMsgT = 2.6; };
    const eSaveLocal = () => {
      try { localStorage.setItem('fw_arena_draft', JSON.stringify(eDef)); } catch { /* нет места */ }
    };
    const eCounts = () => ({
      pillars: eDef.pillars.length, torches: eDef.torches.length,
      seals: eDef.seals.length, pickups: eDef.pickups.length,
    });

    const rebuildEditor = () => {
      disposeArenaLive();
      buildArenaLive(eDef);
      resetPickups(eDef, false);
      startMarker.position.set(eDef.start.x, groundY(eDef.start.x, eDef.start.z), eDef.start.z);
      eSaveLocal();
      ctx.compile();          // число источников света могло смениться
    };

    const clearCombat = () => {
      for (const m of mons) { m.wail?.stop(0.1); ctx.scene.remove(m.grp); for (const mt of m.mats) mt.dispose(); }
      mons.length = 0; pending.length = 0; alive = 0;
      for (const b of balls) { ballMeshes[b.mi].visible = false; if (b.li >= 0) ballLights[b.li].intensity = 0; }
      balls.length = 0;
      for (const r of rockets) { rktMeshes[r.mi].visible = false; if (r.li >= 0) rktLights[r.li].intensity = 0; }
      rockets.length = 0;
      gibs.length = 0; gibMesh.count = 0;
      puffs.length = 0; dust.commit(0);
      launcherLight.intensity = 0;
    };

    const enterEditor = () => {
      clearCombat();
      phase = 'edit'; phaseT = 0;
      eDef = structuredClone(A);
      rebuildEditor();
      applySky(eDef.sky);
      eX = eDef.start.x; eY = 9; eZ = Math.min(eDef.size - 2, eDef.start.z + 10);
      eYaw = 0; ePitch = -0.55;
      startMarker.visible = true;
      eSay(t('ed.hello'));
    };
    const exitEditorToTitle = () => {
      ghost.visible = false; wire.visible = false; startMarker.visible = false;
      A = loadArena();
      disposeArenaLive();
      buildArenaLive(A);
      resetPickups();
      px = A.start.x; pz = A.start.z;
      ctx.compile();
      applySky('hell');            // титул всегда адский
      phase = 'title'; phaseT = 0;
      if (document.pointerLockElement) document.exitPointerLock?.();
    };
    const testPlayFromEditor = () => {
      if (eDef.seals.length < 2) { eSay(t('ed.needTwoSeals')); return; }
      try {
        localStorage.setItem('fw_arena_draft', JSON.stringify(eDef));
        localStorage.setItem('fw_arena_use', 'draft');
      } catch { /* приватный режим */ }
      A = structuredClone(eDef);
      ghost.visible = false; wire.visible = false; startMarker.visible = false;
      restart();
    };
    const toggleArena = (dir = 1) => {
      const opts = arenaOptions();
      const cur = localStorage.getItem('fw_arena_use') ?? 'default';
      let ix = opts.findIndex((o) => o.token === cur);
      if (ix < 0) ix = 0;
      ix = (ix + dir + opts.length) % opts.length;
      try { localStorage.setItem('fw_arena_use', opts[ix].token); } catch { /* noop */ }
      A = loadArena();
      disposeArenaLive();
      buildArenaLive(A);
      resetPickups();
      px = A.start.x; pz = A.start.z;
      ctx.compile();
    };
    const arenaLabel = (): string => {
      const cur = localStorage.getItem('fw_arena_use') ?? 'default';
      return arenaOptions().find((o) => o.token === cur)?.label ?? t('arena.default');
    };

    /** пересечение квадратных следов: занято ли место (x,z,r) чем-то из eDef */
    /** наслаивание разрешено; запрещены только пары, ломающие геймплей:
     *  печать/старт не должны оказаться внутри непроходимой структуры */
    const pExt = (p: { r: number; rz?: number; rot?: number }): [number, number] => {
      const rz = p.rz ?? p.r, rot = p.rot ?? 0;
      return rot === 0 ? [p.r, rz] : rot === 90 ? [rz, p.r] : [(p.r + rz) * 0.7071, (p.r + rz) * 0.7071];
    };
    const eBlocked = (x: number, z: number, rx: number, rz: number, slot: ESlot): boolean => {
      const hit = (ox: number, oz: number, orx: number, orz: number) =>
        Math.abs(x - ox) < rx + orx && Math.abs(z - oz) < rz + orz;
      const solidKinds = new Set(['block', 'obelisk', 'wall', 'pyramid', 'rubble', 'column', 'steps', 'rock', 'statue']);
      const placingSolid = slot.kind === 'pillar' && slot.pk !== 'dais';
      if (placingSolid) {
        // структуру нельзя ронять на печать или на точку старта
        for (const sl of eDef.seals) if (hit(sl.x, sl.z, 2.0, 2.0)) return true;
        if (hit(eDef.start.x, eDef.start.z, 0.6, 0.6)) return true;
        return false;
      }
      if (slot.kind === 'seal' || slot.kind === 'start') {
        for (const p of eDef.pillars) {
          if (!solidKinds.has(p.kind ?? 'block')) continue;
          const [ex, ez] = pExt(p);
          if (hit(p.x, p.z, ex, ez)) return true;
        }
        if (slot.kind === 'seal') {
          for (const sl of eDef.seals) if (hit(sl.x, sl.z, 2.0, 2.0)) return true;   // печати не в стопку
        }
        return false;
      }
      return false;   // пикапы, факелы, платформы — куда угодно
    };
    /** что стоит в точке прицела (для удаления) — сначала мелкое, потом крупное */
    const eFind = (x: number, z: number): EFound | null => {
      const at = (ox: number, oz: number, orx: number, orz: number) =>
        Math.abs(x - ox) <= orx + 0.35 && Math.abs(z - oz) <= orz + 0.35;
      for (let i = 0; i < eDef.pickups.length; i++) {
        const p = eDef.pickups[i];
        if (at(p.x, p.z, 0.6, 0.6)) return { type: 'pickup', ix: i, x: p.x, z: p.z, r: 0.7, rz: 0.7, rot: 0, h: 1.0 };
      }
      for (let i = 0; i < eDef.torches.length; i++) {
        const t = eDef.torches[i];
        if (at(t.x, t.z, 0.6, 0.6)) return { type: 'torch', ix: i, x: t.x, z: t.z, r: 0.5, rz: 0.5, rot: 0, h: 4.1 };
      }
      for (let i = 0; i < eDef.seals.length; i++) {
        const sl = eDef.seals[i];
        if (at(sl.x, sl.z, 2.0, 2.0)) return { type: 'seal', ix: i, x: sl.x, z: sl.z, r: 2.0, rz: 2.0, rot: 0, h: 0.5 };
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < eDef.pillars.length; i++) {
          const pl = eDef.pillars[i];
          const isDais = pl.kind === 'dais';
          if ((pass === 0) === isDais) continue;   // сперва структуры, платформы напоследок
          const prz = pl.rz ?? pl.r;
          const hh = pl.kind === 'obelisk' ? 12 : pl.kind === 'wall' ? 4.7 : pl.kind === 'pyramid' ? 9.4
            : pl.kind === 'column' ? 7.2 : pl.kind === 'statue' ? 6.1 : pl.kind === 'steps' ? 2.0
              : pl.kind === 'dais' ? 1.2 : pl.kind === 'rock' ? 1.8 : pl.kind === 'rubble' ? 2.6 : 5.4;
          if (at(pl.x, pl.z, pl.r, prz)) return { type: 'pillar', ix: i, x: pl.x, z: pl.z, r: pl.r + 0.3, rz: prz + 0.3, rot: pl.rot ?? 0, h: hh };
        }
      }
      return null;
    };

    const updateEditor = (dt: number) => {
      if (eMsgT > 0) eMsgT -= dt;
      // ── полёт ──
      const spd = (keys.has('KeyR') ? 26 : 14) * dt;
      const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const sy = Math.sin(eYaw), cy = Math.cos(eYaw);
      eX += (-sy * fwd + cy * strafe) * spd;
      eZ += (-cy * fwd - sy * strafe) * spd;
      eY += ((keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0)) * spd;
      const fLim = ARENA + 14;
      eX = Math.max(-fLim, Math.min(fLim, eX));
      eZ = Math.max(-fLim, Math.min(fLim, eZ));
      eY = Math.max(1.2, Math.min(40, eY));
      // ── взгляд: мышь в захвате + стрелки для трекпада ──
      const sens = 0.0022;
      eYaw -= mDX * sens;
      ePitch = Math.max(-1.35, Math.min(1.35, ePitch - mDY * sens * 0.8));
      mDX = 0; mDY = 0;
      const lookX = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      const lookY = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
      eYaw -= lookX * 2.1 * dt;
      ePitch = Math.max(-1.35, Math.min(1.35, ePitch + lookY * 1.5 * dt));

      // ── луч в пол ──
      const fx = -Math.cos(ePitch) * Math.sin(eYaw);
      const fy = Math.sin(ePitch);
      const fz = -Math.cos(ePitch) * Math.cos(eYaw);
      eAim = null; eFound = null;
      if (fy < -0.04) {
        const t = -eY / fy;
        if (t < 90) {
          const hx = eX + fx * t, hz = eZ + fz * t;
          if (Math.abs(hx) <= ARENA + 1 && Math.abs(hz) <= ARENA + 1) {
            const cx = Math.round(hx), cz = Math.round(hz);
            eFound = eFind(hx, hz);
            const sl = curSlot();
            const d = slotDims(sl);
            const limX = sl.kind === 'torch' ? ARENA - 1 : sl.kind === 'pillar' ? Math.floor(ARENA - 1 - d.rx) : ARENA - 2;
            const limZ = sl.kind === 'torch' ? ARENA - 1 : sl.kind === 'pillar' ? Math.floor(ARENA - 1 - d.rz) : ARENA - 2;
            const inB = Math.abs(cx) <= limX && Math.abs(cz) <= limZ;
            eAim = { x: cx, z: cz, ok: inB && !eBlocked(cx, cz, d.rx, d.rz, sl) };
          }
        }
      }

      // ── привид и рамка ──
      const sl = curSlot();
      if (eFound) {
        wire.visible = true;
        wire.scale.set(eFound.r * 2, eFound.h, eFound.rz * 2);
        wire.rotation.y = (eFound.rot * Math.PI) / 180;
        wire.position.set(eFound.x, eFound.h / 2, eFound.z);
      } else wire.visible = false;
      if (eAim && !eFound) {
        ghost.visible = true;
        // призрак показывает НАСТОЯЩИЙ след с поворотом, не описанную рамку
        ghost.scale.set(sl.r * 2, sl.h, (sl.rz ?? sl.r) * 2);
        ghost.rotation.y = (eRot * Math.PI) / 180;
        ghost.position.set(eAim.x, sl.h / 2, eAim.z);
        (ghost.material as THREE.MeshBasicMaterial).color.setHex(eAim.ok ? 0x40ff70 : 0xff4030);
      } else ghost.visible = false;

      // ── действия ──
      if (eClickL) {
        eClickL = false;
        if (eAim && !eFound && eAim.ok) {
          const c = eCounts();
          if (sl.kind === 'pillar') {
            if (c.pillars >= ARENA_CAPS.pillars) eSay(t('ed.capPillars', ARENA_CAPS.pillars));
            else {
              eDef.pillars.push(
                sl.pk === 'block' && !eRot
                  ? { x: eAim.x, z: eAim.z, r: sl.r }
                  : { x: eAim.x, z: eAim.z, r: sl.r, rz: sl.rz ?? sl.r, kind: sl.pk, ...(eRot ? { rot: eRot } : {}) },
              );
              rebuildEditor();
            }
          } else if (sl.kind === 'torch') {
            if (c.torches >= ARENA_CAPS.torches) eSay(t('ed.capTorches', ARENA_CAPS.torches));
            else { eDef.torches.push({ x: eAim.x, z: eAim.z }); rebuildEditor(); }
          } else if (sl.kind === 'seal') {
            if (c.seals >= ARENA_CAPS.seals) eSay(t('ed.capSeals', ARENA_CAPS.seals));
            else { eDef.seals.push({ x: eAim.x, z: eAim.z }); rebuildEditor(); }
          } else if (sl.kind === 'start') {
            eDef.start = { x: eAim.x, z: eAim.z };
            startMarker.position.set(eAim.x, 0, eAim.z);
            eSaveLocal();
          } else {
            if (c.pickups >= ARENA_CAPS.pickups) eSay(t('ed.capPickups', ARENA_CAPS.pickups));
            else { eDef.pickups.push({ kind: sl.kind, x: eAim.x, z: eAim.z }); rebuildEditor(); }
          }
        } else if (eFound) eSay(t('ed.occupied'));
      }
      if (eClickR) {
        eClickR = false;
        if (eFound) {
          if (eFound.type === 'pillar') eDef.pillars.splice(eFound.ix, 1);
          else if (eFound.type === 'torch') eDef.torches.splice(eFound.ix, 1);
          else if (eFound.type === 'seal') eDef.seals.splice(eFound.ix, 1);
          else eDef.pickups.splice(eFound.ix, 1);
          rebuildEditor();
        }
      }
    };

    // ── прогрев шейдеров: всё компилируется на титуле, а не посреди боя ──
    // (замер: первая встреча с материалом стоила 7.8 мс, счётчик ловил
    // компиляцию программы уже в бою)
    {
      // геометрия всех 12 вариантов строится сейчас, а не при первом спавне
      for (const kk of ['gnaar', 'boom', 'kleer', 'bull', 'harpy', 'mech'] as MK[]) {
        for (const vv of [false, true]) {
          const w = buildMonster(kk, vv);
          for (const mt of w.mats) mt.dispose();
        }
      }
      const warm = buildMonster('harpy', true);      // покрывает оба монстровых материала
      warm.grp.position.set(0, -40, 0);
      ctx.scene.add(warm.grp);
      const wasHidden: THREE.Object3D[] = [];
      for (const o of [...ballMeshes, ...rktMeshes]) {
        if (!o.visible) { o.visible = true; wasHidden.push(o); }
      }
      ctx.compile();
      for (const o of wasHidden) o.visible = false;
      ctx.scene.remove(warm.grp);
      for (const mt of warm.mats) mt.dispose();
    }

    // ── HUD ──
    const g = ctx.hud;
    /**
     * МАСШТАБ HUD. Рисуем в координатах базовой высоты 720 и растягиваем всё
     * разом. Иначе на большом экране статус-бар и меню остаются мелкими:
     * размеры-то заданы в пикселях, а их там вдвое-втрое больше. Godot-порт
     * добивается того же режимом растяжения canvas_items.
     * Всё, что сравнивает координаты указателя с версткой, обязано делить их
     * на hs() — для этого есть pv().
     */
    const hs = () => Math.max(1, ctx.height / 720);
    const HW = () => ctx.width / hs();
    const HH = () => ctx.height / hs();
    /** указатель в координатах HUD */
    const pv = () => ({ x: ctx.input.pointer.x / hs(), y: ctx.input.pointer.y / hs() });
    const btnRects = () => {
      const W = HW(), H = HH();
      const w = Math.min(230, W * 0.38), h = 48, gap = 22;
      return {
        again: { x: W / 2 - w - gap / 2, y: H * 0.6, w, h },
        menu: { x: W / 2 + gap / 2, y: H * 0.6, w, h },
      };
    };
    const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
      x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const pixelBtn = (r: { x: number; y: number; w: number; h: number }, label: string, on: boolean, col: string) => {
      g.fillStyle = '#0a0505'; g.fillRect(r.x + 5, r.y + 5, r.w, r.h);
      g.fillStyle = on ? col : '#1c1010';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = on ? '#0a0505' : '#5a3030'; g.lineWidth = 3;
      g.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
      g.fillStyle = on ? '#0a0505' : '#c8a0a0';
      const fs = Math.max(11, Math.min(19, (r.w - 18) / (label.length * 0.66)));
      g.font = `${fs}px ${FAM}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label.toUpperCase(), r.x + r.w / 2, r.y + r.h / 2 + 1);
      g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    };

    // ЛИЦО в статус-баре — главный думизм
    const drawFace = (cx: number, cy: number, s: number) => {
      const k = hp / 100;
      const px2 = (x: number, y: number, w: number, h: number, col: string) => {
        g.fillStyle = col; g.fillRect(cx + x * s, cy + y * s, w * s, h * s);
      };
      // фон-ниша
      px2(-5, -6, 10, 12, '#1a0e0c');
      // кожа темнеет и краснеет при уроне
      const skin = k > 0.7 ? '#d8a074' : k > 0.4 ? '#c88a5a' : '#b06a44';
      px2(-4, -5, 8, 10, skin);
      // волосы
      px2(-4, -5, 8, 2, '#5a3a1a');
      // глаза смотрят в сторону faceLook
      const ex = Math.round(faceLook);
      px2(-3 + ex * 0.6, -2, 1.6, 1.6, '#f0f0f0');
      px2(1.4 + ex * 0.6, -2, 1.6, 1.6, '#f0f0f0');
      px2(-2.6 + ex, -1.7, 0.9, 1, '#1a1a2a');
      px2(1.8 + ex, -1.7, 0.9, 1, '#1a1a2a');
      // брови: сдвигаются при боли
      const brow = faceOw > 0 ? 0.5 : 0;
      px2(-3.2, -3 + brow, 2.4, 0.7, '#3a2410');
      px2(1.0, -3 + brow, 2.4, 0.7, '#3a2410');
      // рот: скалится, при низком hp — оскал
      if (faceOw > 0) px2(-1.6, 1.6, 3.2, 2, '#3a0a0a');           // «ой!»
      else if (k > 0.6) px2(-2, 2.2, 4, 0.9, '#3a1a14');            // ухмылка
      else { px2(-2.2, 1.8, 4.4, 1.6, '#3a0a0a'); px2(-1.4, 1.8, 0.7, 1.6, '#f0e8d8'); px2(0.7, 1.8, 0.7, 1.6, '#f0e8d8'); }
      // кровь по мере урона
      if (k < 0.75) px2(-4, -3.2, 1.4, 3 + (1 - k) * 3, '#a01c18');
      if (k < 0.5) px2(2.6, -2, 1.4, 4, '#a01c18');
      if (k < 0.25) px2(-1, 3.6, 2.6, 2.2, '#a01c18');
    };

    const drawStatusBar = () => {
      const W = HW(), H = HH();
      const bh = Math.min(78, H * 0.16);
      const y0 = H - bh;
      // панель
      g.fillStyle = '#2a1a16'; g.fillRect(0, y0, W, bh);
      g.fillStyle = '#4a2c26'; g.fillRect(0, y0, W, 4);
      const cell = (x: number, w: number) => {
        g.fillStyle = '#1c100e'; g.fillRect(x, y0 + 8, w, bh - 16);
        g.strokeStyle = '#5a3a30'; g.lineWidth = 2; g.strokeRect(x + 1, y0 + 9, w - 2, bh - 18);
      };
      const u = W / 100;
      const lblY = y0 + 22;                     // строка подписи
      const numY = y0 + bh - 16;                // строка числа
      const numF = Math.max(14, Math.min(26, bh * 0.34));
      // ЗДОРОВЬЕ
      cell(u * 2, u * 17);
      g.textAlign = 'center';
      g.fillStyle = '#c8a0a0'; g.font = FONT(10);
      g.fillText(t('hud.health'), u * 10.5, lblY);
      g.fillStyle = hp > 40 ? '#e8c840' : Math.floor(time * 6) % 2 === 0 ? '#ff4030' : '#a01c18';
      g.font = FONT(numF);
      g.fillText(`${Math.ceil(hp)}%`, u * 10.5, numY);
      // ПАТРОНЫ
      cell(u * 21, u * 15);
      g.fillStyle = '#c8a0a0'; g.font = FONT(10);
      g.fillText(t('hud.ammo'), u * 28.5, lblY);
      g.fillStyle = '#e8c840'; g.font = FONT(numF);
      g.fillText(`${ammo[WEAPONS[weapon].ammo]}`, u * 28.5, numY);
      // ЛИЦО
      cell(u * 38, u * 24);
      drawFace(u * 50, y0 + bh / 2, Math.min((bh - 20) / 13, u * 1.7));
      // БРОНЯ
      cell(u * 64, u * 15);
      g.fillStyle = '#c8a0a0'; g.font = FONT(10);
      g.fillText(t('hud.armor'), u * 71.5, lblY);
      g.fillStyle = '#60a0ff'; g.font = FONT(numF);
      g.fillText(`${Math.ceil(armor)}%`, u * 71.5, numY);
      // ОРУЖИЕ + ДЕНЬГИ
      cell(u * 81, u * 17);
      g.fillStyle = '#c8a0a0'; g.font = FONT(10);
      g.fillText(t('hud.weapons'), u * 89.5, lblY);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = owned[i] ? (i === weapon ? '#e8c840' : '#8a7a40') : '#3a2a26';
        g.fillRect(u * 84.2 + i * u * 3.8, lblY + 7, u * 3, 6);
      }
      g.fillStyle = '#7bd88f'; g.font = FONT(Math.max(13, numF * 0.7));
      g.fillText(`${score}`, u * 89.5, numY);
      g.textAlign = 'left';
      return bh;
    };

    /** Встроенный счётчик (F3 или ?perf=1). Показывает, КУДА уходит кадр:
     *  логика, отрисовка, сколько вызовов и сколько живых объектов. */
    const drawPerf = () => {
      const p = ctx.perf;
      const rows: [string, string, boolean][] = [
        ['кадр', `${p.frame.toFixed(1)} мс  (${p.frame > 0 ? Math.round(1000 / p.frame) : 0} fps)`, p.frame > 20],
        ['пик за сек', `${p.spike.toFixed(1)} мс`, p.spike > 33],
        ['логика', `${p.update.toFixed(2)} мс`, p.update > 6],
        ['отрисовка', `${p.render.toFixed(2)} мс`, p.render > 6],
        ['вызовов', `${p.calls}`, p.calls > 900],
        ['треугольников', `${(p.tris / 1000).toFixed(0)}k`, false],
        ['программ', `${p.programs}`, false],
        ['геометрий', `${p.geometries}`, p.geometries > 900],
        ['—', '', false],
        ['твари / в пути', `${mons.length} / ${pending.length}`, false],
        ['куски', `${gibs.length}/${GIB_MAX}`, gibs.length >= GIB_MAX],
        ['пыль', `${puffs.length}/${PUFF_MAX}`, puffs.length >= PUFF_MAX],
        ['файерболы', `${balls.length}/${BALL_MAX}`, false],
        ['ракеты', `${rockets.length}/${RKT_MAX} · ${ammo.rkt} шт`, false],
        ['волна / бюджет', `${wave} / ${waveBudget}`, false],
        ['режим', `${dName(D)} · потолок ${D.cap}`, false],
      ];
      const pad = 8, lh = 15, w = 208;
      const h = rows.length * lh + pad * 2;
      const x = 10, y = 100;
      g.fillStyle = 'rgba(8,4,4,0.82)';
      g.fillRect(x, y, w, h);
      g.strokeStyle = '#4a2c26'; g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      g.font = '11px ui-monospace, monospace';
      g.textAlign = 'left';
      rows.forEach(([k, v, bad], i) => {
        const yy = y + pad + i * lh + 11;
        if (k === '—') { g.strokeStyle = '#4a2c26'; g.beginPath(); g.moveTo(x + pad, yy - 5); g.lineTo(x + w - pad, yy - 5); g.stroke(); return; }
        g.fillStyle = '#a07a6a';
        g.fillText(k, x + pad, yy);
        g.fillStyle = bad ? '#ff5a3a' : '#e8dcd4';
        g.textAlign = 'right';
        g.fillText(v, x + w - pad, yy);
        g.textAlign = 'left';
      });
    };

    /** HUD редактора: заголовок, счётчики, хотбар, подсказки */
    const drawEditorHud = () => {
      const W = HW(), H = HH();
      drawSunFlare();
      // прицел
      g.strokeStyle = 'rgba(232,200,64,0.85)'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(W / 2 - 9, H / 2); g.lineTo(W / 2 - 3, H / 2);
      g.moveTo(W / 2 + 3, H / 2); g.lineTo(W / 2 + 9, H / 2);
      g.moveTo(W / 2, H / 2 - 9); g.lineTo(W / 2, H / 2 - 3);
      g.moveTo(W / 2, H / 2 + 3); g.lineTo(W / 2, H / 2 + 9);
      g.stroke();

      // шапка
      g.textAlign = 'left';
      const edTitle = t('ed.title');
      fitFont(g, edTitle, W * 0.4, 22, FAM);
      g.fillStyle = '#e8c840';
      g.fillText(edTitle, 14, 30);
      const c = eCounts();
      g.font = '12px ui-monospace, monospace';
      g.fillStyle = '#a07a6a';
      g.fillText(
        t('ed.counts',
          c.pillars, ARENA_CAPS.pillars, c.torches, ARENA_CAPS.torches,
          c.seals, ARENA_CAPS.seals, c.pickups, ARENA_CAPS.pickups,
          eDef.size * 2, skyName(eDef.sky), groundName(eDef.ground)),
        14, 48,
      );
      if (c.seals < 2) {
        g.fillStyle = '#ff5a3a';
        g.fillText(t('ed.needSeals'), 14, 64);
      }

      // хотбар: ячейка = категория, внутри — текущий вариант и счётчик «в/из»
      const n = E_GROUPS.length;
      const sw = Math.min(96, (W - 40) / n), sh = 50, gap = 4;
      const x0 = W / 2 - (sw * n + gap * (n - 1)) / 2, y0 = H - sh - 14;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (sw + gap);
        const sel = i === gSel;
        const grp = E_GROUPS[i];
        const it = grp.items[vSel[i]];
        g.fillStyle = sel ? 'rgba(232,200,64,0.2)' : 'rgba(20,10,8,0.72)';
        g.fillRect(x, y0, sw, sh);
        g.strokeStyle = sel ? '#e8c840' : '#4a2c26';
        g.lineWidth = sel ? 3 : 2;
        g.strokeRect(x + 1, y0 + 1, sw - 2, sh - 2);
        g.textAlign = 'left';
        g.fillStyle = sel ? '#e8c840' : '#8a6a5a';
        g.font = '10px ui-monospace, monospace';
        g.fillText(`${(i + 1) % 10}`, x + 4, y0 + 12);
        if (grp.items.length > 1) {
          g.textAlign = 'right';
          g.fillText(`${vSel[i] + 1}/${grp.items.length}`, x + sw - 4, y0 + 12);
        }
        g.textAlign = 'center';
        g.fillStyle = sel ? '#a08a60' : '#6a564a';
        // категория подписана мелко: имена длинные, а ячейка узкая
        fitFont(g, t(grp.name), sw - 6, 9, MONO, 7);
        g.fillText(t(grp.name), x + sw / 2, y0 + 22);
        fitFont(g, t(it.name), sw - 6, 12, FAM);
        g.fillStyle = sel ? '#e8c840' : '#9a8060';
        g.fillText(t(it.name), x + sw / 2, y0 + sh - 8);
      }

      // подсказки: строка длинная и в другом языке длиннее — подбираем размер,
      // иначе концы уезжают за края экрана
      g.textAlign = 'center';
      g.fillStyle = '#7a5a50';
      const help = t('ed.help');
      fitFont(g, help, W - 24, 11, MONO, 6);
      g.fillText(help, W / 2, y0 - 10);
      if (eMsgT > 0) {
        fitFont(g, eMsg, W * 0.8, 18, FAM);
        g.fillStyle = '#ff8a30';
        g.fillText(eMsg, W / 2, H * 0.3);
      }
      g.textAlign = 'left';
    };

    /** сэмовский линзовый флейр: сияние на солнце + блики к центру экрана */
    const sunScreen = new THREE.Vector3();
    const drawSunFlare = () => {
      const sky = phase === 'edit' ? eDef.sky : A.sky;
      if (sky !== 'day') return;
      sunScreen.copy(SUN_POS).project(cam);
      if (sunScreen.z > 1) return;                       // солнце за спиной
      const W = HW(), H = HH();
      const sx = (sunScreen.x * 0.5 + 0.5) * W;
      const sy = (-sunScreen.y * 0.5 + 0.5) * H;
      if (sx < -W * 0.3 || sx > W * 1.3 || sy < -H * 0.3 || sy > H * 1.3) return;
      // чем ближе к центру взгляда, тем ярче — как в сэме, когда смотришь на солнце
      const dcx = (sx - W / 2) / W, dcy = (sy - H / 2) / H;
      const k = Math.max(0, 1 - Math.hypot(dcx, dcy) * 1.7);
      if (k <= 0.02) return;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const glow = g.createRadialGradient(sx, sy, 0, sx, sy, 140 + k * 160);
      glow.addColorStop(0, `rgba(255,246,214,${(0.5 + k * 0.4).toFixed(3)})`);
      glow.addColorStop(0.35, `rgba(255,226,150,${(0.2 + k * 0.25).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(255,210,120,0)');
      g.fillStyle = glow;
      g.fillRect(sx - 320, sy - 320, 640, 640);
      // цепочка бликов вдоль линии солнце → центр
      for (const [t, r, a] of [[0.35, 14, 0.35], [0.62, 8, 0.3], [0.95, 22, 0.22], [1.3, 11, 0.26]] as const) {
        const bx = sx + (W / 2 - sx) * t, by = sy + (H / 2 - sy) * t;
        const bl = g.createRadialGradient(bx, by, 0, bx, by, r * (1 + k));
        bl.addColorStop(0, `rgba(255,235,180,${(a * k).toFixed(3)})`);
        bl.addColorStop(1, 'rgba(255,220,150,0)');
        g.fillStyle = bl;
        g.fillRect(bx - r * 2.4, by - r * 2.4, r * 4.8, r * 4.8);
      }
      g.restore();
    };

    /** синхромаркер под ?sfxlog=1: белая заливка, пока не отдадим три кадра и 120 мс */
    let syncOn = sfxLog, syncFrames = 0, syncT0 = 0;
    const drawHud = () => {
      const sc = hs();
      g.save();
      g.scale(sc, sc);
      try { drawHudInner(); } finally { g.restore(); }
      // СИНХРОМАРКЕР: белые кадры в начале забега. По ним монтаж совмещает
      // запись экрана с журналом звуков — первый белый кадр и есть общий ноль.
      // Считаем здесь, а не в onFrame: drawHud зовётся ровно раз за кадр из
      // любой фазы, а выходов из onFrame несколько.
      if (syncOn) {
        if (syncFrames === 0) {
          syncT0 = performance.now();
          sfxEvents.push({ type: 'marker', t: syncT0 / 1000 });
        }
        syncFrames++;
        // Три кадра игры — это ~50 мс, а захват экрана берёт 25-30 к/с и такую
        // вспышку иногда пропускает целиком (уже теряли маркер на дубле).
        // Поэтому держим ещё и по времени: 120 мс поймает любой захват.
        if (syncFrames >= 3 && performance.now() - syncT0 >= 120) syncOn = false;
        g.fillStyle = '#fff';
        g.fillRect(0, 0, ctx.width, ctx.height);
      }
    };

    const drawHudInner = () => {
      const W = HW(), H = HH();
      if (phase === 'edit') { drawEditorHud(); return; }

      // ── ТИТУЛ (красно-чёрный, курсор-череп) ──
      if (phase === 'title') {
        // завеса: густая по центру (под текст), прозрачная по краям — там черепа
        const wash = g.createLinearGradient(0, 0, W, 0);
        wash.addColorStop(0, 'rgba(16,4,4,0.26)');
        wash.addColorStop(0.32, 'rgba(16,4,4,0.88)');
        wash.addColorStop(0.68, 'rgba(16,4,4,0.88)');
        wash.addColorStop(1, 'rgba(16,4,4,0.26)');
        g.fillStyle = wash; g.fillRect(0, 0, W, H);
        // «пламенный» градиент сверху
        const gr = g.createLinearGradient(0, 0, 0, H * 0.5);
        gr.addColorStop(0, 'rgba(200,40,10,0.55)'); gr.addColorStop(1, 'rgba(20,4,4,0)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.5);
        g.textAlign = 'center';
        // название — во всю ширину; размер берём фактический, к нему привязан огонь
        const titleFont = fitFont(g, 'ФАЄРВОЛ', W * 0.92, 116, FAM);
        const titlePx = parseInt(titleFont, 10) || 62;
        const titleW = g.measureText('ФАЄРВОЛ').width;
        const titleY = H * 0.24;
        g.save();
        g.shadowColor = 'rgba(255,80,20,0.9)'; g.shadowBlur = 44;
        g.fillStyle = '#e8c840';
        g.fillText('ФАЄРВОЛ', W / 2, titleY);
        g.restore();

        // ── огонь: мелкие искры рождаются в буквах, всплывают и гаснут ──
        if (!titleFire.length) {
          for (let i = 0; i < 90; i++) {
            titleFire.push({ x: 0, y: 0, vy: 0, drift: 0, life: 1e9, max: 1, sz: 2 });
          }
        }
        const dtF = Math.min(0.05, Math.max(0, time - fireLast));
        fireLast = time;
        g.save();
        g.globalCompositeOperation = 'lighter';        // искры складываются, как огонь
        for (const p of titleFire) {
          p.life += dtF;
          if (p.life >= p.max) {
            p.x = (rng() - 0.5) * titleW * 0.98;
            p.y = titleY - rng() * titlePx * 0.78;     // внутри глифов
            p.vy = 24 + rng() * 58;
            p.drift = (rng() - 0.5) * 22;
            p.max = 0.5 + rng() * 0.95;
            p.sz = (1.5 + rng() * 2.8) * Math.max(1, W / 820);
            p.life = 0;
          }
          const k = p.life / p.max;
          p.y -= p.vy * dtF;
          p.x += Math.sin(time * 3 + p.y * 0.06) * p.drift * dtF;
          // остывание: бело-жёлтая → оранжевая → тёмно-красная
          const col = k < 0.3 ? '255,228,150' : k < 0.65 ? '255,140,50' : '188,58,24';
          const a = 0.9 * (1 - k) * (k < 0.12 ? k / 0.12 : 1);
          g.fillStyle = `rgba(${col},${a.toFixed(3)})`;
          const sz = p.sz * (1 - k * 0.45);
          g.fillRect(W / 2 + p.x - sz / 2, p.y - sz / 2, sz, sz);
        }
        g.restore();
        // «ФАЄРВОЛ» не переводится никогда, но чужому глазу оно ничего не
        // говорит — в английском под названием идёт мелкая расшифровка
        let subY = titleY + 34;
        const nameEn = t('title.name_en');
        if (nameEn) {
          fitFont(g, nameEn, W * 0.6, 20, FAM);
          g.fillStyle = '#a05a2a';
          g.fillText(nameEn, W / 2, titleY + 24);
          subY = titleY + 50;
        }
        const sub = t('title.sub');
        fitFont(g, sub, W * 0.8, 15, FAM);
        g.fillStyle = '#c88a5a';
        g.fillText(sub, W / 2, subY);
        if (best[D.key] > 0) {
          const rec = t('title.best', dName(D), best[D.key]);
          fitFont(g, rec, W * 0.7, 16, FAM);
          g.fillStyle = '#7bd88f';
          g.fillText(rec, W / 2, subY + 26);
        }
        const menu = titleMenu();
        const step = menu.length >= 5 ? 48 : 58;
        for (let i = 0; i < menu.length; i++) {
          const yy = H * 0.5 + i * step;
          const on = i === titleSel;
          const small = menu[i].act === 'diff' || menu[i].act === 'arena';
          fitFont(g, menu[i].label, W * 0.5, small ? 24 : 30, FAM);
          g.fillStyle = small ? (on ? D.col : '#7a5a4a') : on ? '#e8c840' : '#8a5a4a';
          g.fillText(menu[i].label, W / 2, yy);
          if (on && menu[i].hint) {
            g.save();
            fitFont(g, `← → ${menu[i].hint}`, W * 0.6, 12, FAM);
            g.fillStyle = '#7a5a50';
            g.fillText(`← → ${menu[i].hint}`, W / 2, yy + 17);
            g.restore();
          }
          if (on) {
            // курсор-череп слева от края текста: пункты разной длины,
            // фиксированный отступ налезал на длинную строку сложности
            const tw = g.measureText(menu[i].label).width;
            const sx = W / 2 - tw / 2 - 34, sy = yy - 10;
            g.fillStyle = '#d8d2c0'; g.fillRect(sx - 12, sy - 12, 24, 20);
            g.fillStyle = '#140808'; g.fillRect(sx - 8, sy - 6, 6, 7); g.fillRect(sx + 2, sy - 6, 6, 7);
            g.fillStyle = '#d8d2c0'; g.fillRect(sx - 7, sy + 8, 14, 5);
            g.fillStyle = '#140808'; g.fillRect(sx - 3, sy + 8, 2, 5); g.fillRect(sx + 1, sy + 8, 2, 5);
          }
        }
        const how = t(mob ? 'title.tap' : 'title.keys');
        fitFont(g, how, W * 0.8, 13, FAM);
        g.fillStyle = '#7a5a50';
        g.fillText(how, W / 2, H * 0.82);
        if (warpDigits !== null) {               // набран IDCLEV — ждём две цифры волны
          const warp = t('title.idclev', warpDigits);
          fitFont(g, warp, W * 0.4, 13, FAM);
          g.fillStyle = '#7bd88f';
          g.fillText(warp, W / 2, H * 0.88);
        }
        g.textAlign = 'left';
        return;
      }

      // «РАКЕТНИЦА» — короткая плашка сразу после подбора
      if (launcherMsg > 0 && (phase === 'wave' || phase === 'clear')) {
        g.textAlign = 'center';
        const got = t('hud.rkt'), warn = t('hud.rkt.warn');
        fitFont(g, got, W * 0.7, 26, FAM);
        g.fillStyle = '#ff8a30';
        g.fillText(got, W / 2, H * 0.34);
        fitFont(g, warn, W * 0.7, 14, FAM);
        g.fillStyle = '#c88a5a';
        g.fillText(warn, W / 2, H * 0.34 + 24);
        g.textAlign = 'left';
      }

      if (showPerf) drawPerf();

      drawSunFlare();

      // ── прицел ──
      if (phase === 'wave' || phase === 'clear') {
        const cx = W / 2, cy = H / 2;
        g.strokeStyle = 'rgba(232,200,64,0.8)'; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx - 11, cy); g.lineTo(cx - 4, cy);
        g.moveTo(cx + 4, cy); g.lineTo(cx + 11, cy);
        g.moveTo(cx, cy - 11); g.lineTo(cx, cy - 4);
        g.moveTo(cx, cy + 4); g.lineTo(cx, cy + 11);
        g.stroke();
      }

      const bh = drawStatusBar();

      // ── панель оружия сверху: все стволы всегда видны, отмечен выбранный ──
      {
        const slots = owned[3] ? 4 : 3;                 // четвёртый появляется вместе со стволом
        const sw = Math.min(112, W * (slots === 4 ? 0.135 : 0.16)), sh = 46, gap = 8;
        const total = sw * slots + gap * (slots - 1);
        const x0 = W / 2 - total / 2, y1 = 12;
        for (let i = 0; i < slots; i++) {
          const x = x0 + i * (sw + gap);
          const has = owned[i], sel = i === weapon;
          g.fillStyle = sel ? 'rgba(232,200,64,0.16)' : 'rgba(20,10,8,0.55)';
          g.fillRect(x, y1, sw, sh);
          g.strokeStyle = sel ? '#e8c840' : has ? '#6a4a3a' : '#33241f';
          g.lineWidth = sel ? 3 : 2;
          g.strokeRect(x + 1, y1 + 1, sw - 2, sh - 2);
          // номер слота
          g.textAlign = 'left';
          g.fillStyle = sel ? '#e8c840' : has ? '#a07a5a' : '#4a352c';
          g.font = FONT(13);
          g.fillText(`${i + 1}`, x + 6, y1 + 16);
          // иконка ствола (силуэт кубами)
          const ix = x + sw * 0.5, iy = y1 + 20;
          const col = !has ? '#3a2a24' : sel ? '#e8c840' : '#9a8a70';
          g.fillStyle = col;
          if (i === 0) {                       // пистолет
            g.fillRect(ix - 14, iy - 3, 22, 5);
            g.fillRect(ix - 12, iy + 2, 7, 9);
          } else if (i === 1) {                // дробовик
            g.fillRect(ix - 20, iy - 3, 32, 5);
            g.fillRect(ix - 20, iy + 2, 26, 3);
            g.fillRect(ix + 8, iy + 1, 9, 7);
          } else if (i === 2) {                // пулемёт
            g.fillRect(ix - 20, iy - 4, 28, 4);
            g.fillRect(ix - 20, iy + 1, 28, 4);
            g.fillRect(ix + 6, iy - 6, 8, 13);
            g.fillRect(ix - 6, iy + 6, 8, 6);
          } else {                             // ракетница: труба с раструбом
            g.fillRect(ix - 18, iy - 5, 30, 10);
            g.fillRect(ix - 23, iy - 7, 6, 14);
            g.fillRect(ix + 12, iy - 4, 6, 8);
            g.fillRect(ix - 6, iy + 5, 7, 6);
          }
          // патроны этого ствола
          g.textAlign = 'center';
          if (has) {
            const a = ammo[WEAPONS[i].ammo];
            g.fillStyle = a > 0 ? (sel ? '#e8c840' : '#c8a060') : '#ff4030';
            g.font = FONT(13);
            g.fillText(`${a}`, ix, y1 + sh - 6);
          } else {
            g.fillStyle = '#4a352c'; g.font = FONT(11);
            g.fillText('—', ix, y1 + sh - 7);
          }
        }
        g.textAlign = 'left';
      }

      // счётчик волны сверху
      g.textAlign = 'left';
      g.fillStyle = '#e8c840'; g.font = FONT(15);
      g.fillText(t('hud.wave', wave), 16, 26);
      g.fillStyle = '#c88a5a'; g.font = FONT(12);
      g.fillText(t('hud.alive', alive), 16, 46);
      g.textAlign = 'right';
      g.fillStyle = '#c8a0a0'; g.font = FONT(12);
      g.fillText(t('hud.perWave', waveScore(wave)), W - 16, 26);
      g.fillText(t('hud.kills', totalKills), W - 16, 46);
      g.textAlign = 'left';

      // баннеры
      if (phase === 'wave' && phaseT < 2) {
        g.textAlign = 'center';
        const t1 = t(wave % 5 === 0 ? 'hud.rush' : 'hud.wave', wave);
        if (D.key !== 'norm') {                       // на какой сложности идёт забег
          g.save();
          fitFont(g, dName(D), W * 0.4, 15, FAM);
          g.fillStyle = D.col;
          g.fillText(dName(D), W / 2, H * 0.2);
          g.restore();
        }
        fitFont(g, t1, W * 0.86, 40, FAM);
        g.save();
        g.shadowColor = 'rgba(255,80,20,0.9)'; g.shadowBlur = 20;
        g.fillStyle = wave % 5 === 0 ? '#ff6030' : '#e8c840';
        g.globalAlpha = Math.min(1, (2 - phaseT) * 1.4);
        g.fillText(t1, W / 2, H * 0.3);
        g.restore();
        g.globalAlpha = 1;
        g.textAlign = 'left';
      }
      if (phase === 'clear') {
        g.textAlign = 'center';
        const done = t('hud.cleared');
        fitFont(g, done, W * 0.8, 34, FAM);
        g.fillStyle = '#7bd88f';
        g.fillText(done, W / 2, H * 0.3);
        const paid = t('hud.score', waveScore(wave));
        fitFont(g, paid, W * 0.6, 22, FAM);
        g.fillStyle = '#e8c840';
        g.fillText(paid, W / 2, H * 0.3 + 32);
        const next = t('hud.next', Math.ceil(Math.max(0, 4 - phaseT)));
        fitFont(g, next, W * 0.6, 14, FAM);
        g.fillStyle = '#c88a5a';
        g.fillText(next, W / 2, H * 0.3 + 58);
        g.textAlign = 'left';
      }

      // подсказка управления в начале забега
      if (!mob && wave === 1 && phaseT < 7 && phase === 'wave') {
        g.textAlign = 'center';
        const tip = t(locked ? 'hud.tip.locked' : 'hud.tip.free');
        fitFont(g, tip, W * 0.92, 14, FAM);
        g.fillStyle = 'rgba(232,200,64,0.75)';
        g.fillText(tip, W / 2, H - Math.min(78, H * 0.16) - 18);
        g.textAlign = 'left';
      }

      // мобильные контролы
      if (touch && (phase === 'wave' || phase === 'clear')) {
        const L = tLayout();
        // стики
        for (const [c, v, lbl] of [[L.moveC, tMove, t('hud.move')], [L.lookC, tLook, t('hud.look')]] as const) {
          g.beginPath(); g.arc(c.x, c.y, L.r, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill();
          g.strokeStyle = 'rgba(232,200,64,0.25)'; g.lineWidth = 2; g.stroke();
          g.beginPath(); g.arc(c.x + v.x * L.r * 0.6, c.y + v.y * L.r * 0.6, L.r * 0.34, 0, Math.PI * 2);
          g.fillStyle = 'rgba(232,200,64,0.35)'; g.fill();
          g.fillStyle = 'rgba(200,160,120,0.6)'; g.font = FONT(10); g.textAlign = 'center';
          g.fillText(lbl, c.x, c.y - L.r - 8);
          g.textAlign = 'left';
        }
        drawButton(g, L.fire.x, L.fire.y, L.fire.r, t('hud.fire'), tFire, '#ff6030');
        drawButton(g, L.wpn.x, L.wpn.y, L.wpn.r, `${weapon + 1}`, false, '#e8c840');
        void bh;
      }

      // ── СМЕРТЬ: заработок + две кнопки ──
      if (phase === 'dead') {
        g.fillStyle = 'rgba(60,6,6,0.55)'; g.fillRect(0, 0, W, H);
        g.textAlign = 'center';
        g.save();
        const died = t('dead.title');
        fitFont(g, died, W * 0.86, 42, FAM);
        g.shadowColor = 'rgba(255,40,20,0.9)'; g.shadowBlur = 24;
        g.fillStyle = '#ff4030';
        g.fillText(died, W / 2, H * 0.26);
        g.restore();
        fitFont(g, `${score}`, W * 0.6, 46, FAM);
        g.fillStyle = '#7bd88f';
        g.fillText(`${score}`, W / 2, H * 0.26 + 56);
        const sub = t('dead.sub', Math.max(0, wave - 1), totalKills);
        fitFont(g, sub, W * 0.8, 15, FAM);
        g.fillStyle = '#c8a0a0';
        g.fillText(sub, W / 2, H * 0.26 + 84);
        const rec = cheated ? t('dead.cheated')
          : newRecord ? t('dead.record')
            : t('title.best', dName(D), best[D.key]);
        fitFont(g, rec, W * 0.8, newRecord ? 24 : 16, FAM);
        // новый рекорд мигает золотом, обычная строка — спокойная зелёная
        g.fillStyle = cheated ? '#8a6a60'
          : newRecord ? (Math.floor(time * 4) % 2 ? '#e8c840' : '#fff0a0') : '#7bd88f';
        g.fillText(rec, W / 2, H * 0.26 + 112);
        const R = btnRects();
        pixelBtn(R.again, t('dead.again'), endSel === 0, '#e8c840');
        pixelBtn(R.menu, t('dead.menu'), endSel === 1, '#7bd88f');
        const how = t(mob ? 'dead.tap' : 'dead.keys');
        fitFont(g, how, W * 0.7, 13, FAM);
        g.fillStyle = '#8a6a60';
        g.fillText(how, W / 2, R.again.y + R.again.h + 34);
        g.textAlign = 'left';
      }

      // вспышки урона/подбора
      if (flashT > 0) {
        g.fillStyle = flashCol === 0
          ? `rgba(180,20,10,${(flashT * 0.9).toFixed(3)})`
          : `rgba(220,190,60,${(flashT * 0.6).toFixed(3)})`;
        g.fillRect(0, 0, W, H);
      }
    };

    // ── коллизии ──
    const collide = (x: number, z: number, r: number): [number, number] => {
      let nx = x, nz = z;
      const lim = ARENA - 0.6 - r;
      nx = Math.max(-lim, Math.min(lim, nx));
      nz = Math.max(-lim, Math.min(lim, nz));
      for (const p of pillars) {
        const dx = nx - p.x, dz = nz - p.z;
        const needX = p.ex + r, needZ = p.ez + r;
        // прямоугольный след: выталкиваем по оси с меньшим проникновением
        if (Math.abs(dx) < needX && Math.abs(dz) < needZ) {
          if (needX - Math.abs(dx) < needZ - Math.abs(dz)) nx = p.x + Math.sign(dx || 1) * needX;
          else nz = p.z + Math.sign(dz || 1) * needZ;
        }
      }
      return [nx, nz];
    };

    /** точка внутри пилона (пилоны — квадраты в плане) */
    const inPillar = (x: number, z: number, pad = 0) => {
      for (const p of pillars) {
        if (Math.abs(x - p.x) < p.ex + pad && Math.abs(z - p.z) < p.ez + pad) return true;
      }
      return false;
    };
    /** перекрыт ли пилоном отрезок между двумя точками (слэб-тест по AABB) */
    const losBlocked = (x0: number, z0: number, x1: number, z1: number) => {
      const dx = x1 - x0, dz = z1 - z0;
      for (const p of pillars) {
        let t0 = 0, t1 = 1;
        if (Math.abs(dx) < 1e-6) {
          if (x0 < p.x - p.ex || x0 > p.x + p.ex) continue;
        } else {
          let ta = (p.x - p.ex - x0) / dx, tb = (p.x + p.ex - x0) / dx;
          if (ta > tb) { const sw = ta; ta = tb; tb = sw; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        if (Math.abs(dz) < 1e-6) {
          if (z0 < p.z - p.ez || z0 > p.z + p.ez) continue;
        } else {
          let ta = (p.z - p.ez - z0) / dz, tb = (p.z + p.ez - z0) / dz;
          if (ta > tb) { const sw = ta; ta = tb; tb = sw; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        return true;
      }
      return false;
    };

    // ═══════════════ АВТОПИЛОТ (?bot=1) ═══════════════
    /**
     * Снимает промо без рук: сам выбирает цель, кружит вокруг неё, стреляет и
     * бегает за аптечками. Своей физики у бота НЕТ — он только выставляет
     * виртуальные оси, которые ниже прибавляются к вводу игрока, и доворачивает
     * yaw. Поэтому на повадки тварей, коллизии и баланс он не влияет никак.
     */
    let botFwd = 0, botStrafe = 0, botFire = false;
    /** сторона облёта цели и сколько ещё её держать */
    let botOrbit = 1, botOrbitT = 0, botSwapCd = 0;
    /** пикап, за которым идём; botGoalT — отпущенное на это время */
    let botGoal: Pickup | null = null;
    let botGoalT = 0, botGoalCd = 0;
    /** сколько собирались пройти в прошлом кадре и откуда — так ловим упор в пилон */
    let botWantLen = 0, botWasX = 0, botWasZ = 0;
    const botTick = (dt: number) => {
      botFwd = 0; botStrafe = 0; botFire = false;
      // Упёрлись? Прошли меньше 40% намеченного — обходим с другой стороны.
      // Тем же признаком в игре ловится сорванный разгон рогача: у внутренних
      // стен «намеченного пути» не остаётся, а стоять в кадре нельзя.
      if (botWantLen > 0 && Math.hypot(px - botWasX, pz - botWasZ) < botWantLen * 0.4) {
        botOrbit = -botOrbit;
        botOrbitT = 2 + rng() * 2;
      }
      botOrbitT -= dt;
      if (botOrbitT <= 0) { botOrbit = rng() < 0.5 ? 1 : -1; botOrbitT = 2 + rng() * 2; }
      if (botSwapCd > 0) botSwapCd -= dt;

      // ── цель: ближайшая тварь, но подбежавший камикадзе идёт вне очереди ──
      let tgt: Mon | null = null, bestW = 1e9, boomD = 1e9;
      for (const m of mons) {
        const d = Math.hypot(m.x - px, m.z - pz);
        if (m.kind === 'boom' && d < boomD) boomD = d;
        const w = m.kind === 'boom' && d < 8 ? d - 100 : d;
        if (w < bestW) { bestW = w; tgt = m; }
      }
      const dist = tgt ? Math.hypot(tgt.x - px, tgt.z - pz) : 0;

      // ── прицел ──
      let err = Math.PI;
      if (tgt) {
        // вперёд = (−sin yaw, −cos yaw) — отсюда знаки, как у разворота тварей.
        // Синусоида поверх — дрожь руки: без неё прицел стоит как приваренный,
        // и в записи сразу видно машину
        const want = Math.atan2(-(tgt.x - px), -(tgt.z - pz)) + Math.sin(time * 0.9) * 0.03;
        let df = want - yaw;
        while (df > Math.PI) df -= Math.PI * 2;
        while (df < -Math.PI) df += Math.PI * 2;
        const step = Math.max(-3.5 * dt, Math.min(3.5 * dt, df));
        yaw += step;
        err = Math.abs(df - step);
      } else {
        yaw += dt * 0.5;                 // целей нет — озираемся, кадр не должен замирать
      }

      // ── ход: держим дистанцию и кружим ──
      if (!tgt) botFwd = 0.5;
      else if (dist > 14) botFwd = 1;
      else if (dist < 8) botFwd = -0.7;
      else botFwd = 0.2;
      if (boomD < 6) botFwd = -1;        // от заряда лучше подальше
      botStrafe = botOrbit;

      // ── оружие: ракетница на дальних, дробовик в упор (свои же осколки) ──
      if (tgt && botSwapCd <= 0) {
        let want: number;
        if (owned[3] && dist > 7) want = 3;
        else if (dist <= 7) want = owned[1] ? 1 : 0;
        else if (dist > 10 && owned[2]) want = 2;
        else want = owned[1] ? 1 : 0;
        // с пустым стволом бот весь бой сушил бы спуск — откатываемся к тому,
        // в чём патроны ещё есть (пистолетные находятся почти всегда)
        if (ammo[WEAPONS[want].ammo] < WEAPONS[want].use) {
          want = [1, 2, 0, 3].find((i) => owned[i] && ammo[WEAPONS[i].ammo] >= WEAPONS[i].use) ?? 0;
        }
        if (want !== weapon) { weapon = want; buildGun(want); sfx.play('weaponSwitch'); botSwapCd = 0.6; }
      }

      // ── огонь ──
      if (tgt && err < 0.06 && ammo[WEAPONS[weapon].ammo] >= WEAPONS[weapon].use) botFire = true;
      // ракета в упор прилетит и стрелку (самоурон ×0.35) — ждём смены ствола
      if (weapon === 3 && dist < 6) botFire = false;

      // ── пикапы: за аптечкой/патронами, но не дольше 1.5 с подряд ──
      // Иначе бот залипает на точке респауна: пикап уже забрали, а он всё стоит
      // и ждёт, — в кадре при этом не происходит ничего.
      if (botGoalCd > 0) botGoalCd -= dt;
      // Ракетница, лежащая на арене, важнее аптечки и патронов: подбор ствола
      // под огнём — тот самый кадр, ради которого волна 16 и снимается. Ходу к
      // ней даём 6 с вместо полутора — лежит она далеко, а бот идёт с боем.
      const rktLying = !owned[3] && botGoalCd <= 0
        ? pickups.find((p) => p.kind === 'launcher' && p.taken <= 0) : undefined;
      if (rktLying && botGoal !== rktLying) { botGoal = rktLying; botGoalT = 6; }
      if (botGoal) {
        botGoalT -= dt;
        if (botGoalT <= 0 || botGoal.taken > 0) { botGoal = null; botGoalCd = 3; }
      } else if (botGoalCd <= 0) {
        const w = WEAPONS[weapon];
        // потолки те же, что при подборе (ниже по кадру), с поправкой сложности
        const cap = Math.round((w.ammo === 'bul' ? 300 : w.ammo === 'shl' ? 80 : 30) * D.ammoMul);
        const kinds: Pickup['kind'][] = hp < 70 ? ['med']
          : ammo[w.ammo] < cap * 0.2
            ? (w.ammo === 'bul' ? ['bul', 'box'] : w.ammo === 'shl' ? ['shl'] : ['rkt'])
            : [];
        let bd = 1e9;
        for (const p of pickups) {
          if (p.taken > 0 || !kinds.includes(p.kind)) continue;
          const d = Math.hypot(p.x - px, p.z - pz);
          if (d < bd) { bd = d; botGoal = p; }
        }
        if (botGoal) botGoalT = 1.5;
      }
      // Ход к пикапу — в тех же осях, что и у игрока: вперёд (−sin, −cos),
      // вбок (cos, −sin). Прицел при этом остаётся на твари, как у живого.
      // Пока рядом камикадзе, отбегание важнее любого пикапа.
      if (botGoal && boomD >= 6) {
        const gx = botGoal.x - px, gz = botGoal.z - pz;
        const gl = Math.hypot(gx, gz) || 1;
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        botFwd = (-gx * sy - gz * cy) / gl;
        botStrafe = (gx * cy - gz * sy) / gl;
      }

      // намеченный путь — сверим его в следующем кадре (см. срыв обхода выше)
      botWasX = px; botWasZ = pz;
      botWantLen = botFwd || botStrafe ? SPD * dt : 0;
    };

    let prevPD = false, prevEnter = false, prevUp = false, prevDown = false, prevLR = 0;
    let menuMusicOn = false; // chill в титуле — только после жеста (autoplay-политика)

    if (qs.get('edit') === '1') enterEditor();   // отладка: сразу в редактор

    ctx.onFrame((dt) => {
      time += dt; phaseT += dt;
      if (flashT > 0) flashT -= dt;
      if (faceOw > 0) faceOw -= dt;
      kick = Math.max(0, kick - dt * 5);
      fireCd = Math.max(0, fireCd - dt);
      muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 30);

      // факелы мерцают
      for (const t of torches) {
        const f = 0.75 + 0.35 * Math.abs(Math.sin(time * 9 + t.ph)) + 0.15 * Math.sin(time * 23 + t.ph);
        t.light.intensity = 1.2 * f;
        t.flame.scale.set(0.9 + f * 0.2, f, 0.9 + f * 0.2);
      }
      // пентаграммы: пульс углей, вращение голограммы, восходящие искры
      for (const p of portals) p.update(dt, time);
      for (let i = 0; i < portalLights.length; i++) {
        const w = portals[i].power();
        portalLights[i].intensity = (0.45 + 0.35 * Math.sin(time * 2.2)) * (1 + w * 4);
        portalLights[i].distance = 7 + w * 6;
      }

      // ── тач: разбор стиков ──
      let tmx = 0, tmy = 0, tlx = 0, tly = 0;
      if (touch) {
        const L = tLayout();
        // раскладка теперь в координатах HUD, а касания приходят в пикселях экрана
        const ts = hs();
        const tX = (p: { x: number }) => p.x / ts;
        const tY = (p: { y: number }) => p.y / ts;
        for (const p of touch.started) {
          if (moveId < 0 && inCircle(tX(p), tY(p), L.moveC.x, L.moveC.y, L.r * 1.5)) moveId = p.id;
          else if (lookId < 0 && inCircle(tX(p), tY(p), L.lookC.x, L.lookC.y, L.r * 1.5)) lookId = p.id;
        }
        for (const p of touch.ended) {
          if (p.id === moveId) { moveId = -1; tMove = { x: 0, y: 0 }; }
          if (p.id === lookId) { lookId = -1; tLook = { x: 0, y: 0 }; }
        }
        tFire = false;
        for (const p of touch.active) {
          if (p.id === moveId) {
            tMove.x = Math.max(-1, Math.min(1, (tX(p) - L.moveC.x) / (L.r * 0.85)));
            tMove.y = Math.max(-1, Math.min(1, (tY(p) - L.moveC.y) / (L.r * 0.85)));
          } else if (p.id === lookId) {
            tLook.x = Math.max(-1, Math.min(1, (tX(p) - L.lookC.x) / (L.r * 0.85)));
            tLook.y = Math.max(-1, Math.min(1, (tY(p) - L.lookC.y) / (L.r * 0.85)));
          } else if (inCircle(tX(p), tY(p), L.fire.x, L.fire.y, L.fire.r * 1.3)) tFire = true;
        }
        for (const p of touch.started) {
          if (inCircle(tX(p), tY(p), L.wpn.x, L.wpn.y, L.wpn.r * 1.3)) {
            for (let i = 1; i <= 4; i++) {
              const nx = (weapon + i) % 4;
              if (owned[nx]) { weapon = nx; buildGun(nx); break; }
            }
          }
        }
        tmx = tMove.x; tmy = tMove.y; tlx = tLook.x; tly = tLook.y;
      }

      const pd = ctx.input.pointer.down;
      const pdEdge = pd && !prevPD; prevPD = pd;
      const enter = keys.has('Enter') || keys.has('NumpadEnter');
      const enterEdge = enter && !prevEnter; prevEnter = enter;
      const kUp = keys.has('ArrowUp') || keys.has('KeyW');
      const kDown = keys.has('ArrowDown') || keys.has('KeyS');
      const upEdge = kUp && !prevUp; prevUp = kUp;
      const downEdge = kDown && !prevDown; prevDown = kDown;
      const lr = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      const lrEdge = lr !== 0 && prevLR === 0 ? lr : 0; prevLR = lr;

      // ── ТИТУЛ ──
      if (phase === 'title') {
        // браузер разрешает звук только после действия пользователя
        if (!menuMusicOn && (pdEdge || keys.size > 0 || (touch && touch.started.length))) {
          menuMusicOn = true;
          music.play('chill', { fade: 1.8 });
        }
        const menu = titleMenu();
        if (titleSel >= menu.length) titleSel = 0;
        if (upEdge || downEdge) {
          titleSel = (titleSel + (downEdge ? 1 : menu.length - 1)) % menu.length;
          sfx.play('menuMove');
        }
        const selAct = menu[titleSel].act;
        if (lrEdge !== 0) {
          if (selAct === 'diff') { setDiff(diffIx + (lrEdge > 0 ? 1 : -1)); sfx.play('menuMove'); }
          else if (selAct === 'arena') { toggleArena(lrEdge > 0 ? 1 : -1); sfx.play('menuMove'); }
          // языка два — в какую сторону ни листай, получится второй
          else if (selAct === 'lang') { toggleLang(); sfx.play('menuMove'); }
        }
        const startNow = enterEdge || keys.has('Space') || (mob && pdEdge);
        if (startNow) {
          if (mob && pdEdge) {
            // тап по пункту: ближайшая строка меню
            const step = menu.length >= 5 ? 48 : 58;
            const ty = pv().y;
            let best = 0, bestD = 1e9;
            for (let i = 0; i < menu.length; i++) {
              const d = Math.abs(ty - (HH() * 0.5 + i * step));
              if (d < bestD) { bestD = d; best = i; }
            }
            titleSel = best;
          }
          sfx.play('menuSelect');
          const act = menu[titleSel].act;
          if (act === 'diff') setDiff(diffIx + 1);
          else if (act === 'arena') toggleArena();
          else if (act === 'lang') toggleLang();
          else if (act === 'edit') enterEditor();
          else {
            music.play('main', { fade: 1.4 });   // из chill в бой с наложением
            startWave();
          }
        }
        if (warpTo !== null) {
          // IDCLEV набран: прыжок сразу на выбранную волну
          sfx.play('menuSelect');
          wave = warpTo - 1;                     // startWave сделает wave++
          cheated = true;                        // прыжок по волнам — рекорд не в счёт
          warpTo = null;
          music.play('main', { fade: 1.4 });
          startWave();
        }
        // камера уезжает к диораме: в кадре только черепа и столбы искр
        menuRig.visible = true;
        gunGrp.visible = false;
        updateMenuRig(dt, time);
        cam.position.set(0, MENU_Y + 1.5, MENU_DIST);
        cam.rotation.set(0, 0, 0, 'YXZ');
        drawHud();
        touch?.endFrame();
        return;
      }

      // ── РЕДАКТОР ──
      if (phase === 'edit') {
        updateEditor(dt);
        menuRig.visible = false;
        gunGrp.visible = false;
        cam.position.set(eX, eY, eZ);
        cam.rotation.set(ePitch, eYaw, 0, 'YXZ');
        // печати и факелы живут и здесь — видно, как будет в бою
        for (const p of portals) p.update(dt, time);
        for (let i = 0; i < portalLights.length; i++) {
          portalLights[i].intensity = 0.45 + 0.35 * Math.sin(time * 2.2);
        }
        for (const t of torches) {
          const f = 0.75 + 0.35 * Math.abs(Math.sin(time * 9 + t.ph)) + 0.15 * Math.sin(time * 23 + t.ph);
          t.light.intensity = 1.2 * f;
          t.flame.scale.set(0.9 + f * 0.2, f, 0.9 + f * 0.2);
        }
        for (const p of pickups) {
          p.grp.rotation.y += dt * 1.6;
          p.grp.position.y = groundY(p.x, p.z) + 0.1 + Math.sin(time * 2.5 + p.x) * 0.12;
        }
        drawHud();
        touch?.endFrame();
        return;
      }

      // ── СМЕРТЬ: выбор кнопки ──
      if (phase === 'dead') {
        if (lrEdge < 0) endSel = 0;
        if (lrEdge > 0) endSel = 1;
        const R = btnRects();
        let go = -1;
        if (pdEdge) {
          const pt = pv();
          if (inRect(R.again, pt.x, pt.y)) go = 0;
          else if (inRect(R.menu, pt.x, pt.y)) go = 1;
        } else if (enterEdge || keys.has('Space')) go = endSel;
        if (go === 0) restart();
        if (go === 1) toTitle();
        drawHud();
        touch?.endFrame();
        return;
      }

      // автопилот выставляет виртуальный ввод ДО разбора настоящего
      if (botMode && (phase === 'wave' || phase === 'clear')) botTick(dt);

      // ── обзор ──
      const sens = 0.0022;
      yaw -= mDX * sens;
      pitch = Math.max(-0.5, Math.min(0.5, pitch - mDY * sens * 0.8));
      mDX = 0; mDY = 0;
      if (touch) {
        yaw -= tlx * 2.4 * dt;
        // стик вниз = взгляд вниз, как у мыши (раньше было наоборот)
        pitch = Math.max(-0.5, Math.min(0.5, pitch - tly * 1.4 * dt));
      }
      // классика: стрелки крутят, если мышь не захвачена
      if (!locked && !touch) {
        const turn = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
        yaw -= turn * 2.2 * dt;
      }

      // ── ход ──
      const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
      let fwd = 0, strafe = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
      if (keys.has('KeyA')) strafe -= 1;
      if (keys.has('KeyD')) strafe += 1;
      if (locked) { // при захвате мыши A/D — стрейф (уже учтено), стрелки тоже
        if (keys.has('ArrowLeft')) strafe -= 1;
        if (keys.has('ArrowRight')) strafe += 1;
      }
      if (touch) { fwd -= tmy; strafe += tmx; }
      if (botMode) { fwd += botFwd; strafe += botStrafe; }
      const len = Math.hypot(fwd, strafe) || 1;
      const mvx = (-sinY * fwd + cosY * strafe) / len * SPD;
      const mvz = (-cosY * fwd - sinY * strafe) / len * SPD;
      if (fwd || strafe) bob += dt * 9;
      [px, pz] = collide(px + mvx * dt, pz + mvz * dt, P_RADIUS);
      pY = groundY(px, pz);
      sfx.setListener(px, pz, yaw);   // позиционный звук считается от игрока

      // ── огонь ──
      if ((mouseDown && locked) || keys.has('Space') || keys.has('ControlLeft') || keys.has('ControlRight') || tFire || botFire) fire();

      // ── волны ──
      if (phase === 'wave') {
        // спавн
        if (waveBudget > 0) {
          spawnCd -= dt;
          if (spawnCd <= 0 && mons.length + pending.length < D.cap) {
            const rush = wave % 5 === 0;
            // в наплыв — почти сплошь камикадзе; на высоких сложностях они
            // подмешиваются и в обычные волны, как в сэме
            const k: MK = rush && rng() < 0.75 ? 'boom'
              : D.boomAlways && rng() < (D.key === 'core' ? 0.3 : 0.18) ? 'boom'
                : pickKind();
            const vet = wave >= D.vetFrom && rng() < Math.min(D.vetMax, 0.08 * (wave - D.vetFrom + 1));
            // печать, которая сейчас не занята другим заказом
            const free: number[] = [];
            for (let i = 0; i < SPAWNS.length; i++) if (!pending.some((q) => q.pi === i)) free.push(i);
            const pi = (free.length ? free : SPAWNS.map((_, i) => i))[Math.floor(rng() * (free.length || SPAWNS.length))];
            portals[pi].charge(SPAWN_LEAD);
            sfx.play('teleport', { x: SPAWNS[pi][0], z: SPAWNS[pi][1] });
            pending.push({ pi, k, vet, t: SPAWN_LEAD });
            waveBudget -= MDEFS[k].cost;
            spawnCd = Math.max(0.15, ((rush ? 0.4 : 0.85) - wave * 0.02) * D.rate);
          }
        } else if (mons.length === 0 && pending.length === 0) {
          score += waveScore(wave);
          sfx.play('waveClear'); sfx.play('cash');
          music.play('middle', { loop: true, fade: 0.9 });  // передышка
          phase = 'clear'; phaseT = 0;
        }
      } else if (phase === 'clear') {
        if (phaseT > D.breather) startWave();
      }

      // ── созревшие печати выпускают монстра, голограмма гаснет за секунду ──
      for (let i = pending.length - 1; i >= 0; i--) {
        const q = pending[i];
        q.t -= dt;
        if (q.t > 0) continue;
        const [sx, sz] = SPAWNS[q.pi];
        spawnMon(q.k, q.vet, sx + (rng() - 0.5) * 2, sz + (rng() - 0.5) * 2);
        portals[q.pi].release(1);
        pending.splice(i, 1);
      }

      // ── монстры ──
      /** доворот к цели с ограничением угловой скорости (без щелчков) */
      const turnTo = (cur: number, target: number, rate: number) => {
        let df = target - cur;
        while (df > Math.PI) df -= Math.PI * 2;
        while (df < -Math.PI) df += Math.PI * 2;
        const step = rate * dt;
        return cur + Math.max(-step, Math.min(step, df));
      };
      // по КОПИИ списка: камикадзе взрывается прямо в своём ходе и может забрать
      // соседей, а перебирать живой массив по индексам в этот момент нельзя
      for (const m of [...mons]) {
        if (!mons.includes(m)) continue;      // уже погиб в чужом взрыве
        const d = MDEFS[m.kind];
        m.t += dt;
        const wasX = m.x, wasZ = m.z;   // для разворота по фактическому движению
        // состояние НА НАЧАЛО кадра: срыв разгона имеет смысл проверять только
        // у того, кто в этом кадре реально пытался бежать. Иначе кадр «завод
        // кончился → разгон» обрывает сам себя: двигаться в нём ещё не двигались
        const state0 = m.state;
        if (!MDEFS[m.kind].flying) m.grp.position.y = 0;   // анимация пишет поверх, высота пола добавится в конце
        if (m.atkCd > 0) m.atkCd -= dt;
        if (m.hurtT > 0) m.hurtT -= dt;
        const dx = px - m.x, dz = pz - m.z;
        const dist = Math.hypot(dx, dz) || 1;
        const ux = dx / dist, uz = dz / dist;
        const spd = d.speed * (m.vet ? 1.15 : 1) * (1 + 0.02 * wave);

        if (m.kind === 'bull') {
          // рогач: заводится, потом таранит по прямой
          if (m.state === 'walk') {
            // Пока тикает откат сорванного тарана — уходим ВБОК. Без этого бык
            // бесконечно заводится напротив того же пилона: разгон срывается о
            // него в первом же кадре, шаг заводит снова, и на дорогу остаются
            // считаные проценты времени (замер в Godot-порте: 23 с заводки из 30).
            const side = m.atkCd > 0 ? m.dodge * 1.2 : 0;
            m.x += (ux + -uz * side) * spd * 0.35 * dt;
            m.z += (uz + ux * side) * spd * 0.35 * dt;
            if (dist < 18 && m.atkCd <= 0) { m.state = 'wind'; m.windT = 0.7; m.vx = ux; m.vz = uz; }
          } else if (m.state === 'wind') {
            m.windT -= dt;
            m.grp.position.y = Math.abs(Math.sin(m.t * 20)) * 0.12;
            if (m.windT <= 0) m.state = 'charge';
          } else {
            m.x += m.vx * spd * dt; m.z += m.vz * spd * dt;
            if (Math.abs(m.x) > ARENA - 2 || Math.abs(m.z) > ARENA - 2) m.state = 'walk';
          }
        } else if (m.kind === 'kleer') {
          // скакун: сближается → приседает (телеграф) → ПРЫГАЕТ ПО ПРЯМОЙ,
          // пролетая мимо/сквозь по инерции → приземляется и разворачивается.
          // Урон только в прыжке и только один раз — есть окно уклониться.
          if (m.state === 'walk') {
            const wob = Math.sin(m.t * 5 + m.ph) * 0.35;
            m.x += (ux + -uz * wob) * spd * 0.62 * dt;
            m.z += (uz + ux * wob) * spd * 0.62 * dt;
            m.grp.position.y = Math.abs(Math.sin(m.t * 9)) * 0.22;
            if (dist < 9 && m.atkCd <= 0) {
              m.state = 'wind'; m.windT = 0.42;
              m.vx = ux; m.vz = uz;           // направление фиксируется ЗАРАНЕЕ
            }
          } else if (m.state === 'wind') {
            m.windT -= dt;
            m.vx = ux; m.vz = uz;             // ещё доводится, но уже присел
            m.grp.position.y = -0.18;         // приседание — видимый телеграф
            m.grp.scale.set(1.15, 0.8, 1.15);
            if (m.windT <= 0) {
              m.state = 'leap'; m.leapT = 0.75; m.hitThisLeap = false;
              sfx.play('kleerLeap', { x: m.x, z: m.z });
              m.grp.scale.set(1, 1, 1);
            }
          } else if (m.state === 'leap') {
            m.leapT -= dt;
            m.x += m.vx * spd * 2.1 * dt;      // летит ПО ПРЯМОЙ, не доводится
            m.z += m.vz * spd * 2.1 * dt;
            const k = 1 - Math.max(0, m.leapT) / 0.75;
            m.grp.position.y = Math.sin(k * Math.PI) * 1.15;  // дуга прыжка
            m.grp.scale.set(0.9, 1.2, 0.9);
            if (m.leapT <= 0 || Math.abs(m.x) > ARENA - 2 || Math.abs(m.z) > ARENA - 2) {
              m.state = 'recover'; m.windT = 0.85; m.atkCd = 1.1;
              m.grp.scale.set(1, 1, 1); m.grp.position.y = 0;
            }
          } else { // recover: приземлился, тормозит и разворачивается — окно для выстрела
            m.windT -= dt;
            m.x += m.vx * spd * 0.5 * Math.max(0, m.windT) * dt;
            m.z += m.vz * spd * 0.5 * Math.max(0, m.windT) * dt;
            m.grp.position.y = Math.abs(Math.sin(m.t * 14)) * 0.06;
            if (m.windT <= 0) m.state = 'walk';
          }
        } else if (m.kind === 'harpy') {
          // гарпия: летит синусоидой, пикирует вблизи
          m.x += ux * spd * dt; m.z += uz * spd * dt;
          m.y = dist < 6 ? Math.max(1.1, 2.4 - (6 - dist) * 0.3) : 2.2 + Math.sin(m.t * 2.2 + m.ph) * 0.7;
          for (const p of m.parts) {
            if (p.userData.wing) p.rotation.z = p.userData.wing * Math.sin(m.t * 14) * 0.6;
          }
        } else if (m.kind === 'mech') {
          // механоид: держит дистанцию, плюётся файерболами
          const covered = losBlocked(m.x, m.z, px, pz);
          if (covered) {
            // за пилоном стрелять нечем — заходит вбок, чтобы открыть линию.
            // Сторона обхода своя у каждого (по ph), иначе они ходят строем.
            const sideDir = m.ph > 3.14 ? 1 : -1;
            m.x += (-uz * sideDir * 1.35 + ux * 0.35) * spd * dt;
            m.z += (ux * sideDir * 1.35 + uz * 0.35) * spd * dt;
          } else if (dist > 14) { m.x += ux * spd * dt; m.z += uz * spd * dt; }
          else if (dist < 8) { m.x -= ux * spd * 0.6 * dt; m.z -= uz * spd * 0.6 * dt; }
          if (!covered && m.atkCd <= 0 && dist < 24) {
            m.atkCd = (2.4 - Math.min(1.2, wave * 0.05)) * D.atk;
            sfx.play('fireball', { x: m.x, z: m.z });
            for (const sx of [-0.72, 0.72]) {
              const mi = ballMeshes.findIndex((q) => !q.visible);
              if (mi < 0) break;                       // пул выбран — залп короче, но без просадки
              const li = ballLights.findIndex((q) => q.intensity === 0);
              const ox = sx * -uz, oz = sx * ux;
              ballMeshes[mi].position.set(m.x + ox, m.y + 1.7, m.z + oz);
              ballMeshes[mi].visible = true;
              if (li >= 0) {
                ballLights[li].position.set(m.x + ox, m.y + 1.7, m.z + oz);
                ballLights[li].intensity = 2.2;
              }
              balls.push({ mi, li, x: m.x + ox, y: m.y + 1.7, z: m.z + oz, vx: ux * 13, vz: uz * 13, life: 3.4 });
            }
          }
        } else {
          // гнар / бомбист: прямо на игрока
          m.x += ux * spd * dt; m.z += uz * spd * dt;
          if (m.kind === 'gnaar') m.grp.position.y = Math.abs(Math.sin(m.t * 5)) * 0.12;
          else m.grp.position.y = Math.abs(Math.sin(m.t * 11)) * 0.18; // бомбист трясётся
        }

        if (!d.flying) {
          // в горку по ступенькам лезется медленнее — как и просилось
          const wasG = groundY(wasX, wasZ);
          const nowG = groundY(m.x, m.z);
          if (nowG > wasG + 0.02) {
            m.x = wasX + (m.x - wasX) * 0.72;
            m.z = wasZ + (m.z - wasZ) * 0.72;
          }
          const preX = m.x, preZ = m.z;
          [m.x, m.z] = collide(m.x, m.z, d.radius);
          // ОБХОД ПРЕПЯТСТВИЯ. Выталкивание из структуры симметрично: тварь,
          // пришедшая в пилон в лоб, упирается и стоит в него насмерть (замер в
          // Godot-порте: гнар не доходил до бойца за 30 с, даже когда тот ходил
          // вбок). Сторона обхода выбирается ОДИН РАЗ на 1.2 с и своя у каждого
          // (по ph): если пересчитывать её каждый кадр, тварь колеблется у
          // пилона и доезжает ещё хуже — это тоже проверено замером.
          // Разгон и прыжок не трогаем: там заморожено направление и свой срыв.
          if (m.state !== 'charge' && m.state !== 'leap') {
            const pushX = m.x - preX, pushZ = m.z - preZ;
            const push = Math.hypot(pushX, pushZ);
            if (push > spd * dt * 0.3 && m.skirtT <= 0) {
              m.skirtT = 1.2;
              m.skirtNx = pushX / push; m.skirtNz = pushZ / push;
            }
            if (m.skirtT > 0) {
              m.skirtT -= dt;
              const sgn = m.ph > Math.PI ? 1 : -1;
              const tx = -m.skirtNz * sgn, tz = m.skirtNx * sgn;
              [m.x, m.z] = collide(m.x + tx * spd * dt * 0.8, m.z + tz * spd * dt * 0.8, d.radius);
            }
          }
          // Таран/прыжок В СТЕНУ: направление у них заморожено, скользить
          // вдоль препятствия они не могут — без этой проверки рогач вечно
          // стоит, упёршись в фасад (арена-гейт), т.к. до края арены не доехал
          if (m.kind === 'bull' && m.state === 'charge' && state0 === 'charge') {
            const moved = Math.hypot(m.x - wasX, m.z - wasZ);
            if (moved < spd * dt * 0.4) {
              m.state = 'walk';
              m.atkCd = 1.2;                            // столько идём в обход, не заводясь
              m.dodge = m.ph > Math.PI ? 1 : -1;        // сторона своя у каждого — не строем
            }
          } else if (m.kind === 'kleer' && m.state === 'leap' && state0 === 'leap') {
            const moved = Math.hypot(m.x - wasX, m.z - wasZ);
            if (moved < spd * dt * 0.5) {
              m.state = 'recover'; m.windT = 0.85; m.atkCd = 1.1;
              m.grp.scale.set(1, 1, 1);
              m.grp.position.y = 0;
            }
          }
        } else {
          const lim = ARENA - 1 - d.radius;
          m.x = Math.max(-lim, Math.min(lim, m.x));
          m.z = Math.max(-lim, Math.min(lim, m.z));
        }

        m.grp.position.x = m.x;
        m.grp.position.z = m.z;
        m.wail?.move(m.x, m.z);
        if (d.flying) m.grp.position.y = m.y;
        else {
          // наземный: высота пола (платформы) поверх анимационных сдвигов
          m.y = groundY(m.x, m.z);
          m.grp.position.y += m.y;
        }

        // ── куда монстр смотрит ──
        // Думовское «всегда лицом к игроку» оставляем только там, где монстр
        // сам себя ведёт. Если его несёт по инерции — рогач протаранил мимо,
        // скакун летит в прыжке, — он развёрнут туда, куда летит, а не к цели.
        // Исключение — стрелок: он пятится, но держит игрока на прицеле,
        // иначе механоид палил бы файерболами себе за спину.
        const toPlayer = Math.atan2(-ux, -uz);
        const mvx = m.x - wasX, mvz = m.z - wasZ;
        const mvSpd = Math.hypot(mvx, mvz) / Math.max(dt, 1e-4);
        const target = !d.ranged && mvSpd > 0.8 ? Math.atan2(-mvx, -mvz) : toPlayer;
        m.grp.rotation.y = turnTo(m.grp.rotation.y, target, 10);
        // мигание при попадании: раньше перекрашивались все кубы, теперь
        // одна униформа на слитый меш — вид тот же, работы на порядок меньше
        m.setFlash(m.hurtT > 0);

        // атака
        const touchDist = d.radius + P_RADIUS + 0.35;
        if (dist < touchDist) {
          if (m.kind === 'boom') {
            hurt((d.explode ?? 20) * (m.vet ? 1.4 : 1) * D.dmg);   // бойцу — полный
            killMon(m, false);                                     // внутри рванёт по своим
            continue;
          }
          if (m.kind === 'kleer') {
            // задевает ТОЛЬКО в прыжке и только раз за прыжок — потом пролетает насквозь
            if (m.state === 'leap' && !m.hitThisLeap) {
              m.hitThisLeap = true;
              hurt(d.melee * (m.vet ? 1.35 : 1) * D.dmg);
            }
          } else if (m.atkCd <= 0) {
            m.atkCd = (m.kind === 'bull' ? 1.4 : 0.75) * D.atk;
            hurt(d.melee * (m.vet ? 1.35 : 1) * D.dmg);
            const kb = m.kind === 'bull' ? 0.85 : 0.3;
            [px, pz] = collide(px + ux * kb, pz + uz * kb, P_RADIUS);   // откидывает игрока
            m.x -= ux * 0.5; m.z -= uz * 0.5;                            // и сам отшатывается
            if (m.kind === 'bull') m.state = 'walk';
          }
        }
      }

      // Разведение тварей — ОТДЕЛЬНЫМ проходом, после хода всех. Внутри цикла
      // толчок соседа попадал в замер пройденного пути, и толпа ложно срывала
      // разгон рогача: он почти не бегал. Тут же замер видит только собственный
      // ход твари, а срыв остаётся честным признаком «упёрся в структуру».
      for (const m of mons) {
        for (const o of mons) {
          if (o === m || o.kind === 'harpy' !== (m.kind === 'harpy')) continue;
          const ox = m.x - o.x, oz = m.z - o.z;
          const dd = Math.hypot(ox, oz);
          const need = MDEFS[m.kind].radius + MDEFS[o.kind].radius;
          if (dd > 0.01 && dd < need) {
            m.x += (ox / dd) * (need - dd) * 0.5;
            m.z += (oz / dd) * (need - dd) * 0.5;
          }
        }
      }

      tickWails(dt);

      // ── ракеты игрока ──
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.life -= dt;
        r.x += r.vx * dt; r.z += r.vz * dt;
        const rm = rktMeshes[r.mi];
        rm.position.set(r.x, r.y, r.z);
        if (r.li >= 0) rktLights[r.li].position.set(r.x, r.y, r.z);
        if (rng() < dt * 40) puff(r.x, r.y, r.z, 0xff9040, 0.22);       // дымный след

        // попадание: тварь, пилон, стена или конец жизни
        let hitMon: Mon | null = null;
        for (const m of mons) {
          const mr = MDEFS[m.kind].radius + 0.35;
          if (Math.hypot(m.x - r.x, m.z - r.z) < mr && Math.abs((m.y + 0.9) - r.y) < 1.6) { hitMon = m; break; }
        }
        const hitWall = inPillar(r.x, r.z, 0.2) || Math.abs(r.x) > ARENA || Math.abs(r.z) > ARENA;
        if (hitMon || hitWall || r.life <= 0) {
          rocketBlast(r.x, r.y, r.z, hitMon ?? undefined);
          rm.visible = false;
          if (r.li >= 0) rktLights[r.li].intensity = 0;
          rockets.splice(i, 1);
        }
      }

      // ── файерболы ──
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        b.life -= dt;
        b.x += b.vx * dt; b.z += b.vz * dt;
        const bmesh = ballMeshes[b.mi];
        bmesh.position.set(b.x, b.y, b.z);
        bmesh.rotation.x += dt * 6; bmesh.rotation.y += dt * 5;
        if (b.li >= 0) ballLights[b.li].position.set(b.x, b.y, b.z);
        if (rng() < dt * 20) puff(b.x, b.y, b.z, 0xff7020, 0.25);
        const hitP = Math.hypot(b.x - px, b.z - pz) < P_RADIUS + 0.4 && Math.abs(b.y - (EYE + pY)) < 1.6;
        // пилон высотой 5 м — файербол летит на 1.7 м, значит гасится о него
        const hitWall = inPillar(b.x, b.z, 0.22) || Math.abs(b.x) > ARENA || Math.abs(b.z) > ARENA;
        if (hitP || hitWall || b.life <= 0) {
          if (hitP) { sfx.play('fireballHit', { x: b.x, z: b.z }); hurt(13 * D.dmg); for (let q = 0; q < 8; q++) puff(b.x, b.y, b.z, 0xff8030, 0.35); }
          else if (hitWall) {
            sfx.play('fireballHit', { x: b.x, z: b.z });
            for (let q = 0; q < 6; q++) puff(b.x, b.y + (rng() - 0.5) * 0.5, b.z, 0xff8030, 0.3);
          }
          bmesh.visible = false;
          if (b.li >= 0) ballLights[b.li].intensity = 0;
          balls.splice(i, 1);
        }
      }

      // ── пикапы ──
      for (const p of pickups) {
        if (p.taken > 0) {
          p.taken -= dt;
          if (p.taken <= 0) { p.grp.visible = true; }
          continue;
        }
        p.grp.rotation.y += dt * (p.kind === 'launcher' ? 0.9 : 1.6);
        const pgY = groundY(p.x, p.z);
        p.grp.position.y = pgY + (p.kind === 'launcher'
          ? 0.75 + Math.sin(time * 1.7) * 0.22          // ствол парит заметно выше
          : 0.1 + Math.sin(time * 2.5 + p.x) * 0.12);
        if (p.kind === 'launcher') {
          // столб искр снизу вверх — чтобы находилась через всю арену
          if (rng() < dt * 26) {
            const a = rng() * Math.PI * 2, rr = 0.3 + rng() * 0.6;
            puff(p.x + Math.cos(a) * rr, 0.1 + rng() * 0.3, p.z + Math.sin(a) * rr, 0xffb060, 0.55);
          }
          launcherLight.position.set(p.x, p.grp.position.y + 0.4, p.z);
          launcherLight.intensity = 2.4 + 0.9 * Math.sin(time * 3.1);
        }
        if (Math.hypot(p.x - px, p.z - pz) < 1.2) {
          let got = false;
          const capB = Math.round(300 * D.ammoMul), capS = Math.round(80 * D.ammoMul), capR = Math.round(30 * D.ammoMul);
          const heal = (v: number) => Math.max(1, Math.round(v * D.heal));
          const more = (v: number) => Math.round(v * D.ammoMul);
          if (p.kind === 'med' && hp < 100) { hp = Math.min(100, hp + heal(25)); got = true; }
          if (p.kind === 'arm' && armor < 100) { armor = Math.min(100, armor + heal(35)); got = true; }
          if (p.kind === 'bul' && ammo.bul < capB) { ammo.bul = Math.min(capB, ammo.bul + more(40)); got = true; }
          if (p.kind === 'box' && ammo.bul < capB) { ammo.bul = Math.min(capB, ammo.bul + more(110)); got = true; }
          if (p.kind === 'shl' && ammo.shl < capS) { ammo.shl = Math.min(capS, ammo.shl + more(12)); got = true; }
          if (p.kind === 'rkt' && ammo.rkt < capR) { ammo.rkt = Math.min(capR, ammo.rkt + more(5)); got = true; }
          if (p.kind === 'launcher' && !owned[3]) {
            owned[3] = true; weapon = 3; buildGun(3);
            ammo.rkt = Math.max(ammo.rkt, 10);
            launcherMsg = 3.5; got = true;
            launcherLight.intensity = 0;
          }
          if (got) {
            // ствол подбирается насовсем, боеприпасы возвращаются через 14 с
            p.taken = p.kind === 'launcher' ? 1e9 : D.respawn;
            p.grp.visible = false;
            sfx.play(
              p.kind === 'launcher' ? 'pickWeapon'
                : p.kind === 'med' ? 'pickHealth'
                  : p.kind === 'arm' ? 'pickArmor' : 'pickAmmo',
              { x: p.x, z: p.z },
            );
            flashT = 0.18; flashCol = 1;
            for (let q = 0; q < 5; q++) puff(p.x, 0.6, p.z, 0xffe090, 0.3);
          }
        }
      }

      // ── гибы ──
      for (let i = gibs.length - 1; i >= 0; i--) {
        const gb = gibs[i];
        gb.life -= dt;
        gb.vy -= 17 * dt;
        gb.x += gb.vx * dt; gb.y += gb.vy * dt; gb.z += gb.vz * dt;
        if (gb.y < 0.08) { gb.y = 0.08; gb.vy *= -0.34; gb.vx *= 0.7; gb.vz *= 0.7; }
        gb.rotX += gb.rx * dt; gb.rotZ += gb.rz * dt;
        if (gb.life <= 0) gibs.splice(i, 1);
      }
      for (let i = 0; i < gibs.length; i++) {
        const gb = gibs[i];
        instDummy.position.set(gb.x, gb.y, gb.z);
        instDummy.rotation.set(gb.rotX, 0, gb.rotZ);
        instDummy.scale.setScalar(gb.s);
        instDummy.updateMatrix();
        gibMesh.setMatrixAt(i, instDummy.matrix);
        gibMesh.setColorAt(i, instCol.setHex(gb.col));
      }
      gibMesh.count = gibs.length;
      gibMesh.instanceMatrix.needsUpdate = true;
      if (gibMesh.instanceColor) gibMesh.instanceColor.needsUpdate = true;

      // ── частицы ──
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life += dt;
        if (p.life / p.max >= 1) { puffs.splice(i, 1); continue; }
        p.y += p.vy * dt;
      }
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        const k = p.life / p.max;
        dust.put(i, p.x, p.y, p.z, 1 + k * 1.8, instCol.setHex(p.col), 0.85 * (1 - k));   // раздувается, как и раньше
      }
      dust.commit(puffs.length);

      if (launcherMsg > 0) launcherMsg -= dt;


      // ── лицо: зыркает по сторонам ──
      faceLookT -= dt;
      if (faceLookT <= 0) { faceLook = Math.round(rng() * 2 - 1); faceLookT = 0.6 + rng() * 1.2; }

      // ── камера + покачивание + оружие ──
      if (menuRig.visible) {
        menuRig.visible = false; gunGrp.visible = true;
        for (const e of menuEyes) e.intensity = 0;
        menuKey.intensity = 0;
      }
      const bobY = Math.sin(bob) * 0.055;
      const bobX = Math.cos(bob * 0.5) * 0.035;
      cam.position.set(px + bobX * 0.4, EYE + pY + bobY, pz);
      cam.rotation.set(pitch, yaw, 0, 'YXZ');
      playerLamp.position.set(px, EYE + pY + 0.4, pz);
      gunGrp.position.set(bobX, bobY * 0.6 - kick * 0.12, kick * 0.18);
      gunGrp.rotation.set(kick * 0.22, 0, 0);

      drawHud();
      touch?.endFrame();
    });
  },
};
