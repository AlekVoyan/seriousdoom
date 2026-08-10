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

export type PickupKind = 'med' | 'arm' | 'bul' | 'box' | 'shl';
export const PICKUP_INFO: Record<PickupKind, { name: string; give: string }> = {
  med: { name: 'АПТЕЧКА', give: '+25 здоровья' },
  arm: { name: 'БРОНЯ', give: '+35 брони' },
  bul: { name: 'ОБОЙМА', give: '+40 патронов' },
  box: { name: 'ЯЩИК ПАТРОНОВ', give: '+110 патронов (корм пулемёта)' },
  shl: { name: 'ДРОБЬ', give: '+12 дроби' },
};

export const WEAPONS = [
  { name: 'ПИСТОЛЕТ', dmg: 15, cd: 0.36, spread: 0.02, pellets: 1, ammo: 'bul' as const, use: 1, unlock: 'старт' },
  { name: 'ДРОБОВИК', dmg: 10, cd: 0.82, spread: 0.13, pellets: 7, ammo: 'shl' as const, use: 1, unlock: 'волна 3' },
  { name: 'ПУЛЕМЁТ', dmg: 11, cd: 0.09, spread: 0.055, pellets: 1, ammo: 'bul' as const, use: 1, unlock: 'волна 6' },
];

