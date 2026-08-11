import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../core/three3d';

/**
 * Библиотека воксель-моделей шутера «Фаєрвол» (мини-игра doom).
 * Один источник правды: и сама игра, и страница ассетов (/assets.html)
 * строят объекты отсюда — витрина не может разойтись с игрой.
 * Все модели оригинальные, собраны из кубов.
 */

export type MK = 'gnaar' | 'boom' | 'kleer' | 'bull' | 'harpy' | 'mech';
export interface MDef {
  name: string; hp: number; speed: number; melee: number; radius: number; h: number;
  color: number; cost: number; ranged?: boolean; flying?: boolean; explode?: number;
  role: string;
}
export const MDEFS: Record<MK, MDef> = {
  gnaar: { name: 'ГНАР', hp: 30, speed: 2.6, melee: 7, radius: 0.6, h: 1.7, color: 0x7a5c8a, cost: 1, role: 'филлер: прёт напролом' },
  boom: { name: 'БОМБИСТ', hp: 22, speed: 4.6, melee: 0, radius: 0.55, h: 1.8, color: 0xb8a070, cost: 1, explode: 24, role: 'камикадзе: взрывается вплотную' },
  kleer: { name: 'СКАКУН', hp: 45, speed: 5.4, melee: 11, radius: 0.5, h: 1.9, color: 0xd8d2c0, cost: 2, role: 'прыгун: телеграф → прыжок насквозь' },
  bull: { name: 'РОГАЧ', hp: 75, speed: 8.2, melee: 19, radius: 0.85, h: 1.6, color: 0x8a4a2a, cost: 3, role: 'таран по прямой, откидывает' },
  harpy: { name: 'ГАРПИЯ', hp: 26, speed: 4.2, melee: 8, radius: 0.5, h: 1.2, color: 0x6a8ab0, cost: 2, flying: true, role: 'летун: синусоида и пике' },
  mech: { name: 'МЕХАНОИД', hp: 95, speed: 1.9, melee: 0, radius: 0.8, h: 2.6, color: 0x59606a, cost: 4, ranged: true, role: 'стрелок: два файербола' },
};

export const PAL = {
  floorA: 0x3a3230, floorB: 0x2e2624, wall: 0x4a2c26, trim: 0x6a3a2c,
  lava: 0xd8541e, pillar: 0x5a4a44, gibRed: 0xa01c18,
  hellSky: 0x2a0a08, rune: 0xff2a10, runeHot: 0xff8a50,
};

export type PickupKind = 'med' | 'arm' | 'bul' | 'box' | 'shl' | 'rkt' | 'launcher';
export const PICKUP_INFO: Record<PickupKind, { name: string; give: string }> = {
  med: { name: 'АПТЕЧКА', give: '+25 здоровья' },
  arm: { name: 'БРОНЯ', give: '+35 брони' },
  bul: { name: 'ОБОЙМА', give: '+40 патронов' },
  box: { name: 'ЯЩИК ПАТРОНОВ', give: '+110 патронов (корм пулемёта)' },
  shl: { name: 'ДРОБЬ', give: '+12 дроби' },
  rkt: { name: 'РАКЕТЫ', give: '+5 ракет (появляются с 16-й волны вместо обойм)' },
  launcher: { name: 'РАКЕТНИЦА', give: 'сам ствол — лежит в центре арены на 16-й волне' },
};

export const WEAPONS = [
  { name: 'ПИСТОЛЕТ', dmg: 15, cd: 0.36, spread: 0.02, pellets: 1, ammo: 'bul' as const, use: 1, unlock: 'старт' },
  { name: 'ДРОБОВИК', dmg: 10, cd: 0.82, spread: 0.13, pellets: 7, ammo: 'shl' as const, use: 1, unlock: 'волна 3' },
  { name: 'ПУЛЕМЁТ', dmg: 11, cd: 0.09, spread: 0.055, pellets: 1, ammo: 'bul' as const, use: 1, unlock: 'волна 6' },
  { name: 'РАКЕТНИЦА', dmg: 90, cd: 0.95, spread: 0, pellets: 1, ammo: 'rkt' as const, use: 1, unlock: 'волна 16 — лежит на арене' },
];
/** осколочный урон ракеты: в эпицентре SPLASH, до нуля на SPLASH_R; себе — ×SELF */
export const ROCKET = { splash: 70, radius: 5.5, self: 0.35, speed: 24, life: 3.2 };   // self×splash ≈ 25 в упор — риск как был

// ── АРЕНА КАК ДАННЫЕ ──────────────────────────────────────────────────────
// Всё переменное на арене описывается ArenaDef: игра строит уровень из него,
// редактор его же редактирует. Стены, пол и лава фиксированы (границы ±26).

export type ArenaPickupKind = 'med' | 'arm' | 'bul' | 'shl' | 'box';
export interface ArenaDef {
  pillars: { x: number; z: number; r: number }[];
  torches: { x: number; z: number }[];
  /** печати спавна; меньше двух — арена неиграбельна */
  seals: { x: number; z: number }[];
  pickups: { kind: ArenaPickupKind; x: number; z: number }[];
  start: { x: number; z: number };
}

/** потолки редактора: света на арене конечное число, драйвер скажет спасибо */
export const ARENA_CAPS = { pillars: 14, torches: 12, seals: 10, pickups: 24 } as const;

export const DEFAULT_ARENA: ArenaDef = {
  pillars: [
    { x: -11, z: -11, r: 1.6 }, { x: 11, z: -11, r: 1.6 },
    { x: -11, z: 11, r: 1.6 }, { x: 11, z: 11, r: 1.6 },
    { x: 0, z: 0, r: 2.2 },
  ],
  torches: [
    { x: -25, z: -14 }, { x: -25, z: 0 }, { x: -25, z: 14 },
    { x: 25, z: -14 }, { x: 25, z: 0 }, { x: 25, z: 14 },
    { x: -14, z: -25 }, { x: 14, z: -25 }, { x: -14, z: 25 }, { x: 14, z: 25 },
  ],
  seals: [
    { x: 0, z: -22 }, { x: 0, z: 22 }, { x: -22, z: 0 }, { x: 22, z: 0 },
    { x: -17, z: -17 }, { x: 17, z: -17 }, { x: -17, z: 17 }, { x: 17, z: 17 },
  ],
  pickups: [
    // первый «bul» в списке НЕ меняется на ракеты после 16-й волны — порядок важен
    { kind: 'bul', x: 19, z: -3 },
    { kind: 'bul', x: -6, z: -18 }, { kind: 'bul', x: 6, z: 18 }, { kind: 'bul', x: -19, z: 12 },
    { kind: 'med', x: -18, z: -6 }, { kind: 'med', x: 18, z: 6 }, { kind: 'med', x: 12, z: -4 },
    { kind: 'arm', x: 0, z: -19 }, { kind: 'arm', x: 0, z: 19 },
    { kind: 'box', x: -21, z: -21 }, { kind: 'box', x: 21, z: 21 },
    { kind: 'shl', x: 19, z: -12 }, { kind: 'shl', x: -12, z: 4 }, { kind: 'shl', x: 4, z: -21 },
  ],
  start: { x: 0, z: 14 },
};

