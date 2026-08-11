import * as THREE from 'three';
import type { MiniGameOpts } from '../core/types';
import { makeRng } from '../core/rng';
import { box, type MiniGame3D, type MiniGame3DContext } from '../core/three3d';
import { isTouchDevice, createMultiTouch, inCircle, drawButton, fitFont } from '../core/mobile';
import { createPentagram, createEmberCloud, createDustCloud, buildMonster, buildWeapon, buildPickup, buildProp, buildRocket, bakeStatic, ROCKET, type Pentagram } from './doomModels';
import { createDoomAudio, type SfxId, type SfxLoop } from '../core/audioDoom';
import { createMusicDirector } from '../core/musicDirector';

/**
 * Фриланс — плейтест шутера. ОРИГИНАЛЬНЫЙ воксельный оммаж: интерфейс и повадки —
 * ретро-шутер 1993-го (титул на красно-чёрном, статус-бар с ЛИЦОМ, автоприцел по
 * вертикали, вспышки урона), роспись монстров и режим — «выживание против волн».
 * Всё нарисовано своими кубами, ни одного чужого ассета или строки чужого кода.
 *
 * Герой VoxEvasion не воюет — он ПЛЕЙТЕСТИТ шутер за деньги (как «Удалёнка»):
 * один просторный уровень, волны валят со всех сторон, за волну платят по
 * арифметической прогрессии, смерть → «Вывести деньги / Работать ещё».
 *
 * Монстры (6 типов × 2 ранга): Гнар, Безголовый бомбист, Костяной скакун,
 * Рогач, Гарпия, Механоид. Каждая 5-я волна — наплыв бомбистов.
 * Оружие: пистолет → дробовик (в.3) → пулемёт (в.6), цифры 1/2/3.
 *
 * Управление: мышь+WASD (клик — захват мыши) ИЛИ классика ←→ поворот, ↑↓ ход,
 * Ctrl/Space — огонь. Тач: левый стик — ход, правый — обзор, кнопка — огонь.
 */
const ARENA = 26;          // полуразмер арены
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
  key: 'norm' | 'hard' | 'core';
  name: string; hint: string; col: string;
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
  reward: number;     // множитель гонорара
  boomAlways: boolean; // камикадзе подмешиваются в каждую волну, не только в наплывы
}
const DIFFS: Diff[] = [
  {
    key: 'norm', name: 'ЗВИЧАЙНА', hint: 'як задумано', col: '#7bd88f',
    dmg: 1, heal: 1, budget: 1, cap: 26, rate: 1, vetFrom: 4, vetMax: 0.5,
    atk: 1, ammoMul: 1, respawn: 14, breather: 4, reward: 1, boomAlways: false,
  },
  {
    key: 'hard', name: 'ВАЖКА', hint: 'бьют больнее, аптечки скупее', col: '#e8c840',
    dmg: 1.5, heal: 0.6, budget: 1.3, cap: 32, rate: 0.85, vetFrom: 2, vetMax: 0.65,
    atk: 0.8, ammoMul: 1, respawn: 12, breather: 3.5, reward: 1.35, boomAlways: true,
  },
  {
    key: 'core', name: 'ХАРДКОР', hint: 'месиво · патронов больше, времени нет', col: '#ff4a2a',
    dmg: 2, heal: 0.45, budget: 1.85, cap: 44, rate: 0.55, vetFrom: 1, vetMax: 0.8,
    atk: 0.6, ammoMul: 1.6, respawn: 8, breather: 2, reward: 1.9, boomAlways: true,
  },
];

const BASE_REWARD = 60;
const STEP_REWARD = 40;

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
  /** непрерывный вой (камикадзе) — гаснет вместе с монстром */
  wail?: SfxLoop;
}
interface Gib { x: number; y: number; z: number; vx: number; vy: number; vz: number; rotX: number; rotZ: number; rx: number; rz: number; s: number; col: number; life: number }
interface Ball { mi: number; li: number; x: number; y: number; z: number; vx: number; vz: number; life: number }
interface Pickup { grp: THREE.Group; kind: 'med' | 'arm' | 'bul' | 'box' | 'shl' | 'rkt' | 'launcher'; x: number; z: number; taken: number }
interface Puff { x: number; y: number; z: number; vy: number; life: number; max: number; col: number }

