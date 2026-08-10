import * as THREE from 'three';
import {
  MDEFS, PAL, PICKUP_INFO, PROP_INFO, WEAPONS,
  buildMonster, buildWeapon, buildPickup, createPentagram, buildProp,
  type MK, type PickupKind, type PropKind,
} from './games/doomModels';
import { createDoomAudio, SFX_LIST, type SfxId, type SfxLoop } from './core/audioDoom';
import { createMusicDirector, TRACK_INFO, type TrackId } from './core/musicDirector';

/**
 * Витрина ассетов «Фаєрвола» (/assets.html).
 * Один WebGL-контекст на всю страницу: для каждой карточки выставляется
 * scissor+viewport по её прямоугольнику и рендерится своя мини-сцена.
 * Модели и звуки импортируются из тех же модулей, что использует игра.
 */

const canvas = document.getElementById('bgcanvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setScissorTest(true);

interface View {
  el: HTMLElement;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  pivot: THREE.Group;
  spin: number;
  tick?: (t: number) => void;
}
const views: View[] = [];

function makeCard(host: HTMLElement, title: string, sub: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  const view = document.createElement('div');
  view.className = 'view';
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `<div class="nm">${title}</div><div class="st">${sub}</div>`;
  card.appendChild(view); card.appendChild(meta);
  host.appendChild(card);
  return view;
}

/** мини-сцена: тёплый ключевой + холодная подсветка + красный контровой (как в аду арены) */
function makeView(el: HTMLElement, obj: THREE.Object3D, dist: number, height: number, spin = 0.5): View {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xff9a6a, 1.5); key.position.set(3, 6, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0x8aa0ff, 0.5); fill.position.set(-5, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff3a1a, 0.7); rim.position.set(0, 2, -6); scene.add(rim);
  const pivot = new THREE.Group();
  pivot.add(obj);
  scene.add(pivot);
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  cam.position.set(0, height, dist);
  cam.lookAt(0, height * 0.55, 0);
  const v: View = { el, scene, cam, pivot, spin };
  views.push(v);
  return v;
}

// ── МОНСТРЫ ───────────────────────────────────────────────────────────────
const gMon = document.getElementById('g-mon')!;
(Object.keys(MDEFS) as MK[]).forEach((k) => {
  for (const vet of [false, true]) {
    const d = MDEFS[k];
    const title = vet ? `${d.name} <span class="vet">· ВЕТЕРАН</span>` : d.name;
    const hp = Math.round(d.hp * (vet ? 1.7 : 1));
    const sub = `${d.role}<br><b>HP</b> ${hp} · <b>скорость</b> ${(d.speed * (vet ? 1.15 : 1)).toFixed(1)}`
      + ` · <b>цена волны</b> ${d.cost}<br>`
      + (d.explode ? `<b>взрыв</b> ${d.explode}` : d.ranged ? '<b>дальний бой</b> файерболы' : `<b>урон</b> ${d.melee}`)
      + (d.flying ? ' · <b>летает</b>' : '');
    const el = makeCard(gMon, title, sub);
    const { grp } = buildMonster(k, vet);
    makeView(el, grp, d.h * 2.1 + 1.4, d.h * 0.62, 0.55);
  }
});

// ── ОРУЖИЕ ────────────────────────────────────────────────────────────────
const gWpn = document.getElementById('g-wpn')!;
WEAPONS.forEach((w, i) => {
  const dps = (w.dmg * w.pellets / w.cd).toFixed(0);
  const sub = `<b>урон</b> ${w.dmg}${w.pellets > 1 ? ` × ${w.pellets} дробин` : ''} · <b>темп</b> ${w.cd}с<br>`
    + `<b>DPS</b> ~${dps} · <b>боезапас</b> ${w.ammo === 'bul' ? 'патроны' : 'дробь'}<br><b>открывается</b> ${w.unlock}`;
  const el = makeCard(gWpn, `${i + 1} · ${w.name}`, sub);
  const { grp } = buildWeapon(i);
  // сдвигаем модель в центр карточки: она смоделирована от глаз игрока
  grp.position.set(-0.19, 0.24, 0.95);
  const holder = new THREE.Group(); holder.add(grp);
  makeView(el, holder, 2.4, 0.05, 0.7);
});