/** проверка арены из localStorage/импорта: чужому JSON веры нет */
export function validateArena(raw: unknown): ArenaDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, lim: number): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, Math.round(v))) : null;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const out: ArenaDef = { pillars: [], torches: [], seals: [], pickups: [], start: { x: 0, z: 14 } };

  for (const it of arr(o.pillars).slice(0, ARENA_CAPS.pillars)) {
    const e = it as Record<string, unknown>;
    const x = num(e.x, 23), z = num(e.z, 23);
    const r = typeof e.r === 'number' && Number.isFinite(e.r) ? Math.max(1, Math.min(3, e.r)) : null;
    if (x !== null && z !== null && r !== null) out.pillars.push({ x, z, r });
  }
  for (const it of arr(o.torches).slice(0, ARENA_CAPS.torches)) {
    const e = it as Record<string, unknown>;
    const x = num(e.x, 25), z = num(e.z, 25);
    if (x !== null && z !== null) out.torches.push({ x, z });
  }
  for (const it of arr(o.seals).slice(0, ARENA_CAPS.seals)) {
    const e = it as Record<string, unknown>;
    const x = num(e.x, 23), z = num(e.z, 23);
    if (x !== null && z !== null) out.seals.push({ x, z });
  }
  const kinds: ArenaPickupKind[] = ['med', 'arm', 'bul', 'shl', 'box'];
  for (const it of arr(o.pickups).slice(0, ARENA_CAPS.pickups)) {
    const e = it as Record<string, unknown>;
    const x = num(e.x, 24), z = num(e.z, 24);
    if (x !== null && z !== null && kinds.includes(e.kind as ArenaPickupKind)) {
      out.pickups.push({ kind: e.kind as ArenaPickupKind, x, z });
    }
  }
  const st = (o.start ?? {}) as Record<string, unknown>;
  out.start.x = num(st.x, 23) ?? 0;
  out.start.z = num(st.z, 23) ?? 14;
  if (out.seals.length < 2) return null;
  return out;
}

// ── монстры ───────────────────────────────────────────────────────────────
// Кубы монстра СЛИВАЮТСЯ в 1-2 меша с цветом в вершинах, а геометрия строится
// один раз на вариант (тип × ветеран) и шарится между всеми экземплярами.
// Было: ~12 мешей и ~12 материалов на монстра, пересборка на каждый спавн —
// всплеск кадра 0.9-3.3 мс (замер perftest), на слабых машинах ×5-8.
// Стало: спавн = 2 меша + 2 клона материала, заливка буферов один раз за игру.

interface CubeSpec { w: number; h: number; d: number; c: number; x: number; y: number; z: number }
interface WingSpec extends CubeSpec { side: number }

