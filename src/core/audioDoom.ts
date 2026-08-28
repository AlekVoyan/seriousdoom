/**
 * Звук шутера «Фаєрвол» — СЭМПЛЫ из библиотеки ../VoxEvasion-sfx.
 * Источники (см. её SOURCES.md):
 *   • Kenney — CC0 1.0 (public domain), атрибуция не требуется;
 *   • pro/*  — сгенерированы нашим же preset-pro.js, права наши.
 * Папка sounds/placeholder (рипы из коммерческих игр) НЕ используется.
 *
 * Файлы лежат в public/sfx, грузятся один раз и играются через WebAudio с
 * лёгкой расстройкой высоты, чтобы очереди не звучали механически.
 * Музыкальный луп остался синтезированным — как резерв для витрины ассетов.
 */

let sharedCtx: AudioContext | null = null;
/** общий AudioContext для всей игры (звук + музыка) — второй контекст ломает Safari */
export function getSharedAudioContext(): AudioContext { return getCtx(); }
function getCtx(): AudioContext {
  if (!sharedCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

function noiseBuffer(ctx: AudioContext, sec: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function reverbIR(ctx: AudioContext, sec: number, decay: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

export type SfxId =
  | 'pistol' | 'shotgun' | 'chaingun' | 'rocket' | 'dryClick' | 'weaponSwitch'
  | 'explosion' | 'fireball' | 'fireballHit'
  | 'gnaar' | 'boomWail' | 'kleerRattle' | 'kleerLeap' | 'bullSnort' | 'harpyFlap' | 'mechServo'
  | 'monsterPain' | 'monsterDie' | 'gib'
  | 'playerPain' | 'playerDie' | 'step' | 'heartbeat'
  | 'pickHealth' | 'pickArmor' | 'pickAmmo' | 'pickWeapon'
  | 'teleport' | 'menuMove' | 'menuSelect' | 'waveStart' | 'waveClear' | 'cash';

interface SfxDef { file: string; gain: number; vary: number; src: string }
/** id → файл в /sfx, громкость, разброс высоты, источник */
const SFX: Record<SfxId, SfxDef> = {
  pistol: { file: 'pistol.wav', gain: 1.66, vary: 0.06, src: 'OGA CC0 · выстрел CZ, обрезан строго по хлопку' },
  // дробовик должен быть самым громким из троицы: он и так бьёт реже всех
  shotgun: { file: 'shotgun.wav', gain: 2.4, vary: 0.05, src: 'собран: Kenney CC0 explosionCrunch + lowFreq + лязг помпы' },
  chaingun: { file: 'chaingun.wav', gain: 0.25, vary: 0.09, src: 'OGA CC0 · выстрел SKS, только атака (обрезан по хлопку)' },
  rocket: { file: 'rocket.wav', gain: 0.5, vary: 0.05, src: 'сгенерирован мной: щелчок запала + низкий толчок трубы + уходящий свист' },
  dryClick: { file: 'dryClick.ogg', gain: 1.3, vary: 0.03, src: 'Kenney CC0 · ui/click3' },
  weaponSwitch: { file: 'weaponSwitch.ogg', gain: 1.23, vary: 0.04, src: 'Kenney CC0 · rpg/metalLatch' },
  explosion: { file: 'explosion.wav', gain: 1.29, vary: 0.07, src: 'наш pro · mg_explode_boom' },
  fireball: { file: 'fireball.wav', gain: 0.94, vary: 0.08, src: 'Kenney CC0 · thrusterFire (струя пламени)' },
  fireballHit: { file: 'fireballHit.wav', gain: 1.23, vary: 0.06, src: 'Kenney CC0 · explosionCrunch + thrusterFire (в тон пуску)' },
  gnaar: { file: 'gnaar.wav', gain: 1.76, vary: 0.12, src: 'OGA CC0 · утробное ворчание монстра' },
  boomWail: { file: 'boomWail.wav', gain: 1.45, vary: 0.1, src: 'твой orr.wav → бесшовная петля 1.25 с (равномощный кроссфейд 0.35 с, срез ниже 70 Гц); в игре звучит непрерывно, пока камикадзе жив' },
  kleerRattle: { file: 'kleerRattle.ogg', gain: 1.69, vary: 0.12, src: 'Kenney CC0 · chipsCollide2' },
  kleerLeap: { file: 'kleerLeap.wav', gain: 1.57, vary: 0.08, src: 'OGA CC0 · визг твари + свист воздуха' },
  bullSnort: { file: 'bullSnort.wav', gain: 0.86, vary: 0.09, src: 'OGA CC0 · рёв зверя, сильно приспущен + подгруд' },
  harpyFlap: { file: 'harpyFlap.ogg', gain: 0.76, vary: 0.14, src: 'Kenney CC0 · rpg/cloth3' },
  mechServo: { file: 'mechServo.wav', gain: 0.6, vary: 0.07, src: 'Kenney CC0 · engineCircular (круговой привод)' },
  monsterPain: { file: 'monsterPain.wav', gain: 0.37, vary: 0.14, src: 'наш pro · mg_hit' },
  monsterDie: { file: 'monsterDie.wav', gain: 0.94, vary: 0.1, src: 'OGA CC0 · предсмертный рёв монстра + хруст' },
  gib: { file: 'gib.wav', gain: 1.14, vary: 0.12, src: 'наш pro · splash_big' },
  playerPain: { file: 'playerPain.wav', gain: 1.07, vary: 0.08, src: 'Kenney CC0 · impactPunch_heavy (удар в корпус)' },
  playerDie: { file: 'playerDie.wav', gain: 1.03, vary: 0, src: 'Kenney CC0 · lowFreq explosion + crunch (глубокий обвал)' },
  step: { file: 'step.wav', gain: 0.21, vary: 0.13, src: 'наш pro · footstep_run' },
  heartbeat: { file: 'heartbeat.wav', gain: 1.16, vary: 0, src: 'наш pro · heartbeat_sub_loop' },
  pickHealth: { file: 'pickHealth.ogg', gain: 0.98, vary: 0.04, src: 'Kenney CC0 · powerUp7' },
  pickArmor: { file: 'pickArmor.wav', gain: 0.62, vary: 0.05, src: 'Kenney CC0 · металл + короткий блип' },
  pickAmmo: { file: 'pickAmmo.ogg', gain: 1.82, vary: 0.07, src: 'Kenney CC0 · rpg/handleCoins' },
  pickWeapon: { file: 'pickWeapon.wav', gain: 1.73, vary: 0, src: 'Kenney CC0 · лязг затвора + подъём' },
  teleport: { file: 'teleport.wav', gain: 0.6, vary: 0.06, src: 'Kenney CC0 · forceField (гул портала); играется от печати, так что дальние спавны едва слышны' },
  menuMove: { file: 'menuMove.ogg', gain: 1.22, vary: 0.05, src: 'Kenney CC0 · ui/rollover2' },
  menuSelect: { file: 'menuSelect.ogg', gain: 1.51, vary: 0, src: 'Kenney CC0 · ui/click1' },
  waveStart: { file: 'waveStart.wav', gain: 0.62, vary: 0, src: 'наш pro · stinger_start_thump' },
  waveClear: { file: 'waveClear.wav', gain: 1.11, vary: 0, src: 'сгенерирован мной: пауэр-аккорд на пилах + бочка, разрешение вверх' },
  cash: { file: 'cash.wav', gain: 1.24, vary: 0.05, src: 'наш pro · coin_cash' },
};

export interface SfxInfo { id: SfxId; name: string; group: string; how: string }
const NAMES: Record<SfxId, [string, string]> = {
  pistol: ['Пистолет', 'Оружие'], shotgun: ['Дробовик', 'Оружие'], chaingun: ['Пулемёт', 'Оружие'],
  rocket: ['Пуск ракеты', 'Оружие'],
  dryClick: ['Сухой щелчок', 'Оружие'], weaponSwitch: ['Смена ствола', 'Оружие'],
  explosion: ['Взрыв бомбиста', 'Взрывы'], fireball: ['Пуск файербола', 'Взрывы'], fireballHit: ['Попадание файербола', 'Взрывы'],
  gnaar: ['Рык гнара', 'Монстры'], boomWail: ['Вой бомбиста', 'Монстры'], kleerRattle: ['Стук костей', 'Монстры'],
  kleerLeap: ['Прыжок скакуна', 'Монстры'], bullSnort: ['Рёв рогача', 'Монстры'], harpyFlap: ['Крылья гарпии', 'Монстры'],
  mechServo: ['Сервоприводы', 'Монстры'], monsterPain: ['Монстру больно', 'Монстры'], monsterDie: ['Смерть монстра', 'Монстры'],
  gib: ['Разлёт кубов', 'Монстры'],
  playerPain: ['Игроку больно', 'Игрок'], playerDie: ['Смерть игрока', 'Игрок'], step: ['Шаг', 'Игрок'], heartbeat: ['Сердцебиение', 'Игрок'],
  pickHealth: ['Аптечка', 'Пикапы'], pickArmor: ['Броня', 'Пикапы'], pickAmmo: ['Патроны', 'Пикапы'], pickWeapon: ['Новое оружие', 'Пикапы'],
  teleport: ['Портал (спавн)', 'Мир и UI'], menuMove: ['Меню: перебор', 'Мир и UI'], menuSelect: ['Меню: выбор', 'Мир и UI'],
  waveStart: ['Старт волны', 'Мир и UI'], waveClear: ['Волна зачищена', 'Мир и UI'], cash: ['Гонорар', 'Мир и UI'],
};
export const SFX_LIST: SfxInfo[] = (Object.keys(SFX) as SfxId[]).map((id) => ({
  id, name: NAMES[id][0], group: NAMES[id][1], how: SFX[id].src,
}));

/** точка в мире, откуда исходит звук (координаты арены) */
export interface SfxPos { x: number; z: number }

/** непрерывный голос движущегося источника (вой камикадзе) */
export interface SfxLoop {
  /** источник сдвинулся — звать каждый кадр */
  move(x: number, z: number): void;
  /** погасить и снять голос */
  stop(fade?: number): void;
  /** достался ли голос: при выбранном лимите ручка пустая */
  isLive(): boolean;
}

export interface DoomAudio {
  /** без `at` звук «в голове» игрока (оружие, боль, UI); с `at` — из точки арены */
  play(id: SfxId, at?: SfxPos): void;
  /** зациклить звук на источнике; вернёт ручку — двигать и гасить */
  loop(id: SfxId, at: SfxPos): SfxLoop;
  /** позиция и поворот слушателя; звать раз в кадр до play */
  setListener(x: number, z: number, yaw: number): void;
  startMusic(): void;
  stopMusic(): void;
  setIntensity(v: number): void;
  dispose(): void;
}

export function createDoomAudio(): DoomAudio {
  const ctx = getCtx();
  void ctx.resume();
  const now = () => ctx.currentTime;

  const bus = ctx.createGain(); bus.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 20; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
  const conv = ctx.createConvolver(); conv.buffer = reverbIR(ctx, 1.4, 3.4);
  const dry = ctx.createGain(); dry.gain.value = 0.9;
  const wet = ctx.createGain(); wet.gain.value = 0.16;   // лёгкий «зал» арены
  bus.connect(dry); dry.connect(comp);
  bus.connect(conv); conv.connect(wet); wet.connect(comp);
  comp.connect(ctx.destination);

  // ── загрузка сэмплов ──
  const buffers = new Map<SfxId, AudioBuffer>();
  let disposed = false;
  void (async () => {
    await Promise.all((Object.keys(SFX) as SfxId[]).map(async (id) => {
      try {
        const res = await fetch(`/sfx/${SFX[id].file}`);
        if (!res.ok) throw new Error(String(res.status));
        buffers.set(id, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch (e) {
        console.warn(`[sfx] не загрузился ${id}:`, e);
      }
    }));
  })();

  // ── слушатель: позиция и направление взгляда игрока ──
  // в doom.ts вперёд = (-sin yaw, -cos yaw), вправо = (cos yaw, -sin yaw)
  let lx = 0, lz = 0, lFx = 0, lFz = -1, lRx = 1, lRz = 0;
  const setListener = (x: number, z: number, yaw: number) => {
    lx = x; lz = z;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    lFx = -s; lFz = -c;
    lRx = c; lRz = -s;
    refreshLoops();
  };
  /** затухание: до REF метров в полную силу, дальше обратно-пропорционально */
  const REF = 4.5, ROLL = 0.62, MAX_DIST = 58;
  const hasPanner = typeof ctx.createStereoPanner === 'function';

  /** всё, что даёт источнику место в пространстве: сила, панорама, глухота, хвост */
  const spatial = (x: number, z: number) => {
    const dx = x - lx, dz = z - lz;
    const dist = Math.hypot(dx, dz);
    const att = REF / (REF + ROLL * Math.max(0, dist - REF));
    let pan = 0;
    if (dist > 0.4) {
      const side = (dx * lRx + dz * lRz) / dist;
      // вплотную панораму не раскачиваем — иначе источник «прыгает» между ушами
      pan = Math.max(-1, Math.min(1, side * Math.min(1, dist / 1.6) * 0.92));
    }
    // воздух съедает верх: чем дальше, тем глуше
    const cut = dist > 8 ? Math.max(1300, 20000 * Math.pow(0.5, (dist - 8) / 7)) : 20000;
    // дальний источник — больше «зала», это и продаёт дистанцию
    const wet = dist > 6 ? Math.min(1.6, (dist - 6) / 22) : 0;
    return { dist, att, pan, cut, wet };
  };

  // ограничитель наложений: не больше N одновременных копий одного звука
  const active = new Map<SfxId, number>();

  const play = (id: SfxId, at?: SfxPos) => {
    if (disposed) return;
    void ctx.resume();
    const def = SFX[id];
    const buf = buffers.get(id);
    if (!buf) return;                       // ещё грузится — молча пропускаем

    // ── пространство: громкость, панорама и глухота от расстояния ──
    let vol = def.gain, pan = 0, dist = 0, cut = 20000, wet = 0;
    if (at) {
      const sp = spatial(at.x, at.z);
      if (sp.dist > MAX_DIST) return;       // за краем арены — не тратим голос
      vol *= sp.att;
      if (vol < 0.015) return;              // всё равно не слышно
      dist = sp.dist; pan = sp.pan; cut = sp.cut; wet = sp.wet;
    }

    const n = active.get(id) ?? 0;
    if (n > 4) return;                      // защита от «каши» на очередях
    active.set(id, n + 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (def.vary) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * def.vary;
    // длинные лупы (мотор, сердце) обрезаем до внятного огрызка
    const maxLen = id === 'mechServo' ? 0.7 : id === 'heartbeat' ? 1.1 : buf.duration;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (maxLen < buf.duration) {
      g.gain.setValueAtTime(vol, now() + maxLen - 0.15);
      g.gain.linearRampToValueAtTime(0.0001, now() + maxLen);
    }

    // цепочка: [ФНЧ вдали] → [панорама] → громкость → шина (+ доп. хвост вдали)
    let head: AudioNode = g;
    const extra: AudioNode[] = [];
    if (at && hasPanner && pan !== 0) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      pn.connect(head); head = pn; extra.push(pn);
    }
    if (at && dist > 8) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cut;
      lp.connect(head); head = lp; extra.push(lp);
    }
    g.connect(bus);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      g.connect(send); send.connect(conv); extra.push(send);
    }
    src.connect(head);
    src.start(now(), 0, maxLen);
    src.onended = () => {
      active.set(id, Math.max(0, (active.get(id) ?? 1) - 1));
      try { src.disconnect(); g.disconnect(); for (const nd of extra) nd.disconnect(); } catch { /* noop */ }
    };
  };

  // ── зацикленные голоса движущихся источников ──
  interface LiveLoop {
    id: SfxId; src: AudioBufferSourceNode; g: GainNode; base: number;
    pan: StereoPannerNode | null; lp: BiquadFilterNode; send: GainNode;
    x: number; z: number; dead: boolean;
  }
  const loops: LiveLoop[] = [];
  const LOOP_MAX = 4;                 // больше — каша, а не хор
  const SMOOTH = 0.05;                // сглаживание, иначе на движении «зиппер»
  const NOOP: SfxLoop = { move() {}, stop() {}, isLive: () => false };

  /** пересчёт всех живых голосов под новое положение слушателя */
  const refreshLoops = () => {
    const t = now();
    for (const L of loops) {
      if (L.dead) continue;
      const sp = spatial(L.x, L.z);
      L.g.gain.setTargetAtTime(L.base * sp.att, t, SMOOTH);
      if (L.pan) L.pan.pan.setTargetAtTime(sp.pan, t, SMOOTH);
      L.lp.frequency.setTargetAtTime(sp.cut, t, SMOOTH);
      L.send.gain.setTargetAtTime(sp.wet, t, SMOOTH);
    }
  };

  const loop = (id: SfxId, at: SfxPos): SfxLoop => {
    if (disposed) return NOOP;
    void ctx.resume();
    const buf = buffers.get(id);
    if (!buf) return NOOP;                                  // ещё грузится
    let n = 0;
    for (const L of loops) if (L.id === id && !L.dead) n++;
    if (n >= LOOP_MAX) return NOOP;

    const def = SFX[id];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // расстройка высоты: несколько воплей разом не сливаются в один голос
    if (def.vary) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * def.vary;
    src.loopStart = 0; src.loopEnd = buf.duration;

    const sp = spatial(at.x, at.z);
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = sp.cut;
    const pan = hasPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = sp.pan;
    const send = ctx.createGain(); send.gain.value = sp.wet;

    // плавный вход, чтобы вой не «включался» щелчком
    const t = now();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setTargetAtTime(def.gain * sp.att, t, 0.12);

    src.connect(lp);
    if (pan) { lp.connect(pan); pan.connect(g); } else { lp.connect(g); }
    g.connect(bus);
    g.connect(send); send.connect(conv);
    // фаза внутри петли случайная — иначе все камикадзе орут в унисон
    src.start(t, Math.random() * buf.duration);

    const L: LiveLoop = { id, src, g, base: def.gain, pan, lp, send, x: at.x, z: at.z, dead: false };
    loops.push(L);

    return {
      move(x, z) { L.x = x; L.z = z; },
      isLive: () => !L.dead,
      stop(fade = 0.18) {
        if (L.dead) return;
        L.dead = true;
        const tt = now();
        g.gain.cancelScheduledValues(tt);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), tt);
        g.gain.linearRampToValueAtTime(0.0001, tt + fade);
        try { src.stop(tt + fade + 0.05); } catch { /* уже остановлен */ }
        window.setTimeout(() => {
          try { src.disconnect(); lp.disconnect(); pan?.disconnect(); g.disconnect(); send.disconnect(); } catch { /* noop */ }
          const ix = loops.indexOf(L);
          if (ix >= 0) loops.splice(ix, 1);
        }, (fade + 0.25) * 1000);
      },
    };
  };

  // ── резервный синтез-луп (используется витриной ассетов) ──
  const NOISE = noiseBuffer(ctx, 2);
  const sNoise = (at: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number) => {
    const s = ctx.createBufferSource(); s.buffer = NOISE; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(at); s.stop(at + dur + 0.05);
  };
  const sTone = (at: number, dur: number, peak: number, f0: number, f1: number, type: OscillatorType = 'sine', detune = 0) => {
    const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    o.connect(g).connect(bus);
    o.start(at); o.stop(at + dur + 0.05);
  };
  let musicOn = false, intensity = 0, stepIx = 0, timer = 0;
  const RIFF = [0, 0, 3, 0, 5, 0, 3, -2];
  const tick = () => {
    if (!musicOn || disposed) return;
    const t = now(), sd = 0.16;
    const f = 55 * Math.pow(2, RIFF[stepIx % RIFF.length] / 12);
    sTone(t, sd * 0.9, 0.16 + 0.1 * intensity, f, f, 'sawtooth', -8);
    sTone(t, sd * 0.9, 0.13 + 0.08 * intensity, f, f, 'sawtooth', 10);
    if (stepIx % 4 === 0) sTone(t, 0.14, 0.3, 70, 40);
    if (intensity > 0.25 && stepIx % 2 === 1) sNoise(t, 0.05, 0.06 + 0.06 * intensity, 'highpass', 7000, 6000);
    if (intensity > 0.5 && stepIx % 4 === 2) sNoise(t, 0.16, 0.16 * intensity, 'bandpass', 1800, 900);
    stepIx++;
    timer = window.setTimeout(tick, sd * 1000);
  };

  return {
    play,
    loop,
    setListener,
    startMusic() { if (musicOn || disposed) return; musicOn = true; stepIx = 0; void ctx.resume(); tick(); },
    stopMusic() { musicOn = false; window.clearTimeout(timer); },
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },
    dispose() {
      if (disposed) return;
      disposed = true; musicOn = false;
      window.clearTimeout(timer);
      for (const L of loops) { L.dead = true; try { L.src.stop(); L.src.disconnect(); L.g.disconnect(); } catch { /* noop */ } }
      loops.length = 0;
      window.setTimeout(() => { try { bus.disconnect(); comp.disconnect(); conv.disconnect(); } catch { /* noop */ } }, 1500);
    },
  };
}