// ── ПИКАПЫ ────────────────────────────────────────────────────────────────
const gPick = document.getElementById('g-pick')!;
(Object.keys(PICKUP_INFO) as PickupKind[]).forEach((k) => {
  const info = PICKUP_INFO[k];
  const el = makeCard(gPick, info.name, info.give);
  makeView(el, buildPickup(k), 2.4, 0.45, 0.9);
});

// ── ПЕНТАГРАММА ───────────────────────────────────────────────────────────
const gPortal = document.getElementById('g-portal')!;
{
  const el = makeCard(gPortal, 'ПЕЧАТЬ СПАВНА',
    'звезда в ДВУХ кольцах, руны между ними<br>+ вращающаяся <b>голограмма</b> над полом<br>+ искры, гаснущие в полуметре<br><b>8 штук</b> по периметру арены');
  const pent = createPentagram(1.75);
  const v = makeView(el, pent.grp, 5.6, 2.1, 0.12);
  let last = 0;
  // витрина крутит полный цикл телеграфа: заряд 2с → монстр → угасание 1с → пауза
  let cyc = 0, stage = 0;
  v.tick = (t) => {
    const dt = Math.min(0.05, t - last); last = t;
    cyc += dt;
    if (stage === 0 && cyc > 1.4) { pent.charge(2); stage = 1; cyc = 0; }
    else if (stage === 1 && cyc > 2) { pent.release(1); stage = 2; cyc = 0; }
    else if (stage === 2 && cyc > 1.2) { stage = 0; cyc = 0; }
    pent.update(dt, t);
  };
  // подложка-пол, чтобы читалось свечение
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(7, 0.2, 7),
    new THREE.MeshStandardMaterial({ color: PAL.floorB, roughness: 1 }),
  );
  floor.position.y = -0.12;
  v.pivot.add(floor);
  const pl = new THREE.PointLight(0xff2a10, 1.6, 9, 1.8);
  pl.position.set(0, 1.1, 0);
  v.scene.add(pl);
}

// ── РЕКВИЗИТ ──────────────────────────────────────────────────────────────
const gProp = document.getElementById('g-prop')!;
(Object.keys(PROP_INFO) as PropKind[]).forEach((k) => {
  const txt = PROP_INFO[k];
  const el = makeCard(gProp, txt.split(' — ')[0], txt.split(' — ')[1] ?? '');
  const obj = buildProp(k);
  const dist = k === 'pillar' || k === 'wall' ? 13 : k === 'torch' ? 3.4 : 6;
  const hgt = k === 'pillar' || k === 'wall' ? 3.2 : k === 'torch' ? 1.0 : 0.5;
  const v = makeView(el, obj, dist, hgt, 0.45);
  if (k === 'torch') {
    const fl = obj.children.find((c) => c.userData.flame) as THREE.Mesh | undefined;
    const lightT = new THREE.PointLight(0xff8a3a, 2, 8, 1.6);
    lightT.position.set(0, 1.3, 0);
    v.scene.add(lightT);
    v.tick = (t) => {
      const f = 0.75 + 0.35 * Math.abs(Math.sin(t * 9)) + 0.15 * Math.sin(t * 23);
      if (fl) fl.scale.set(0.9 + f * 0.2, f, 0.9 + f * 0.2);
      lightT.intensity = 1.6 * f;
    };
  }
});

// ── ПАЛИТРА ───────────────────────────────────────────────────────────────
const palEl = document.getElementById('pal')!;
const palNames: Record<string, string> = {
  floorA: 'пол A', floorB: 'пол B', wall: 'стена', trim: 'отбойник', lava: 'лава',
  pillar: 'пилон', gibRed: 'гибы (кровь)', hellSky: 'небо ада', rune: 'руна', runeHot: 'руна (ядро)',
};
for (const [k, v] of Object.entries(PAL)) {
  const hex = '#' + (v as number).toString(16).padStart(6, '0');
  const d = document.createElement('div');
  d.className = 'sw';
  d.innerHTML = `<i style="background:${hex}"></i><span>${palNames[k] ?? k}<br>${hex}</span>`;
  palEl.appendChild(d);
}