const WEAPONS = [
  { name: 'ПИСТОЛЕТ', dmg: 15, cd: 0.36, spread: 0.02, pellets: 1, ammo: 'bul' as const, use: 1 },
  { name: 'ДРОБОВИК', dmg: 10, cd: 0.82, spread: 0.13, pellets: 7, ammo: 'shl' as const, use: 1 },
  { name: 'ПУЛЕМЁТ', dmg: 11, cd: 0.09, spread: 0.055, pellets: 1, ammo: 'bul' as const, use: 1 },
  { name: 'РАКЕТНИЦА', dmg: 60, cd: 0.95, spread: 0, pellets: 1, ammo: 'rkt' as const, use: 1 },
];
/** волна, на которой ракетница появляется на арене (после зачистки 15-й) */
const RKT_WAVE = 16;

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

    cam.fov = 78; cam.near = 0.1; cam.far = 220; cam.updateProjectionMatrix();

    // ── АД: красное небо, туман, пол-шахматка, стены, лава, пилоны, факелы ──
    ctx.scene.background = new THREE.Color(0x2a0a08);
    ctx.scene.fog = new THREE.Fog(0x300c08, 22, 80);

    // всё неподвижное копится здесь и в конце сливается в ОДИН меш:
    // пол (169 плиток), стены с отбойниками, пилоны, кронштейны факелов —
    // было ~200 вызовов отрисовки, станет один (замер: insttest.html)
    const staticG = new THREE.Group();
    const TS = 4;
    for (let ix = -ARENA / TS; ix < ARENA / TS; ix++) {
      for (let iz = -ARENA / TS; iz < ARENA / TS; iz++) {
        const t = box(TS - 0.06, 0.3, TS - 0.06, (ix + iz) % 2 ? C_FLOOR_A : C_FLOOR_B);
        t.position.set(ix * TS + TS / 2, -0.15, iz * TS + TS / 2);
        staticG.add(t);
      }
    }
    // лава за стенами (виден край мира) — светится, в статику не сливается
    for (const [lx, lz, lw, ld] of [
      [0, -ARENA - 9, ARENA * 2 + 26, 18], [0, ARENA + 9, ARENA * 2 + 26, 18],
      [-ARENA - 9, 0, 18, ARENA * 2 + 2], [ARENA + 9, 0, 18, ARENA * 2 + 2],
    ] as const) {
      const lava = new THREE.Mesh(
        new THREE.BoxGeometry(lw, 0.3, ld),
        new THREE.MeshStandardMaterial({ color: C_LAVA, emissive: 0xff5a1e, emissiveIntensity: 0.9, roughness: 1 }),
      );
      lava.position.set(lx, -0.9, lz);
      ctx.scene.add(lava);
    }
    // стены с отбойником
    for (const [wx, wz, ww, wd] of [
      [0, -ARENA, ARENA * 2 + 2, 1], [0, ARENA, ARENA * 2 + 2, 1],
      [-ARENA, 0, 1, ARENA * 2 + 2], [ARENA, 0, 1, ARENA * 2 + 2],
    ] as const) {
      const w = box(ww, WALL_H, wd, C_WALL);
      w.position.set(wx, WALL_H / 2, wz);
      staticG.add(w);
      const trim = box(ww + 0.1, 0.5, wd + 0.1, C_WALL_TRIM);
      trim.position.set(wx, 1.1, wz);
      staticG.add(trim);
      const top = box(ww + 0.3, 0.6, wd + 0.3, C_WALL_TRIM);
      top.position.set(wx, WALL_H, wz);
      staticG.add(top);
    }
    // пилоны-укрытия
    interface Pillar { x: number; z: number; r: number }
    const pillars: Pillar[] = [
      { x: -11, z: -11, r: 1.6 }, { x: 11, z: -11, r: 1.6 },
      { x: -11, z: 11, r: 1.6 }, { x: 11, z: 11, r: 1.6 },
      { x: 0, z: 0, r: 2.2 },
    ];
    for (const p of pillars) {
      const col = box(p.r * 2, 5, p.r * 2, C_PILLAR);
      col.position.set(p.x, 2.5, p.z);
      staticG.add(col);
      const cap = box(p.r * 2 + 0.5, 0.5, p.r * 2 + 0.5, C_WALL_TRIM);
      cap.position.set(p.x, 5.2, p.z);
      staticG.add(cap);
      const base = box(p.r * 2 + 0.6, 0.4, p.r * 2 + 0.6, C_WALL_TRIM);
      base.position.set(p.x, 0.2, p.z);
      staticG.add(base);
      // «череп» на центральном пилоне — узнаваемая деталь.
      // Модель общая с меню и витриной: одна правка — везде одинаково.
      if (p.r > 2) {
        const skull = bakeStatic(buildProp('skull'));   // ~25 мешей → 1 + угли
        skull.scale.setScalar(1.25);
        skull.position.set(0, 2.5, p.z - p.r - 0.15);
        ctx.scene.add(skull);
      }
    }
    // факелы по стенам (мерцающий свет)
    interface Torch { light: THREE.PointLight; flame: THREE.Mesh; ph: number }
    const torches: Torch[] = [];
    const TP: [number, number][] = [
      [-ARENA + 1, -14], [-ARENA + 1, 0], [-ARENA + 1, 14],
      [ARENA - 1, -14], [ARENA - 1, 0], [ARENA - 1, 14],
      [-14, -ARENA + 1], [14, -ARENA + 1], [-14, ARENA - 1], [14, ARENA - 1],
    ];
    for (const [tx, tz] of TP) {
      const bracket = box(0.3, 0.9, 0.3, 0x2a2220);
      bracket.position.set(tx, 3.0, tz);
      staticG.add(bracket);
      const flame = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.7, 0.45),
        new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a20, emissiveIntensity: 1.6, roughness: 1 }),
      );
      flame.position.set(tx, 3.7, tz);
      ctx.scene.add(flame);
      const light = new THREE.PointLight(0xff8a3a, 1.5, 18, 1.6);
      light.position.set(tx, 3.9, tz);
      ctx.scene.add(light);
      torches.push({ light, flame, ph: rng() * 6.28 });
    }
    ctx.scene.add(bakeStatic(staticG));   // вся неподвижная арена — один вызов отрисовки

    // порталы спавна
    const SPAWNS: [number, number][] = [
      [0, -ARENA + 4], [0, ARENA - 4], [-ARENA + 4, 0], [ARENA - 4, 0],
      [-17, -17], [17, -17], [-17, 17], [17, 17],
    ];
    // ПЕНТАГРАММЫ вместо синих площадок: рунная печать + красное свечение
    const portals: Pentagram[] = [];
    const portalLights: THREE.PointLight[] = [];
    for (const [spx, spz] of SPAWNS) {
      const pent = createPentagram(1.75);
      pent.grp.position.set(spx, 0, spz);
      pent.grp.rotation.y = rng() * Math.PI * 2;
      ctx.scene.add(pent.grp);
      portals.push(pent);
      const pl = new THREE.PointLight(0xff2a10, 0.6, 7, 1.8);
      pl.position.set(spx, 0.5, spz);
      ctx.scene.add(pl);
      portalLights.push(pl);
    }

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
        if (Array.isArray(mt)) for (const x of mt) x.dispose();
        else mt?.dispose();
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
    let px = 0, pz = 14, yaw = 0, pitch = 0;
    let hp = 100, armor = 0;
    const ammo = { bul: 60, shl: 0, rkt: 0 };
    let fireCd = 0, bob = 0, kick = 0, flashT = 0, flashCol = 0;
    // отладка: ?wave=20 стартует сразу с двадцатой, ?perf=1 включает счётчик
    const qs = new URLSearchParams(location.search);
    const startWaveAt = Math.max(1, Math.min(99, Number(qs.get('wave')) || 1));
    let showPerf = qs.get('perf') === '1';
    // startWave() делает wave++, поэтому держим на единицу меньше
    let wave = startWaveAt - 1, money = 0, kills = 0, totalKills = 0;
    type Phase = 'title' | 'wave' | 'clear' | 'dead';
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
    const setDiff = (ix: number) => {
      diffIx = (ix + DIFFS.length) % DIFFS.length;
      D = DIFFS[diffIx];
      try { localStorage.setItem('fw_diff', D.key); } catch { /* приватный режим */ }
    };
    let faceLook = 0, faceLookT = 0, faceOw = 0;
    let launcherMsg = 0;       // сколько ещё секунд показывать подсказку о ракетнице
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
      };
      grp.position.set(sx, m.y, sz);
      grp.rotation.y = Math.atan2(-(px - sx), -(pz - sz));   // из печати — уже лицом к цели
      mons.push(m);
      alive++;
      // вспышка телепорта: гул портала уже отыграл при зарядке печати,
      // здесь монстр подаёт голос — сразу слышно, кто и с какой стороны вылез
      if (k === 'boom') m.wail = sfx.loop('boomWail', { x: sx, z: sz });
      else sfx.play(VOICE[k], { x: sx, z: sz });
      for (let i = 0; i < 8; i++) puff(sx + (rng() - 0.5), 0.5 + rng() * 1.5, sz + (rng() - 0.5), 0xb060ff, 0.5);
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

    // ── пикапы ──
    const mkPickup = (kind: Pickup['kind'], x: number, z: number) => {
      const grp = buildPickup(kind);
      grp.position.set(x, 0, z);
      ctx.scene.add(grp);
      pickups.push({ grp, kind, x, z, taken: 0 });
    };
    const resetPickups = () => {
      for (const p of pickups) ctx.scene.remove(p.grp);
      pickups.length = 0;
      mkPickup('med', -18, -6); mkPickup('med', 18, 6);
      mkPickup('arm', 0, -19); mkPickup('arm', 0, 19);
      // С 16-й волны три обоймы из четырёх меняются на ракеты: пистолет к этому
      // моменту мёртв, но одну оставляем — из «bul» кормится ещё и пулемёт.
      const rkt = wave >= RKT_WAVE;
      mkPickup(rkt ? 'rkt' : 'bul', -6, -18);
      mkPickup(rkt ? 'rkt' : 'bul', 6, 18);
      mkPickup(rkt ? 'rkt' : 'bul', -19, 12);
      mkPickup('bul', 19, -3);
      mkPickup('box', -21, -21); mkPickup('box', 21, 21);   // ящики для пулемёта
      mkPickup('shl', 19, -12); mkPickup('shl', -12, 4);
      mkPickup('shl', 4, -21); mkPickup('med', 12, -4);
    };
    resetPickups();

    // ── ввод: мышь+WASD, классика, тач ──
    const touch = mob ? createMultiTouch() : null;
    const sfx = createDoomAudio();
    const music = createMusicDirector(0.5);
    const keys = new Set<string>();
    let mDX = 0, mDY = 0, mouseDown = false, locked = false;
    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === 'F3') { showPerf = !showPerf; e.preventDefault(); }
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
    const onMouseDown = () => {
      mouseDown = true;
      if (!mob && !locked && phase !== 'title' && phase !== 'dead') {
        const el = document.querySelector('.mg-overlay canvas') as HTMLCanvasElement | null;
        void el?.requestPointerLock?.();
      }
    };
    const onMouseUp = () => { mouseDown = false; };
    const onLockChange = () => { locked = !!document.pointerLockElement; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onLockChange);
    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
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
      const W = ctx.width, H = ctx.height;
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
          rktMeshes[mi].position.set(sx, EYE - 0.15, sz);
          rktMeshes[mi].rotation.set(0, yaw, 0);
          rktMeshes[mi].visible = true;
          if (li >= 0) { rktLights[li].position.set(sx, EYE - 0.15, sz); rktLights[li].intensity = 2.6; }
          rockets.push({ mi, li, x: sx, y: EYE - 0.15, z: sz, vx: rx * ROCKET.speed, vz: rz * ROCKET.speed, life: ROCKET.life });
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
            gibify(best);
            mons.splice(mons.indexOf(best), 1);
            alive--; kills++; totalKills++;
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
      for (let q = 0; q < 20; q++) {
        puff(bx + (rng() - 0.5) * 2.4, by + (rng() - 0.5) * 1.8, bz + (rng() - 0.5) * 2.4,
          q % 3 ? 0xff8030 : 0xffe090, 0.5);
      }
      // тому, в кого воткнулась ракета, — полные 60 прямого урона ДО осколков
      if (direct) direct.hp -= WEAPONS[3].dmg;
      // осколки — по спаду от ЭПИЦЕНТРА ДО КРАЯ твари: взрыв происходит на её
      // границе, и если мерить до центра, цель в упор получала бы 33 вместо 45
      for (let i = mons.length - 1; i >= 0; i--) {
        const m = mons[i];
        const d = Math.max(0, Math.hypot(m.x - bx, m.z - bz) - MDEFS[m.kind].radius);
        if (d > ROCKET.radius) continue;
        const k = 1 - d / ROCKET.radius;
        m.hp -= ROCKET.splash * k;
        m.hurtT = 0.14;
        if (m.hp <= 0) {
          sfx.play('monsterDie', { x: m.x, z: m.z });
          gibify(m);
          mons.splice(i, 1);
          alive--; kills++; totalKills++;
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
      let d = dmg;
      if (armor > 0) { const abs = Math.min(armor, d * 0.4); armor -= abs; d -= abs; }
      hp -= d;
      flashT = 0.3; flashCol = 0;
      faceOw = 0.6;
      sfx.play('playerPain');
      if (hp <= 0) { hp = 0; phase = 'dead'; phaseT = 0; endSel = 0; sfx.play('playerDie');
        music.play('end', { loop: false, fade: 0.5, onEnd: () => music.play('chill', { fade: 1.6 }) }); if (document.pointerLockElement) document.exitPointerLock?.(); }
    };

    // ── волны ──
    const waveReward = (n: number) => Math.round((BASE_REWARD + (n - 1) * STEP_REWARD) * D.reward);
    const startWave = () => {
      wave++;
      kills = 0;
      waveBudget = Math.round((4 + wave * 2.4 + s01 * 2) * D.budget);
      spawnCd = 0.4;
      phase = 'wave'; phaseT = 0;
      sfx.play('waveStart');
      music.play('main', { fade: 0.7 });
      if (wave === 3 && !owned[1]) { owned[1] = true; weapon = 1; buildGun(1); ammo.shl += 20; sfx.play('pickWeapon'); }
      if (wave === 6 && !owned[2]) { owned[2] = true; weapon = 2; buildGun(2); ammo.bul += 100; sfx.play('pickWeapon'); }
      if (wave >= RKT_WAVE && !rktArmed) {
        // ствол не выдаётся в руки — за ним надо сходить, под огнём
        rktArmed = true;
        resetPickups();                                  // три обоймы из четырёх меняются на ракеты
        if (!owned[3]) { mkPickup('launcher', 0, -14); sfx.play('teleport', { x: 0, z: -14 }); }
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
    const restart = () => {
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
      px = 0; pz = 14; yaw = 0; wave = startWaveAt - 1;
      resetPickups();
      music.play('main', { fade: 0.8 });
      startWave();
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
    const btnRects = () => {
      const W = ctx.width, H = ctx.height;
      const w = Math.min(230, W * 0.38), h = 48, gap = 22;
      return {
        cash: { x: W / 2 - w - gap / 2, y: H * 0.6, w, h },
        work: { x: W / 2 + gap / 2, y: H * 0.6, w, h },
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
      const W = ctx.width, H = ctx.height;
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
      g.fillText('ЗДОРОВЬЕ', u * 10.5, lblY);
      g.fillStyle = hp > 40 ? '#e8c840' : Math.floor(time * 6) % 2 === 0 ? '#ff4030' : '#a01c18';
      g.font = FONT(numF);
      g.fillText(`${Math.ceil(hp)}%`, u * 10.5, numY);
      // ПАТРОНЫ
      cell(u * 21, u * 15);
      g.fillStyle = '#c8a0a0'; g.font = FONT(10);
      g.fillText('ПАТРОНЫ', u * 28.5, lblY);
      g.fillStyle = '#e8c840'; g.font = FONT(numF);
      g.fillText(`${ammo[WEAPONS[weapon].ammo]}`, u * 28.5, numY);
      // ЛИЦО
      cell(u * 38, u * 24);
      drawFace(u * 50, y0 + bh / 2, Math.min((bh - 20) / 13, u * 1.7));
      // БРОНЯ
      cell(u * 64, u * 15);
      g.fillStyle = '#c8a0a0'; g.font = FONT(10);
      g.fillText('БРОНЯ', u * 71.5, lblY);
      g.fillStyle = '#60a0ff'; g.font = FONT(numF);
      g.fillText(`${Math.ceil(armor)}%`, u * 71.5, numY);
      // ОРУЖИЕ + ДЕНЬГИ
      cell(u * 81, u * 17);
      g.fillStyle = '#c8a0a0'; g.font = FONT(10);
      g.fillText('ОРУЖИЕ', u * 89.5, lblY);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = owned[i] ? (i === weapon ? '#e8c840' : '#8a7a40') : '#3a2a26';
        g.fillRect(u * 84.2 + i * u * 3.8, lblY + 7, u * 3, 6);
      }
      g.fillStyle = '#7bd88f'; g.font = FONT(Math.max(13, numF * 0.7));
      g.fillText(`${money}₴`, u * 89.5, numY);
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
        ['режим', `${D.name} · потолок ${D.cap}`, false],
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

    const drawHud = () => {
      const W = ctx.width, H = ctx.height;

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
        g.save();
        fitFont(g, 'ФАЄРВОЛ', W * 0.8, 62, FAM);
        g.shadowColor = 'rgba(255,80,20,0.9)'; g.shadowBlur = 26;
        g.fillStyle = '#e8c840';
        g.fillText('ФАЄРВОЛ', W / 2, H * 0.24);
        g.restore();
        fitFont(g, 'ТРИМАЙ ПОРТ · ОПЛАТА ЗА ВІДБИТУ ХВИЛЮ', W * 0.8, 15, FAM);
        g.fillStyle = '#c88a5a';
        g.fillText('ТРИМАЙ ПОРТ · ОПЛАТА ЗА ВІДБИТУ ХВИЛЮ', W / 2, H * 0.24 + 34);
        const items = ['НОВА ГРА', `СКЛАДНІСТЬ: ${D.name}`, 'ВИЙТИ'];
        for (let i = 0; i < items.length; i++) {
          const yy = H * 0.5 + i * 58;
          const on = i === titleSel;
          fitFont(g, items[i], W * 0.5, i === 1 ? 24 : 30, FAM);
          g.fillStyle = i === 1 ? (on ? D.col : '#7a5a4a') : on ? '#e8c840' : '#8a5a4a';
          g.fillText(items[i], W / 2, yy);
          if (i === 1) {                       // подсказка под строкой сложности
            g.save();
            fitFont(g, `← → ${D.hint}`, W * 0.6, 12, FAM);
            g.fillStyle = '#7a5a50';
            g.fillText(`← → ${D.hint}`, W / 2, yy + 17);
            g.restore();
          }
          if (on) {
            // курсор-череп слева от края текста: пункты разной длины,
            // фиксированный отступ налезал на длинную строку сложности
            const tw = g.measureText(items[i]).width;
            const sx = W / 2 - tw / 2 - 34, sy = yy - 10;
            g.fillStyle = '#d8d2c0'; g.fillRect(sx - 12, sy - 12, 24, 20);
            g.fillStyle = '#140808'; g.fillRect(sx - 8, sy - 6, 6, 7); g.fillRect(sx + 2, sy - 6, 6, 7);
            g.fillStyle = '#d8d2c0'; g.fillRect(sx - 7, sy + 8, 14, 5);
            g.fillStyle = '#140808'; g.fillRect(sx - 3, sy + 8, 2, 5); g.fillRect(sx + 1, sy + 8, 2, 5);
          }
        }
        fitFont(g, mob ? 'ТАП ПО ПУНКТУ' : '↑↓ ВЫБОР · ENTER / SPACE — СТАРТ', W * 0.8, 13, FAM);
        g.fillStyle = '#7a5a50';
        g.fillText(mob ? 'ТАП ПО ПУНКТУ' : '↑↓ ВЫБОР · ENTER / SPACE — СТАРТ', W / 2, H * 0.82);
        if (warpDigits !== null) {               // набран IDCLEV — ждём две цифры волны
          fitFont(g, `IDCLEV ${warpDigits}▂`, W * 0.4, 13, FAM);
          g.fillStyle = '#7bd88f';
          g.fillText(`IDCLEV ${warpDigits}▂`, W / 2, H * 0.88);
        }
        g.textAlign = 'left';
        return;
      }

      // «РАКЕТНИЦА» — короткая плашка сразу после подбора
      if (launcherMsg > 0 && (phase === 'wave' || phase === 'clear')) {
        g.textAlign = 'center';
        fitFont(g, 'РАКЕТНИЦА — КЛАВИША 4', W * 0.7, 26, FAM);
        g.fillStyle = '#ff8a30';
        g.fillText('РАКЕТНИЦА — КЛАВИША 4', W / 2, H * 0.34);
        fitFont(g, 'ОСКОЛКИ БЬЮТ И ПО ТЕБЕ — НЕ СТРЕЛЯЙ В УПОР', W * 0.7, 14, FAM);
        g.fillStyle = '#c88a5a';
        g.fillText('ОСКОЛКИ БЬЮТ И ПО ТЕБЕ — НЕ СТРЕЛЯЙ В УПОР', W / 2, H * 0.34 + 24);
        g.textAlign = 'left';
      }

      if (showPerf) drawPerf();

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
      g.fillText(`ВОЛНА ${wave}`, 16, 26);
      g.fillStyle = '#c88a5a'; g.font = FONT(12);
      g.fillText(`ТВАРЕЙ: ${alive}`, 16, 46);
      g.textAlign = 'right';
      g.fillStyle = '#c8a0a0'; g.font = FONT(12);
      g.fillText(`ЗА ВОЛНУ +${waveReward(wave)}₴`, W - 16, 26);
      g.fillText(`УБИТО: ${totalKills}`, W - 16, 46);
      g.textAlign = 'left';

      // баннеры
      if (phase === 'wave' && phaseT < 2) {
        g.textAlign = 'center';
        const t1 = wave % 5 === 0 ? `ВОЛНА ${wave} — НАПЛЫВ БОМБИСТОВ!` : `ВОЛНА ${wave}`;
        if (D.key !== 'norm') {                       // на какой сложности идёт забег
          g.save();
          fitFont(g, D.name, ctx.width * 0.4, 15, FAM);
          g.fillStyle = D.col;
          g.fillText(D.name, ctx.width / 2, ctx.height * 0.2);
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
        fitFont(g, 'ВОЛНА ЗАЧИЩЕНА', W * 0.8, 34, FAM);
        g.fillStyle = '#7bd88f';
        g.fillText('ВОЛНА ЗАЧИЩЕНА', W / 2, H * 0.3);
        fitFont(g, `ГОНОРАР +${waveReward(wave)}₴`, W * 0.6, 22, FAM);
        g.fillStyle = '#e8c840';
        g.fillText(`ГОНОРАР +${waveReward(wave)}₴`, W / 2, H * 0.3 + 32);
        fitFont(g, `следующая волна через ${Math.ceil(Math.max(0, 4 - phaseT))}…`, W * 0.6, 14, FAM);
        g.fillStyle = '#c88a5a';
        g.fillText(`следующая волна через ${Math.ceil(Math.max(0, 4 - phaseT))}…`, W / 2, H * 0.3 + 58);
        g.textAlign = 'left';
      }

      // подсказка управления в начале забега
      if (!mob && wave === 1 && phaseT < 7 && phase === 'wave') {
        g.textAlign = 'center';
        const t = locked ? 'WASD — ХОД · МЫШЬ — ОБЗОР · КЛИК — ОГОНЬ · 1/2/3 — ОРУЖИЕ'
          : 'КЛИКНИ ДЛЯ ЗАХВАТА МЫШИ · ИЛИ КЛАССИКА: ←→ ПОВОРОТ, ↑↓ ХОД, SPACE — ОГОНЬ';
        fitFont(g, t, W * 0.92, 14, FAM);
        g.fillStyle = 'rgba(232,200,64,0.75)';
        g.fillText(t, W / 2, H - Math.min(78, H * 0.16) - 18);
        g.textAlign = 'left';
      }

      // мобильные контролы
      if (touch && (phase === 'wave' || phase === 'clear')) {
        const L = tLayout();
        // стики
        for (const [c, v, lbl] of [[L.moveC, tMove, 'ХОД'], [L.lookC, tLook, 'ОБЗОР']] as const) {
          g.beginPath(); g.arc(c.x, c.y, L.r, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill();
          g.strokeStyle = 'rgba(232,200,64,0.25)'; g.lineWidth = 2; g.stroke();
          g.beginPath(); g.arc(c.x + v.x * L.r * 0.6, c.y + v.y * L.r * 0.6, L.r * 0.34, 0, Math.PI * 2);
          g.fillStyle = 'rgba(232,200,64,0.35)'; g.fill();
          g.fillStyle = 'rgba(200,160,120,0.6)'; g.font = FONT(10); g.textAlign = 'center';
          g.fillText(lbl, c.x, c.y - L.r - 8);
          g.textAlign = 'left';
        }
        drawButton(g, L.fire.x, L.fire.y, L.fire.r, 'ОГОНЬ', tFire, '#ff6030');
        drawButton(g, L.wpn.x, L.wpn.y, L.wpn.r, `${weapon + 1}`, false, '#e8c840');
        void bh;
      }

      // ── СМЕРТЬ: заработок + две кнопки ──
      if (phase === 'dead') {
        g.fillStyle = 'rgba(60,6,6,0.55)'; g.fillRect(0, 0, W, H);
        g.textAlign = 'center';
        g.save();
        fitFont(g, 'ТЕБЯ РАЗОРВАЛИ', W * 0.86, 42, FAM);
        g.shadowColor = 'rgba(255,40,20,0.9)'; g.shadowBlur = 24;
        g.fillStyle = '#ff4030';
        g.fillText('ТЕБЯ РАЗОРВАЛИ', W / 2, H * 0.26);
        g.restore();
        fitFont(g, `${money}₴`, W * 0.6, 46, FAM);
        g.fillStyle = '#7bd88f';
        g.fillText(`${money}₴`, W / 2, H * 0.26 + 56);
        const sub = `волн пройдено: ${Math.max(0, wave - 1)} · твари: ${totalKills}`;
        fitFont(g, sub, W * 0.8, 15, FAM);
        g.fillStyle = '#c8a0a0';
        g.fillText(sub, W / 2, H * 0.26 + 84);
        const R = btnRects();
        pixelBtn(R.cash, 'Вывести деньги', endSel === 0, '#7bd88f');
        pixelBtn(R.work, 'Работать ещё', endSel === 1, '#e8c840');
        fitFont(g, mob ? 'ТАП ПО КНОПКЕ' : 'КЛИК · ИЛИ ← / → И ENTER', W * 0.7, 13, FAM);
        g.fillStyle = '#8a6a60';
        g.fillText(mob ? 'ТАП ПО КНОПКЕ' : 'КЛИК · ИЛИ ← / → И ENTER', W / 2, R.cash.y + R.cash.h + 34);
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
        const need = p.r + r;
        // квадратный пилон: выталкиваем по меньшей оси
        if (Math.abs(dx) < need && Math.abs(dz) < need) {
          if (Math.abs(dx) > Math.abs(dz)) nx = p.x + Math.sign(dx || 1) * need;
          else nz = p.z + Math.sign(dz || 1) * need;
        }
      }
      return [nx, nz];
    };

    /** точка внутри пилона (пилоны — квадраты в плане) */
    const inPillar = (x: number, z: number, pad = 0) => {
      for (const p of pillars) {
        if (Math.abs(x - p.x) < p.r + pad && Math.abs(z - p.z) < p.r + pad) return true;
      }
      return false;
    };
    /** перекрыт ли пилоном отрезок между двумя точками (слэб-тест по AABB) */
    const losBlocked = (x0: number, z0: number, x1: number, z1: number) => {
      const dx = x1 - x0, dz = z1 - z0;
      for (const p of pillars) {
        let t0 = 0, t1 = 1;
        if (Math.abs(dx) < 1e-6) {
          if (x0 < p.x - p.r || x0 > p.x + p.r) continue;
        } else {
          let ta = (p.x - p.r - x0) / dx, tb = (p.x + p.r - x0) / dx;
          if (ta > tb) { const sw = ta; ta = tb; tb = sw; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        if (Math.abs(dz) < 1e-6) {
          if (z0 < p.z - p.r || z0 > p.z + p.r) continue;
        } else {
          let ta = (p.z - p.r - z0) / dz, tb = (p.z + p.r - z0) / dz;
          if (ta > tb) { const sw = ta; ta = tb; tb = sw; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        return true;
      }
      return false;
    };

    let prevPD = false, prevEnter = false, prevUp = false, prevDown = false, prevLR = 0;
    let menuMusicOn = false; // chill в титуле — только после жеста (autoplay-политика)

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
        for (const p of touch.started) {
          if (moveId < 0 && inCircle(p.x, p.y, L.moveC.x, L.moveC.y, L.r * 1.5)) moveId = p.id;
          else if (lookId < 0 && inCircle(p.x, p.y, L.lookC.x, L.lookC.y, L.r * 1.5)) lookId = p.id;
        }
        for (const p of touch.ended) {
          if (p.id === moveId) { moveId = -1; tMove = { x: 0, y: 0 }; }
          if (p.id === lookId) { lookId = -1; tLook = { x: 0, y: 0 }; }
        }
        tFire = false;
        for (const p of touch.active) {
          if (p.id === moveId) {
            tMove.x = Math.max(-1, Math.min(1, (p.x - L.moveC.x) / (L.r * 0.85)));
            tMove.y = Math.max(-1, Math.min(1, (p.y - L.moveC.y) / (L.r * 0.85)));
          } else if (p.id === lookId) {
            tLook.x = Math.max(-1, Math.min(1, (p.x - L.lookC.x) / (L.r * 0.85)));
            tLook.y = Math.max(-1, Math.min(1, (p.y - L.lookC.y) / (L.r * 0.85)));
          } else if (inCircle(p.x, p.y, L.fire.x, L.fire.y, L.fire.r * 1.3)) tFire = true;
        }
        for (const p of touch.started) {
          if (inCircle(p.x, p.y, L.wpn.x, L.wpn.y, L.wpn.r * 1.3)) {
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
        if (upEdge || downEdge) { titleSel = (titleSel + (downEdge ? 1 : 2)) % 3; sfx.play('menuMove'); }
        if (titleSel === 1 && lrEdge !== 0) { setDiff(diffIx + (lrEdge > 0 ? 1 : -1)); sfx.play('menuMove'); }
        const startNow = enterEdge || keys.has('Space') || (mob && pdEdge);
        if (startNow) {
          if (mob && pdEdge) {
            // тап по пункту: берём ближайшую строку из трёх
            const ty = ctx.input.pointer.y;
            let best = 0, bestD = 1e9;
            for (let i = 0; i < 3; i++) {
              const d = Math.abs(ty - (ctx.height * 0.5 + i * 58));
              if (d < bestD) { bestD = d; best = i; }
            }
            titleSel = best;
          }
          sfx.play('menuSelect');
          if (titleSel === 1) { setDiff(diffIx + 1); }        // строка сложности — перебор
          else if (titleSel === 2) { cleanup(); ctx.finish({ success: false, score: 0 }); return; }
          else {
            music.play('main', { fade: 1.4 });   // из chill в бой с наложением
            startWave();
          }
        }
        if (warpTo !== null) {
          // IDCLEV набран: прыжок сразу на выбранную волну
          sfx.play('menuSelect');
          wave = warpTo - 1;                     // startWave сделает wave++
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

      // ── СМЕРТЬ: выбор кнопки ──
      if (phase === 'dead') {
        if (lrEdge < 0) endSel = 0;
        if (lrEdge > 0) endSel = 1;
        const R = btnRects();
        let go = -1;
        if (pdEdge) {
          if (inRect(R.cash, ctx.input.pointer.x, ctx.input.pointer.y)) go = 0;
          else if (inRect(R.work, ctx.input.pointer.x, ctx.input.pointer.y)) go = 1;
        } else if (enterEdge || keys.has('Space')) go = endSel;
        if (go === 0) { cleanup(); ctx.finish({ success: money > 0, score: money }); return; }
        if (go === 1) restart();
        drawHud();
        touch?.endFrame();
        return;
      }

      // ── обзор ──
      const sens = 0.0022;
      yaw -= mDX * sens;
      pitch = Math.max(-0.5, Math.min(0.5, pitch - mDY * sens * 0.8));
      mDX = 0; mDY = 0;
      if (touch) {
        yaw -= tlx * 2.4 * dt;
        pitch = Math.max(-0.5, Math.min(0.5, pitch + tly * 1.4 * dt));
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
      const len = Math.hypot(fwd, strafe) || 1;
      const SPD = 7.4;
      const mvx = (-sinY * fwd + cosY * strafe) / len * SPD;
      const mvz = (-cosY * fwd - sinY * strafe) / len * SPD;
      if (fwd || strafe) bob += dt * 9;
      [px, pz] = collide(px + mvx * dt, pz + mvz * dt, P_RADIUS);
      sfx.setListener(px, pz, yaw);   // позиционный звук считается от игрока

      // ── огонь ──
      if ((mouseDown && locked) || keys.has('Space') || keys.has('ControlLeft') || keys.has('ControlRight') || tFire) fire();

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
          money += waveReward(wave);
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
      for (let i = mons.length - 1; i >= 0; i--) {
        const m = mons[i];
        const d = MDEFS[m.kind];
        m.t += dt;
        const wasX = m.x, wasZ = m.z;   // для разворота по фактическому движению
        if (m.atkCd > 0) m.atkCd -= dt;
        if (m.hurtT > 0) m.hurtT -= dt;
        const dx = px - m.x, dz = pz - m.z;
        const dist = Math.hypot(dx, dz) || 1;
        const ux = dx / dist, uz = dz / dist;
        const spd = d.speed * (m.vet ? 1.15 : 1) * (1 + 0.02 * wave);

        if (m.kind === 'bull') {
          // рогач: заводится, потом таранит по прямой
          if (m.state === 'walk') {
            m.x += ux * spd * 0.35 * dt; m.z += uz * spd * 0.35 * dt;
            if (dist < 18) { m.state = 'wind'; m.windT = 0.7; m.vx = ux; m.vz = uz; }
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
              ballMeshes[mi].position.set(m.x + ox, 1.7, m.z + oz);
              ballMeshes[mi].visible = true;
              if (li >= 0) {
                ballLights[li].position.set(m.x + ox, 1.7, m.z + oz);
                ballLights[li].intensity = 2.2;
              }
              balls.push({ mi, li, x: m.x + ox, y: 1.7, z: m.z + oz, vx: ux * 13, vz: uz * 13, life: 3.4 });
            }
          }
        } else {
          // гнар / бомбист: прямо на игрока
          m.x += ux * spd * dt; m.z += uz * spd * dt;
          if (m.kind === 'gnaar') m.grp.position.y = Math.abs(Math.sin(m.t * 5)) * 0.12;
          else m.grp.position.y = Math.abs(Math.sin(m.t * 11)) * 0.18; // бомбист трясётся
        }

        // разведение монстров, чтобы не слипались
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
        if (!d.flying) [m.x, m.z] = collide(m.x, m.z, d.radius);
        else {
          const lim = ARENA - 1 - d.radius;
          m.x = Math.max(-lim, Math.min(lim, m.x));
          m.z = Math.max(-lim, Math.min(lim, m.z));
        }

        m.grp.position.x = m.x;
        m.grp.position.z = m.z;
        m.wail?.move(m.x, m.z);
        if (d.flying) m.grp.position.y = m.y;

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
            // взрыв
            for (let q = 0; q < 22; q++) puff(m.x + (rng() - 0.5) * 2, 0.6 + rng() * 2, m.z + (rng() - 0.5) * 2, q % 3 ? 0xff8030 : 0xffe090, 0.5);
            muzzleLight.position.set(m.x, 1.4, m.z);
            muzzleLight.intensity = 7;
            sfx.play('explosion', { x: m.x, z: m.z });
            hurt((d.explode ?? 20) * (m.vet ? 1.4 : 1) * D.dmg);
            gibify(m); mons.splice(i, 1); alive--; totalKills++;
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
        const hitP = Math.hypot(b.x - px, b.z - pz) < P_RADIUS + 0.4 && Math.abs(b.y - EYE) < 1.6;
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
        p.grp.position.y = p.kind === 'launcher'
          ? 0.75 + Math.sin(time * 1.7) * 0.22          // ствол парит заметно выше
          : 0.1 + Math.sin(time * 2.5 + p.x) * 0.12;
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
      cam.position.set(px + bobX * 0.4, EYE + bobY, pz);
      cam.rotation.set(pitch, yaw, 0, 'YXZ');
      playerLamp.position.set(px, EYE + 0.4, pz);
      gunGrp.position.set(bobX, bobY * 0.6 - kick * 0.12, kick * 0.18);
      gunGrp.rotation.set(kick * 0.22, 0, 0);

      drawHud();
      touch?.endFrame();
    });
  },
};