/** кубы → одна геометрия; цвет каждого куба запечён в вершины (linear, как у材料) */
function bakeCubes(list: CubeSpec[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const tmp = new THREE.Color();
  const geos = list.map((sp) => {
    const g = new THREE.BoxGeometry(sp.w, sp.h, sp.d);
    g.translate(sp.x, sp.y, sp.z);
    tmp.set(sp.c);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}

/**
 * Материал монстра с per-экземпляр вспышкой.
 * Раньше вспышка перекрашивала color каждого куба в белый; теперь кубы слиты,
 * и то же самое делает униформа uFlash: диффуз заливается белым, а свечение
 * остаётся цветным — ровно как было. Свечение по-прежнему «цвет куба × k»:
 * в шейдер добавлено умножение emissive на цвет вершины.
 */
function monsterMaterial(emissiveK: number): { mat: THREE.MeshLambertMaterial; flash: { value: number } } {
  const flash = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.emissive.setScalar(emissiveK);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFlash = flash;
    sh.fragmentShader = `uniform float uFlash;\n${sh.fragmentShader}`
      .replace('#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), uFlash);')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vec3( vColor );');
  };
  mat.customProgramCacheKey = () => 'mon-flash';   // одна программа на всех монстров
  return { mat, flash };
}

/** список кубов варианта — бывшее тело buildMonster, но без единого меша */
function monsterCubes(k: MK, vet: boolean): { cold: CubeSpec[]; hot: CubeSpec[]; wings: WingSpec[] } {
  const cold: CubeSpec[] = [];
  const hot: CubeSpec[] = [];
  const wings: WingSpec[] = [];
  // ветеран: цвет уходит в раскалённый багрянец — отличие видно за полкарты
  const base = new THREE.Color(MDEFS[k].color);
  if (vet) base.lerp(new THREE.Color(0xb00c0c), 0.68).offsetHSL(0, 0.25, -0.04);
  const col = base.getHex();
  const VET_HOT = 0xff5a20;   // раскалённые накладки
  const VET_DARK = 0x2a0e0a;  // обугленная броня
  const add = (w: number, h: number, dd: number, c: number, x: number, y: number, z: number) =>
    cold.push({ w, h, d: dd, c, x, y, z });
  const hotC = (w: number, h: number, dd: number, x: number, y: number, z: number, c = VET_HOT) =>
    hot.push({ w, h, d: dd, c, x, y, z });
  const wing = (w: number, h: number, dd: number, x: number, y: number, z: number, side: number) =>
    wings.push({ w, h, d: dd, c: col, x, y, z, side });

  if (k === 'gnaar') {
    add(1.0, 0.9, 0.7, col, 0, 0.5, 0);
    add(0.8, 0.5, 0.6, col, 0, 1.2, 0.05);
    add(0.34, 0.34, 0.14, 0xf0e070, 0, 1.25, -0.34);
    add(0.3, 0.7, 0.3, col, -0.6, 0.75, 0);
    add(0.3, 0.7, 0.3, col, 0.6, 0.75, 0);
    add(0.28, 0.5, 0.28, col, -0.28, 0.2, 0);
    add(0.28, 0.5, 0.28, col, 0.28, 0.2, 0);
  } else if (k === 'boom') {
    add(0.75, 1.0, 0.5, col, 0, 0.85, 0);
    add(0.5, 0.16, 0.4, 0x8a2a1a, 0, 1.4, 0);
    for (const sx of [-0.55, 0.55]) {
      add(0.34, 0.34, 0.34, 0x2a2a2e, sx, 0.95, -0.1);
      add(0.1, 0.16, 0.1, 0xd8d0b0, sx, 1.18, -0.1);
    }
    add(0.28, 0.6, 0.28, col, -0.2, 0.3, 0);
    add(0.28, 0.6, 0.28, col, 0.2, 0.3, 0);
  } else if (k === 'kleer') {
    add(0.5, 0.8, 0.35, col, 0, 1.15, 0);
    add(0.42, 0.4, 0.4, col, 0, 1.72, 0);
    add(0.12, 0.14, 0.1, 0x140808, -0.11, 1.76, -0.2);
    add(0.12, 0.14, 0.1, 0x140808, 0.11, 1.76, -0.2);
    add(0.34, 0.14, 0.16, col, 0, 1.5, -0.16);
    for (const sx of [-0.42, 0.42]) {
      add(0.16, 0.7, 0.16, col, sx, 1.25, -0.1);
      add(0.12, 0.3, 0.12, 0xf0e8d0, sx, 0.85, -0.24);
    }
    add(0.18, 0.75, 0.18, col, -0.16, 0.38, 0);
    add(0.18, 0.75, 0.18, col, 0.16, 0.38, 0);
  } else if (k === 'bull') {
    add(1.5, 0.9, 1.0, col, 0, 0.95, 0);
    add(0.8, 0.7, 0.7, col, 0, 1.15, -0.75);
    for (const sx of [-0.5, 0.5]) {
      add(0.16, 0.16, 0.6, 0xe8e0c8, sx, 1.4, -0.95);
      add(0.16, 0.3, 0.16, 0xe8e0c8, sx, 1.55, -1.2);
    }
    add(0.18, 0.16, 0.1, 0xff4020, -0.2, 1.2, -1.1);
    add(0.18, 0.16, 0.1, 0xff4020, 0.2, 1.2, -1.1);
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.35, 0.35]) add(0.26, 0.5, 0.26, col, sx, 0.25, sz);
  } else if (k === 'harpy') {
    add(0.5, 0.6, 0.45, col, 0, 0.3, 0);
    add(0.36, 0.32, 0.34, col, 0, 0.72, -0.06);
    add(0.28, 0.1, 0.1, 0xe0a040, 0, 0.68, -0.28);
    add(0.1, 0.12, 0.1, 0xffe060, -0.1, 0.78, -0.2);
    add(0.1, 0.12, 0.1, 0xffe060, 0.1, 0.78, -0.2);
    wing(0.9, 0.1, 0.5, -0.66, 0.45, 0.05, -1);
    wing(0.9, 0.1, 0.5, 0.66, 0.45, 0.05, 1);
    add(0.14, 0.34, 0.14, 0xe0a040, -0.14, -0.05, 0);
    add(0.14, 0.34, 0.14, 0xe0a040, 0.14, -0.05, 0);
  } else {
    add(1.0, 1.3, 0.8, col, 0, 1.55, 0);
    add(0.7, 0.5, 0.6, col, 0, 2.4, -0.05);
    add(0.5, 0.16, 0.14, 0xff3020, 0, 2.45, -0.34);
    for (const sx of [-0.72, 0.72]) {
      add(0.3, 0.3, 0.9, 0x3a4048, sx, 1.7, -0.3);
      add(0.18, 0.18, 0.22, 0x1a1e24, sx, 1.7, -0.86);
    }
    for (const sx of [-0.38, 0.38]) {
      add(0.28, 0.9, 0.28, 0x3a4048, sx, 0.45, 0);
      add(0.42, 0.16, 0.6, 0x3a4048, sx, 0.08, 0);
    }
  }

  // ── ВЕТЕРАН: каждому типу свои надстройки, а не только цвет ──
  if (vet) {
    if (k === 'gnaar') {
      // гребень раскалённых шипов вдоль горба + налитый кровью глаз
      for (let i = 0; i < 4; i++) hotC(0.16, 0.3 + i * 0.06, 0.16, 0, 1.5 + i * 0.02, 0.28 - i * 0.19);
      hotC(0.4, 0.4, 0.1, 0, 1.25, -0.4, 0xff2a10);
      add(0.24, 0.5, 0.24, VET_DARK, -0.78, 0.8, 0);   // наплечники
      add(0.24, 0.5, 0.24, VET_DARK, 0.78, 0.8, 0);
    } else if (k === 'boom') {
      // пояс шашек и вторая пара зарядов — взрыв мощнее
      for (let i = -1; i <= 1; i++) hotC(0.16, 0.3, 0.16, i * 0.24, 0.5, -0.3, 0xff7a20);
      add(0.8, 0.14, 0.55, VET_DARK, 0, 0.42, 0);
      for (const sx of [-0.62, 0.62]) {
        add(0.3, 0.3, 0.3, 0x1a1a1e, sx, 0.55, -0.1);
        hotC(0.1, 0.14, 0.1, sx, 0.76, -0.1, 0xff2a10);
      }
      hotC(0.36, 0.1, 0.3, 0, 1.46, 0, 0xff2a10);        // тлеющий обрубок шеи
    } else if (k === 'kleer') {
      // костяная корона из рогов + раскалённые глазницы + шпоры
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.34;
        add(0.1, 0.32 + Math.abs(i) * -0.05, 0.1, 0xf0e8d0, Math.sin(a) * 0.24, 2.02, Math.cos(a) * 0.1 - 0.02);
      }
      hotC(0.13, 0.15, 0.1, -0.11, 1.76, -0.22, 0xff2a10);
      hotC(0.13, 0.15, 0.1, 0.11, 1.76, -0.22, 0xff2a10);
      for (const sx of [-0.42, 0.42]) hotC(0.09, 0.24, 0.09, sx, 0.62, -0.26);
      add(0.36, 0.5, 0.2, VET_DARK, 0, 1.2, 0.16);      // нагрудная пластина
    } else if (k === 'bull') {
      // вторая пара рогов, лобовая броня, раскалённые ноздри и хребет
      for (const sx of [-0.34, 0.34]) {
        add(0.14, 0.14, 0.44, 0xe8e0c8, sx, 1.05, -1.0);
        add(0.14, 0.22, 0.14, 0xe8e0c8, sx, 1.16, -1.2);
      }
      add(0.86, 0.3, 0.2, VET_DARK, 0, 1.42, -0.92);    // налобник
      hotC(0.12, 0.1, 0.12, -0.16, 0.95, -1.14, 0xff7a20);
      hotC(0.12, 0.1, 0.12, 0.16, 0.95, -1.14, 0xff7a20);
      for (let i = 0; i < 3; i++) hotC(0.13, 0.26, 0.13, 0, 1.5, -0.2 + i * 0.34);  // хребет
    } else if (k === 'harpy') {
      // второй ярус крыльев, гребень и раскалённый хвост
      wing(0.66, 0.09, 0.36, -0.5, 0.18, 0.16, -1);
      wing(0.66, 0.09, 0.36, 0.5, 0.18, 0.16, 1);
      for (let i = 0; i < 3; i++) hotC(0.09, 0.18 - i * 0.03, 0.09, 0, 0.9, -0.02 + i * 0.14);
      hotC(0.12, 0.1, 0.5, 0, 0.28, 0.44, 0xff5a20);     // хвост-уголёк
    } else {
      // третья пушка, антенна, реактор и наплечная броня
      add(0.34, 0.34, 0.7, 0x2c333c, 0, 2.05, -0.5);
      add(0.2, 0.2, 0.2, 0x1a1e24, 0, 2.05, -0.92);
      add(0.1, 0.7, 0.1, 0x2c333c, 0.42, 2.95, 0);
      hotC(0.14, 0.14, 0.14, 0.42, 3.34, 0, 0xff2a10);   // маячок на антенне
      hotC(0.42, 0.42, 0.16, 0, 1.5, 0.46, 0xff5a20);    // реактор в спине
      for (const sx of [-0.62, 0.62]) add(0.36, 0.22, 0.6, VET_DARK, sx, 2.1, 0);
    }
  }
  return { cold, hot, wings };
}