// ── монстры ───────────────────────────────────────────────────────────────
export function buildMonster(k: MK, vet: boolean): { grp: THREE.Group; parts: THREE.Mesh[] } {
  const d = MDEFS[k];
  const grp = new THREE.Group();
  const parts: THREE.Mesh[] = [];
  // ветеран: цвет уходит в раскалённый багрянец — отличие видно за полкарты
  const base = new THREE.Color(d.color);
  if (vet) base.lerp(new THREE.Color(0xb00c0c), 0.68).offsetHSL(0, 0.25, -0.04);
  const col = base.getHex();
  const VET_HOT = 0xff5a20;   // раскалённые накладки
  const VET_DARK = 0x2a0e0a;  // обугленная броня
  const add = (w: number, h: number, dd: number, c: number, x: number, y: number, z: number) => {
    const m = box(w, h, dd, c);
    m.position.set(x, y, z);
    const mm = m.material as THREE.MeshLambertMaterial;
    mm.emissive = new THREE.Color(c).multiplyScalar(vet ? 0.42 : 0.22);
    grp.add(m); parts.push(m);
    return m;
  };
  /** раскалённая деталь ветерана (светится сама) */
  const hot = (w: number, h: number, dd: number, x: number, y: number, z: number, c = VET_HOT) => {
    const m = box(w, h, dd, c);
    m.position.set(x, y, z);
    const mm = m.material as THREE.MeshLambertMaterial;
    mm.emissive = new THREE.Color(c).multiplyScalar(1.1);
    grp.add(m); parts.push(m);
    return m;
  };
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
    const wl = add(0.9, 0.1, 0.5, col, -0.66, 0.45, 0.05);
    const wr = add(0.9, 0.1, 0.5, col, 0.66, 0.45, 0.05);
    wl.userData.wing = -1; wr.userData.wing = 1;
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
      for (let i = 0; i < 4; i++) hot(0.16, 0.3 + i * 0.06, 0.16, 0, 1.5 + i * 0.02, 0.28 - i * 0.19);
      hot(0.4, 0.4, 0.1, 0, 1.25, -0.4, 0xff2a10);
      add(0.24, 0.5, 0.24, VET_DARK, -0.78, 0.8, 0);   // наплечники
      add(0.24, 0.5, 0.24, VET_DARK, 0.78, 0.8, 0);
    } else if (k === 'boom') {
      // пояс шашек и вторая пара зарядов — взрыв мощнее
      for (let i = -1; i <= 1; i++) hot(0.16, 0.3, 0.16, i * 0.24, 0.5, -0.3, 0xff7a20);
      add(0.8, 0.14, 0.55, VET_DARK, 0, 0.42, 0);
      for (const sx of [-0.62, 0.62]) {
        add(0.3, 0.3, 0.3, 0x1a1a1e, sx, 0.55, -0.1);
        hot(0.1, 0.14, 0.1, sx, 0.76, -0.1, 0xff2a10);
      }
      hot(0.36, 0.1, 0.3, 0, 1.46, 0, 0xff2a10);        // тлеющий обрубок шеи
    } else if (k === 'kleer') {
      // костяная корона из рогов + раскалённые глазницы + шпоры
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.34;
        add(0.1, 0.32 + Math.abs(i) * -0.05, 0.1, 0xf0e8d0, Math.sin(a) * 0.24, 2.02, Math.cos(a) * 0.1 - 0.02);
      }
      hot(0.13, 0.15, 0.1, -0.11, 1.76, -0.22, 0xff2a10);
      hot(0.13, 0.15, 0.1, 0.11, 1.76, -0.22, 0xff2a10);
      for (const sx of [-0.42, 0.42]) hot(0.09, 0.24, 0.09, sx, 0.62, -0.26);
      add(0.36, 0.5, 0.2, VET_DARK, 0, 1.2, 0.16);      // нагрудная пластина
    } else if (k === 'bull') {
      // вторая пара рогов, лобовая броня, раскалённые ноздри и хребет
      for (const sx of [-0.34, 0.34]) {
        add(0.14, 0.14, 0.44, 0xe8e0c8, sx, 1.05, -1.0);
        add(0.14, 0.22, 0.14, 0xe8e0c8, sx, 1.16, -1.2);
      }
      add(0.86, 0.3, 0.2, VET_DARK, 0, 1.42, -0.92);    // налобник
      hot(0.12, 0.1, 0.12, -0.16, 0.95, -1.14, 0xff7a20);
      hot(0.12, 0.1, 0.12, 0.16, 0.95, -1.14, 0xff7a20);
      for (let i = 0; i < 3; i++) hot(0.13, 0.26, 0.13, 0, 1.5, -0.2 + i * 0.34);  // хребет
    } else if (k === 'harpy') {
      // второй ярус крыльев, гребень и раскалённый хвост
      const wl2 = add(0.66, 0.09, 0.36, col, -0.5, 0.18, 0.16);
      const wr2 = add(0.66, 0.09, 0.36, col, 0.5, 0.18, 0.16);
      wl2.userData.wing = -1; wr2.userData.wing = 1;
      for (let i = 0; i < 3; i++) hot(0.09, 0.18 - i * 0.03, 0.09, 0, 0.9, -0.02 + i * 0.14);
      hot(0.12, 0.1, 0.5, 0, 0.28, 0.44, 0xff5a20);     // хвост-уголёк
    } else {
      // третья пушка, антенна, реактор и наплечная броня
      add(0.34, 0.34, 0.7, 0x2c333c, 0, 2.05, -0.5);
      add(0.2, 0.2, 0.2, 0x1a1e24, 0, 2.05, -0.92);
      add(0.1, 0.7, 0.1, 0x2c333c, 0.42, 2.95, 0);
      hot(0.14, 0.14, 0.14, 0.42, 3.34, 0, 0xff2a10);   // маячок на антенне
      hot(0.42, 0.42, 0.16, 0, 1.5, 0.46, 0xff5a20);    // реактор в спине
      for (const sx of [-0.62, 0.62]) add(0.36, 0.22, 0.6, VET_DARK, sx, 2.1, 0);
    }
  }
  return { grp, parts };
}

// ── оружие в руках ────────────────────────────────────────────────────────
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
  } else {
    add(0.22, 0.22, 0.9, 0x4a505a, 0.18, -0.2, -0.9);
    for (const bx of [-0.075, 0.075]) add(0.08, 0.08, 1.0, 0x353b44, 0.18 + bx, -0.2, -1.05);
    add(0.25, 0.28, 0.26, 0x353b44, 0.18, -0.33, -0.45);
    add(0.28, 0.1, 0.1, 0x5a606a, 0.18, -0.06, -0.66);
  }
  return { grp, parts };
}

// ── пикапы ────────────────────────────────────────────────────────────────
export function buildPickup(kind: PickupKind): THREE.Group {
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