// ── ЗВУК ──────────────────────────────────────────────────────────────────
const sfx = createDoomAudio();
const gSfx = document.getElementById('g-sfx')!;
const groups = [...new Set(SFX_LIST.map((s) => s.group))];
for (const grpName of groups) {
  const h = document.createElement('div');
  h.className = 'group-t';
  h.textContent = grpName;
  gSfx.appendChild(h);
  const wrap = document.createElement('div');
  wrap.className = 'sfxgrid';
  gSfx.appendChild(wrap);
  for (const s of SFX_LIST.filter((x) => x.group === grpName)) {
    const b = document.createElement('button');
    b.className = 'sfx';
    // вой камикадзе в игре крутится петлёй — здесь его и надо слушать петлёй,
    // иначе шва не проверить
    const looped = s.id === 'boomWail';
    const mark = looped ? '↻' : '▸';
    b.innerHTML = `<div class="t">${mark} ${s.name}</div><div class="h">${s.how}</div>`;
    if (looped) {
      let live: SfxLoop | null = null;
      b.onclick = () => {
        if (live) { live.stop(0.3); live = null; b.classList.remove('on'); return; }
        sfx.setListener(0, 0, 0);
        live = sfx.loop(s.id as SfxId, { x: 0, z: -1 });
        b.classList.add('on');
      };
    } else {
      b.onclick = () => sfx.play(s.id as SfxId);
    }
    wrap.appendChild(b);
  }
}
// синтезированный резервный луп (играет, если дорожки не загрузились)
const mBtn = document.getElementById('music') as HTMLButtonElement;
let playing = false;
mBtn.onclick = () => {
  playing = !playing;
  if (playing) { sfx.startMusic(); sfx.setIntensity(0.8); mBtn.textContent = '■ СТОП'; mBtn.classList.add('on'); }
  else { sfx.stopMusic(); mBtn.textContent = '▶ СИНТЕЗ-ЛУП (резерв)'; mBtn.classList.remove('on'); }
};
(document.getElementById('int0') as HTMLButtonElement).onclick = () => sfx.setIntensity(0.15);
(document.getElementById('int1') as HTMLButtonElement).onclick = () => sfx.setIntensity(1);

// ── треки из папки проекта ────────────────────────────────────────────────
// ── саундтрек с живыми кроссфейдами (тот же режиссёр, что в игре) ────────
const music = createMusicDirector(0.55);
const tracksEl = document.getElementById('tracks')!;
const bar = document.createElement('div');
bar.className = 'bar';
tracksEl.appendChild(bar);
const nowEl = document.createElement('div');
nowEl.className = 'st';
nowEl.style.marginTop = '10px';
nowEl.textContent = 'ничего не играет';
tracksEl.appendChild(nowEl);
const btns = new Map<TrackId, HTMLButtonElement>();
(Object.keys(TRACK_INFO) as TrackId[]).forEach((id) => {
  const info = TRACK_INFO[id];
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = info.name.toUpperCase();
  b.title = info.use;
  b.onclick = () => {
    music.play(id, { loop: id !== 'end', onEnd: id === 'end' ? () => music.play('chill') : undefined });
  };
  bar.appendChild(b);
  btns.set(id, b);
});
const stopB = document.createElement('button');
stopB.className = 'btn';
stopB.textContent = '■ СТОП';
stopB.onclick = () => music.stop(0.7);
bar.appendChild(stopB);
// подпись «что играет» + пояснение роли
window.setInterval(() => {
  const c = music.current();
  for (const [id, b] of btns) b.classList.toggle('on', id === c);
  nowEl.textContent = c ? `играет: ${c} — ${TRACK_INFO[c].use}` : 'ничего не играет';
}, 200);
const legend = document.createElement('table');
legend.innerHTML = '<tr><th>Дорожка</th><th>Когда звучит</th></tr>'
  + (Object.keys(TRACK_INFO) as TrackId[]).map((id) =>
      `<tr><td><b>${id}</b></td><td>${TRACK_INFO[id].use}</td></tr>`).join('');
tracksEl.appendChild(legend);

// ── рендер-цикл: scissor по карточкам ─────────────────────────────────────
function frame(ms: number) {
  const t = ms / 1000;
  const w = window.innerWidth, h = window.innerHeight;
  if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const v of views) {
    const r = v.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
    const bottom = h - r.bottom;
    renderer.setViewport(r.left, bottom, r.width, r.height);
    renderer.setScissor(r.left, bottom, r.width, r.height);
    v.cam.aspect = r.width / r.height;
    v.cam.updateProjectionMatrix();
    v.pivot.rotation.y = t * v.spin;
    v.tick?.(t);
    renderer.render(v.scene, v.cam);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