interface MonsterVariant {
  cold: THREE.BufferGeometry;
  hot: THREE.BufferGeometry | null;
  wings: { geo: THREE.BufferGeometry; x: number; y: number; z: number; side: number }[];
}
const MON_VARIANTS = new Map<string, MonsterVariant>();

function monsterVariant(k: MK, vet: boolean): MonsterVariant {
  const key = `${k}|${vet ? 1 : 0}`;
  let v = MON_VARIANTS.get(key);
  if (!v) {
    const { cold, hot, wings } = monsterCubes(k, vet);
    v = {
      cold: bakeCubes(cold)!,
      hot: bakeCubes(hot),
      // крыло — своя геометрия с центром в точке машущего сустава (position задаёт экземпляр)
      wings: wings.map((w) => ({
        geo: bakeCubes([{ w: w.w, h: w.h, d: w.d, c: w.c, x: 0, y: 0, z: 0 }])!,
        x: w.x, y: w.y, z: w.z, side: w.side,
      })),
    };
    MON_VARIANTS.set(key, v);
  }
  return v;
}

export interface MonsterBuild {
  grp: THREE.Group;
  /** анимируемые части (крылья гарпии); тело слито в 1-2 меша */
  parts: THREE.Mesh[];
  /** клоны материалов экземпляра — освободить при смерти (геометрия общая, её не трогать) */
  mats: THREE.Material[];
  /** вспышка при попадании — то же «всё белое», что раньше делалось перекраской кубов */
  setFlash(on: boolean): void;
}

export function buildMonster(k: MK, vet: boolean): MonsterBuild {
  const v = monsterVariant(k, vet);
  const grp = new THREE.Group();
  const parts: THREE.Mesh[] = [];
  const cold = monsterMaterial(vet ? 0.42 : 0.22);
  const mats: THREE.Material[] = [cold.mat];
  const flashes = [cold.flash];
  grp.add(new THREE.Mesh(v.cold, cold.mat));
  if (v.hot) {
    const h = monsterMaterial(1.1);
    mats.push(h.mat);
    flashes.push(h.flash);
    grp.add(new THREE.Mesh(v.hot, h.mat));
  }
  for (const w of v.wings) {
    const m = new THREE.Mesh(w.geo, cold.mat);
    m.position.set(w.x, w.y, w.z);
    m.userData.wing = w.side;
    grp.add(m);
    parts.push(m);
  }
  return {
    grp, parts, mats,
    setFlash(on) { const f = on ? 1 : 0; for (const fl of flashes) fl.value = f; },
  };
}

export function buildWeapon(idx: number): { grp: THREE.Group; parts: THREE.Mesh[] } {
  const grp = new THREE.Group();
  const parts: THREE.Mesh[] = [];
  const add = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => {
    const m = box(w, h, d, c);
    m.position.set(x, y, z);
    grp.add(m); parts.push(m);
  };
  if (idx === 0) {
    add(0.13, 0.13, 0.58, 0x4a505a, 0.2, -0.17, -0.78);
    add(0.12, 0.24, 0.17, 0x353b44, 0.2, -0.29, -0.52);
    add(0.09, 0.09, 0.12, 0x22262c, 0.2, -0.17, -1.08);
  } else if (idx === 1) {
    add(0.17, 0.17, 1.0, 0x4a505a, 0.19, -0.18, -0.95);
    add(0.13, 0.13, 0.76, 0x353b44, 0.19, -0.29, -0.88);
    add(0.2, 0.24, 0.3, 0x7a5a34, 0.19, -0.3, -0.4);
    add(0.2, 0.2, 0.15, 0x22262c, 0.19, -0.18, -1.48);
  } else if (idx === 2) {
    add(0.22, 0.22, 0.9, 0x4a505a, 0.18, -0.2, -0.9);
    for (const bx of [-0.075, 0.075]) add(0.08, 0.08, 1.0, 0x353b44, 0.18 + bx, -0.2, -1.05);
    add(0.25, 0.28, 0.26, 0x353b44, 0.18, -0.33, -0.45);
    add(0.28, 0.1, 0.1, 0x5a606a, 0.18, -0.06, -0.66);
  } else {
    // РАКЕТНИЦА: толстая труба на плече, раструб спереди, прицельная планка
    add(0.3, 0.3, 1.25, 0x54504a, 0.17, -0.16, -1.0);
    add(0.4, 0.4, 0.2, 0x3c3834, 0.17, -0.16, -1.62);      // раструб
    add(0.34, 0.34, 0.16, 0x2a2724, 0.17, -0.16, -0.42);    // казённик
    add(0.14, 0.2, 0.3, 0x3c3834, 0.17, -0.36, -0.75);      // рукоять
    add(0.1, 0.12, 0.5, 0x6a6258, 0.17, 0.02, -1.05);       // планка сверху
    const warn = box(0.32, 0.08, 0.32, 0xd8541e);           // предупреждающая полоса
    warn.position.set(0.17, -0.16, -1.5);
    (warn.material as THREE.MeshLambertMaterial).emissive = new THREE.Color(0xd8541e).multiplyScalar(0.5);
    grp.add(warn); parts.push(warn);
  }
  return { grp, parts };
}

// ── пикапы ────────────────────────────────────────────────────────────────
/** общий материал всех запечённых статик: цвет в вершинах, одна программа */
const BAKED_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
BAKED_MAT.userData.shared = true;   // общий на все запечённые статики — не освобождать

/**
 * Слить группу неподвижных кубов в один меш (цвет — в вершинах).
 * Сливаются только простые Lambert-кубы без свечения и прозрачности; всё
 * остальное (угли, пламя, предупреждающие огни) остаётся отдельными мешами.
 * Работает по прямым детям; звать ДО позиционирования группы.
 */
export function bakeStatic(src: THREE.Group): THREE.Group {
  const out = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const tmp = new THREE.Color();
  for (const o of [...src.children]) {
    const m = o as THREE.Mesh;
    const mat = m.material as THREE.MeshLambertMaterial | undefined;
    const plain = !!(m.isMesh && mat && (mat as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial
      && !mat.transparent && mat.emissive.getHex() === 0);
    if (!plain) { out.add(o); continue; }              // переезжает как есть
    m.updateMatrix();
    const g = (m.geometry as THREE.BufferGeometry).clone().applyMatrix4(m.matrix);
    tmp.copy(mat.color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
    (m.geometry as THREE.BufferGeometry).dispose();
    mat.dispose();
  }
  if (geos.length) {
    const merged = mergeGeometries(geos, false)!;
    for (const g of geos) g.dispose();
    out.add(new THREE.Mesh(merged, BAKED_MAT));
  }
  return out;
}

/** шаблоны пикапов: геометрия и материалы общие, экземпляр — дешёвый clone() */
const PICKUP_TPL = new Map<PickupKind, THREE.Group>();

export function buildPickup(kind: PickupKind): THREE.Group {
  let t = PICKUP_TPL.get(kind);
  if (!t) { t = bakeStatic(rawPickup(kind)); PICKUP_TPL.set(kind, t); }
  return t.clone();
}

function rawPickup(kind: PickupKind): THREE.Group {
  const grp = new THREE.Group();
  if (kind === 'med') {
    const b = box(0.5, 0.34, 0.5, 0xe8e4dc); b.position.y = 0.3; grp.add(b);
    const c1 = box(0.34, 0.1, 0.1, 0xd02020); c1.position.y = 0.48; grp.add(c1);
    const c2 = box(0.1, 0.1, 0.34, 0xd02020); c2.position.y = 0.48; grp.add(c2);
  } else if (kind === 'arm') {
    const b = box(0.5, 0.6, 0.22, 0x2a6ad0); b.position.y = 0.4; grp.add(b);
    const t = box(0.3, 0.2, 0.24, 0x60a0ff); t.position.y = 0.62; grp.add(t);
  } else if (kind === 'bul') {
    const b = box(0.5, 0.28, 0.36, 0x6a5a2a); b.position.y = 0.24; grp.add(b);
    for (const bx of [-0.12, 0.12]) { const c = box(0.08, 0.16, 0.08, 0xd8b040); c.position.set(bx, 0.44, 0); grp.add(c); }
  } else if (kind === 'box') {
    const b = box(0.95, 0.6, 0.7, 0x4a5a30); b.position.y = 0.32; grp.add(b);
    const lid = box(1.0, 0.12, 0.75, 0x5f7040); lid.position.y = 0.66; grp.add(lid);
    const band = box(1.02, 0.1, 0.12, 0x2f3a20); band.position.y = 0.36; grp.add(band);
    for (let i = 0; i < 4; i++) {
      const c = box(0.1, 0.26, 0.1, 0xd8b040);
      c.position.set(-0.3 + i * 0.2, 0.84, 0);
      grp.add(c);
    }
  } else if (kind === 'rkt') {
    // ящик ракет: боеголовки торчат наружу
    const b = box(0.6, 0.26, 0.42, 0x3f4a2c); b.position.y = 0.22; grp.add(b);
    const band = box(0.62, 0.08, 0.44, 0x2a3220); band.position.y = 0.3; grp.add(band);
    for (const sx of [-0.17, 0.17]) {
      const body = box(0.13, 0.34, 0.13, 0x8a8a80); body.position.set(sx, 0.5, 0); grp.add(body);
      const head = box(0.15, 0.14, 0.15, 0xd8541e); head.position.set(sx, 0.72, 0); grp.add(head);
      const fin = box(0.24, 0.08, 0.04, 0x5a5a52); fin.position.set(sx, 0.38, 0); grp.add(fin);
    }
  } else if (kind === 'launcher') {
    // сам ствол — крупнее и с раструбом, чтобы читался издалека
    const tube = box(0.34, 0.34, 1.5, 0x54504a); tube.position.y = 0.5; tube.rotation.y = 0.4; grp.add(tube);
    const mouth = box(0.46, 0.46, 0.22, 0x3c3834); mouth.position.set(-0.29, 0.5, -0.69); mouth.rotation.y = 0.4; grp.add(mouth);
    const breech = box(0.4, 0.4, 0.18, 0x2a2724); breech.position.set(0.27, 0.5, 0.64); breech.rotation.y = 0.4; grp.add(breech);
    const grip = box(0.16, 0.26, 0.34, 0x3c3834); grip.position.set(0.05, 0.26, 0.1); grip.rotation.y = 0.4; grp.add(grip);
    const warn = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.1, 0.36),
      new THREE.MeshStandardMaterial({ color: 0xd8541e, emissive: 0xd8541e, emissiveIntensity: 1.4, roughness: 1 }),
    );
    warn.position.set(-0.2, 0.5, -0.48); warn.rotation.y = 0.4; grp.add(warn);
  } else {
    const b = box(0.44, 0.3, 0.44, 0x8a3a2a); b.position.y = 0.25; grp.add(b);
    for (const sx of [-0.1, 0.1]) for (const sz of [-0.1, 0.1]) {
      const c = box(0.12, 0.22, 0.12, 0xd05030); c.position.set(sx, 0.48, sz); grp.add(c);
    }
  }
  return grp;
}

// ── ПЕНТАГРАММА: портал спавна (замена синих площадок) ────────────────────
export interface Pentagram {
  /** вся печать: пол + голограмма + частицы */
  grp: THREE.Group;
  /** материалы для пульсации свечения */
  mats: THREE.MeshStandardMaterial[];
  /** запустить телеграф: голограмма поднимается за `lead` секунд до появления монстра */
  charge(lead: number): void;
  /** монстр появился — голограмма гаснет за `fade` секунд */
  release(fade?: number): void;
  /** 0..1 — насколько печать «заряжена» (для света портала снаружи) */
  power(): number;
  /** вызывать каждый кадр */
  update(dt: number, t: number): void;
}

/** плоская печать: ЗВЕЗДА В ДВУХ КОЛЬЦАХ + руны между ними (лежит в XZ) */
/**
 * Рунная печать. Геометрия СЛИВАЕТСЯ в два меша — холодный (кольца, руны) и
 * горячий (лучи звезды, угольки), — вместо 128 отдельных кубов.
 *
 * Так можно, потому что печать статична: части никогда не двигаются друг
 * относительно друга, а свечение `update` выставляет всем одинаковое, то есть
 * различие между кубами одного сорта существует только в геометрии.
 * Замер (insttest.html): восемь печатей давали 1032 вызова отрисовки в кадре.
 */
function buildSeal(radius: number, mats: THREE.MeshStandardMaterial[], opts: { holo: boolean }): THREE.Group {
  const g = new THREE.Group();
  const cold: THREE.BufferGeometry[] = [];
  const hot: THREE.BufferGeometry[] = [];
  const pose = new THREE.Object3D();
  /** куб с поворотом, запечённый прямо в вершины и отложенный в свою кучу */
  const put = (w: number, h: number, d: number, isHot: boolean, x: number, y: number, z: number, ry = 0) => {
    const bg = new THREE.BoxGeometry(w, h, d);
    pose.position.set(x, y, z);
    pose.rotation.set(0, ry, 0);
    pose.updateMatrix();
    bg.applyMatrix4(pose.matrix);
    (isHot ? hot : cold).push(bg);
  };

  const Y = 0.07, SEG = 44;
  const rOut = radius;            // ВНЕШНЕЕ кольцо
  const rMid = radius * 0.82;     // ВНУТРЕННЕЕ кольцо — в него вписана звезда
  const ring = (r: number, th: number, hgt: number) => {
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      put((Math.PI * 2 * r) / SEG + 0.06, hgt, th, false, Math.cos(a) * r, Y, Math.sin(a) * r, -a);
    }
  };
  ring(rOut, 0.15, 0.09);
  ring(rMid, 0.12, 0.08);
  // руны в полосе МЕЖДУ кольцами
  const rr = (rOut + rMid) / 2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.07;
    put(i % 3 === 0 ? 0.18 : 0.11, 0.07, 0.06, false, Math.cos(a) * rr, Y, Math.sin(a) * rr, -a);
    if (i % 4 === 0) put(0.06, 0.07, 0.14, false, Math.cos(a) * rr, Y, Math.sin(a) * rr, -a);
  }
  // звезда одним росчерком, вписана во ВНУТРЕННЕЕ кольцо
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    pts.push([Math.cos(a) * rMid, Math.sin(a) * rMid]);
  }
  const order = [0, 2, 4, 1, 3, 0];
  for (let i = 0; i < 5; i++) {
    const [ax, az] = pts[order[i]];
    const [bx, bz] = pts[order[i + 1]];
    const len = Math.hypot(bx - ax, bz - az);
    put(len, 0.11, 0.14, true, (ax + bx) / 2, Y + 0.01, (az + bz) / 2, -Math.atan2(bz - az, bx - ax));
  }
  // угольки в лучах
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    put(0.13, 0.1, 0.13, true, Math.cos(a) * rMid * 0.56, Y + 0.02, Math.sin(a) * rMid * 0.56, -a);
  }

  // ── слияние: две кучи → два меша ──
  for (const [geos, isHot] of [[cold, false], [hot, true]] as const) {
    if (!geos.length) continue;
    const merged = mergeGeometries(geos, false);
    for (const bg of geos) bg.dispose();          // исходники больше не нужны
    const mat = new THREE.MeshStandardMaterial({
      color: isHot ? PAL.runeHot : PAL.rune,
      emissive: isHot ? PAL.runeHot : PAL.rune,
      emissiveIntensity: isHot ? 1.5 : 1.0,
      roughness: 1,
      transparent: opts.holo,
      opacity: opts.holo ? 0.34 : 1,
      depthWrite: !opts.holo,
      blending: opts.holo ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mats.push(mat);
    g.add(new THREE.Mesh(merged, mat));
  }
  return g;
}

/**
 * Облако аддитивных искр ОДНИМ вызовом отрисовки.
 *
 * Раньше каждая искра была отдельным мешем со своим материалом: восемь печатей
 * держали 480 мешей и до сотни вызовов в кадре (замер — perftest.html).
 * InstancedMesh рисует всё разом и сохраняет то, что дал бы Points: поворот,
 * индивидуальный размер и угасание. Угасание идёт через гашение цвета в чёрный —
 * при аддитивном смешивании это в точности то же самое, что гашение прозрачности
 * (dst + src·a), только без per-instance альфы, которой у instancing нет даром.
 */
export interface EmberCloud {
  readonly mesh: THREE.InstancedMesh;
  /** записать искру в слот i (цвет уже с учётом угасания) */
  put(i: number, x: number, y: number, z: number, s: number, rx: number, ry: number, col: THREE.Color): void;
  /** сколько слотов занято в этом кадре */
  commit(n: number): void;
}
export function createEmberCloud(max: number, size: number): EmberCloud {
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true,          // белый: цвет приходит из instanceColor
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  // границы считаются по базовой геометрии, а искры разлетаются далеко от центра —
  // без этого облако будет отсекаться, когда центр группы уходит за край кадра
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  return {
    mesh,
    put(i, x, y, z, s, rx, ry, col) {
      dummy.position.set(x, y, z);
      dummy.rotation.set(rx, ry, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col);
    },
    commit(n) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

/**
 * Облако полупрозрачной пыли одним вызовом отрисовки.
 * В отличие от искр здесь обычное смешивание, поэтому гашение цвета не годится
 * (пылинка стала бы чёрной, а не прозрачной). Своей альфы у instancing нет —
 * подмешиваем атрибут прямо в шейдер, и вид остаётся ровно прежним.
 */
export interface DustCloud {
  readonly mesh: THREE.InstancedMesh;
  put(i: number, x: number, y: number, z: number, s: number, col: THREE.Color, alpha: number): void;
  commit(n: number): void;
}
export function createDustCloud(max: number, size: number): DustCloud {
  const geo = new THREE.BoxGeometry(size, size, size);
  const alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAlpha', alphaAttr);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aAlpha;\nvarying float vAlpha;\n' +
      sh.vertexShader.replace('void main() {', 'void main() {\n\tvAlpha = aAlpha;');
    sh.fragmentShader = 'varying float vAlpha;\n' +
      sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vAlpha;');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  return {
    mesh,
    put(i, x, y, z, s, col, alpha) {
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col);
      alphaAttr.setX(i, alpha);
    },
    commit(n) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

export function createPentagram(radius = 1.75): Pentagram {
  const grp = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];

  // 1) печать на полу
  grp.add(buildSeal(radius, mats, { holo: false }));

  // 2) ГОЛОГРАММА — телеграф спавна: всплывает за 2 с до монстра и гаснет после
  const holoMats: THREE.MeshStandardMaterial[] = [];
  const holo = buildSeal(radius * 0.92, holoMats, { holo: true });
  mats.push(...holoMats);
  holo.position.y = 0.06;
  holo.visible = false;
  grp.add(holo);
  const HOLO_TOP = 0.44;   // высота при полном заряде

  // 3) ЧАСТИЦЫ — искры от печати; во время заряда выше и гуще.
  // Одно облако на печать: 60 искр = 1 вызов отрисовки вместо 60.
  const P_MAX = 60;
  const P_TOP_IDLE = 0.5;    // покой: гаснут в полуметре, как и было
  const P_TOP_CHARGE = 1.7;  // заряд: столб искр заметно выше
  interface P { on: boolean; x: number; z: number; y0: number; vy: number; life: number; max: number; base: number; s: number; spin: number }
  const parts: P[] = [];
  for (let i = 0; i < P_MAX; i++) {
    parts.push({ on: false, x: 0, z: 0, y0: 0, vy: 0, life: 0, max: 1, base: 0.9, s: 1, spin: 0 });
  }
  const cloud = createEmberCloud(P_MAX, 0.055);
  grp.add(cloud.mesh);
  const emberCol = new THREE.Color();

  // ── состояние заряда ──
  type Phase = 'idle' | 'charge' | 'fade';
  let phase: Phase = 'idle';
  let pw = 0;            // 0..1 — мощность печати
  let chargeT = 0, lead = 2, fadeT = 0, fadeDur = 1;
  let spawnT = 0;

  const respawn = (p: P) => {
    const a = Math.random() * Math.PI * 2;
    const r = radius * (0.25 + Math.random() * 0.72);
    const y0 = 0.08 + holo.position.y * 0.5;
    p.x = Math.cos(a) * r; p.z = Math.sin(a) * r;
    p.y0 = y0;
    // при заряде искры летят быстрее и выше
    p.vy = (0.16 + Math.random() * 0.22) * (1 + pw * 2.2);
    p.life = 0;
    const top = P_TOP_IDLE + (P_TOP_CHARGE - P_TOP_IDLE) * pw;
    p.max = Math.max(0.15, (top - p.y0) / p.vy);
    p.base = 0.75 + 0.25 * pw;
    p.s = (0.6 + Math.random() * 0.9) * (1 + pw * 0.7);
    p.spin = Math.random() * 6.28;
    p.on = true;
  };

  return {
    grp,
    mats,
    power: () => pw,
    charge(l = 2) { phase = 'charge'; lead = Math.max(0.2, l); chargeT = 0; },
    release(fade = 1) { phase = 'fade'; fadeDur = Math.max(0.15, fade); fadeT = 0; },
    update(dt, t) {
      // ── автомат заряда ──
      if (phase === 'charge') {
        chargeT += dt;
        pw = Math.min(1, chargeT / lead);
        pw = pw * pw * (3 - 2 * pw);            // мягкое нарастание
      } else if (phase === 'fade') {
        fadeT += dt;
        const k = Math.min(1, fadeT / fadeDur);
        pw = 1 - k * k;                          // затухание
        if (k >= 1) { phase = 'idle'; pw = 0; }
      }

      // ── голограмма: видна только когда печать заряжена ──
      holo.visible = pw > 0.01;
      if (holo.visible) {
        holo.position.y = 0.06 + (HOLO_TOP - 0.06) * pw + Math.sin(t * 1.6) * 0.04 * pw;
        holo.rotation.y = t * (0.55 + pw * 2.4);            // раскручивается к спавну
        const op = 0.34 * pw;
        for (const m of holoMats) { m.opacity = op; m.emissiveIntensity = (0.9 + pw * 1.6); }
      }
      // ── угли печати: ярче по мере заряда ──
      const pulse = 0.9 + 0.45 * Math.sin(t * 2.2) + 0.12 * Math.sin(t * 11);
      for (const m of mats) {
        if (m.transparent) continue;                        // голограмму уже выставили
        m.emissiveIntensity = pulse * (1 + pw * 1.8);
      }

      // ── частицы: гуще во время заряда ──
      spawnT -= dt;
      if (spawnT <= 0) {
        const free = parts.find((p) => !p.on);
        if (free) respawn(free);
        spawnT = 0.14 - 0.115 * pw;                          // 0.14с в покое → 0.025с при спавне
      }
      let live = 0;
      for (const p of parts) {
        if (!p.on) continue;
        p.life += dt;
        const k = p.life / p.max;
        if (k >= 1) { p.on = false; continue; }
        p.spin += dt * 3;
        emberCol.setHex(PAL.runeHot).multiplyScalar(p.base * (1 - k * k));
        cloud.put(live++, p.x, p.y0 + p.vy * p.life, p.z, p.s, 0, p.spin, emberCol);
      }
      cloud.commit(live);
    },
  };
}

/** совместимость со старым вызовом (только статичная печать) */
export function buildPentagram(radius = 1.75): { grp: THREE.Group; mats: THREE.MeshStandardMaterial[] } {
  const p = createPentagram(radius);
  return { grp: p.grp, mats: p.mats };
}

/** Снаряд ракетницы: корпус, боеголовка, стабилизаторы. Летит носом вперёд (−Z). */
export function buildRocket(): THREE.Group {
  const g = new THREE.Group();
  const body = box(0.14, 0.14, 0.46, 0x9a9a90); g.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.14),
    new THREE.MeshStandardMaterial({ color: 0xd8541e, emissive: 0xff5a1e, emissiveIntensity: 1.6, roughness: 1 }),
  );
  head.position.z = -0.28; g.add(head);
  for (const [fx, fy] of [[0.11, 0], [-0.11, 0], [0, 0.11], [0, -0.11]] as const) {
    const fin = box(fx ? 0.06 : 0.16, fy ? 0.06 : 0.16, 0.12, 0x5a5a52);
    fin.position.set(fx, fy, 0.2); g.add(fin);
  }
  return g;
}

// ── реквизит арены ────────────────────────────────────────────────────────
export type PropKind = 'torch' | 'pillar' | 'skull' | 'wall' | 'floor' | 'lava';
export const PROP_INFO: Record<PropKind, string> = {
  torch: 'ФАКЕЛ — мерцающий источник света',
  pillar: 'ПИЛОН — укрытие (5 шт. на арене)',
  skull: 'ЧЕРЕП — деталь центрального пилона',
  wall: 'СТЕНА — секция с отбойником',
  floor: 'ПОЛ — шахматная плита 4×4',
  lava: 'ЛАВА — светящийся край мира',
};
export function buildProp(kind: PropKind): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'torch') {
    const br = box(0.3, 0.9, 0.3, 0x2a2220); br.position.y = 0.45; g.add(br);
    const fl = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.7, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a20, emissiveIntensity: 1.6, roughness: 1 }),
    );
    fl.position.y = 1.15; fl.userData.flame = 1; g.add(fl);
  } else if (kind === 'pillar') {
    const col = box(3.2, 5, 3.2, PAL.pillar); col.position.y = 2.5; g.add(col);
    const cap = box(3.7, 0.5, 3.7, PAL.trim); cap.position.y = 5.2; g.add(cap);
    const base = box(3.8, 0.4, 3.8, PAL.trim); base.position.y = 0.2; g.add(base);
  } else if (kind === 'skull') {
    // лицом в −Z. Собран по-настоящему: свод, надбровье, скулы, зубы, челюсть —
    // одинаково читается и деталью пилона, и в упор на титуле.
    const BONE = 0xd8d2c0, BONE_D = 0xb8b2a0, HOLE = 0x140808;
    const cr = box(1.06, 0.82, 0.92, BONE); cr.position.set(0, 0.86, 0.02); g.add(cr);
    const bk = box(0.86, 0.5, 0.24, BONE_D); bk.position.set(0, 0.9, 0.5); g.add(bk);   // затылок
    const brow = box(1.12, 0.16, 0.16, BONE_D); brow.position.set(0, 1.06, -0.42); g.add(brow);
    for (const ex of [-0.27, 0.27]) {
      const e = box(0.32, 0.34, 0.26, HOLE); e.position.set(ex, 0.82, -0.38); g.add(e);
      // тлеющий уголёк в глазнице — светится сам, без внешних ламп
      // уголёк ставим НА переднюю грань глазницы, иначе она его загораживает
      const em = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.19, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xff5a1e, emissive: 0xff4a16, emissiveIntensity: 2.8, roughness: 1 }),
      );
      em.position.set(ex, 0.82, -0.52); em.userData.ember = 1; g.add(em);
      const ch = box(0.22, 0.3, 0.3, BONE_D); ch.position.set(ex * 1.9, 0.62, -0.2); g.add(ch);  // скула
    }
    const nz = box(0.16, 0.22, 0.18, HOLE); nz.position.set(0, 0.56, -0.42); g.add(nz);
    const mx = box(0.78, 0.22, 0.66, BONE); mx.position.set(0, 0.4, -0.1); g.add(mx);   // верхняя челюсть
    for (let i = -2; i <= 2; i++) {                                                      // зубы
      const t = box(0.11, 0.14, 0.12, i % 2 ? BONE_D : BONE);
      t.position.set(i * 0.15, 0.26, -0.38); g.add(t);
    }
    const j = box(0.72, 0.2, 0.6, BONE_D); j.position.set(0, 0.11, -0.06); g.add(j);     // нижняя челюсть
    const jf = box(0.5, 0.14, 0.14, BONE_D); jf.position.set(0, 0.14, -0.36); g.add(jf);
  } else if (kind === 'wall') {
    const w = box(4, 7, 1, PAL.wall); w.position.y = 3.5; g.add(w);
    const t = box(4.1, 0.5, 1.1, PAL.trim); t.position.y = 1.1; g.add(t);
    const top = box(4.3, 0.6, 1.3, PAL.trim); top.position.y = 7; g.add(top);
  } else if (kind === 'floor') {
    for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++) {
      const t = box(2, 0.3, 2, (ix + iz) % 2 ? PAL.floorA : PAL.floorB);
      t.position.set(ix * 2 - 1, 0, iz * 2 - 1);
      g.add(t);
    }
  } else {
    const l = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: PAL.lava, emissive: 0xff5a1e, emissiveIntensity: 0.9, roughness: 1 }),
    );
    g.add(l);
  }
  return g;
}
