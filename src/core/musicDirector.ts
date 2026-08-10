import { getSharedAudioContext } from './audioDoom';

/**
 * Музыкальный режиссёр «Фаєрвола»: динамическая смена дорожек по ситуации
 * с равномощными кроссфейдами (equal-power) — треки накладываются, а не
 * обрываются. Работает через AudioBufferSourceNode, поэтому луп бесшовный
 * (никаких щелчков на стыке, как у <audio loop>).
 *
 * Дорожки (в public/music, Opus + AAC-дубль для Safari):
 *   main   ~104с  — бой во время волны (луп)
 *   middle ~4.2с  — передышка между волнами (ровно в длину паузы)
 *   end    ~5.2с  — смерть (однократно, дальше уходит в chill)
 *   chill  ~8.3с  — меню и экран расчёта (луп)
 */

export type TrackId = 'main' | 'middle' | 'end' | 'chill';
export const TRACK_INFO: Record<TrackId, { name: string; use: string }> = {
  main: { name: 'main', use: 'бой: играет всю волну, бесшовный луп' },
  middle: { name: 'middle', use: 'передышка между волнами (её длина ≈ длина паузы)' },
  end: { name: 'end', use: 'смерть: однократный стингер, затем chill' },
  chill: { name: 'chill', use: 'титульное меню и экран «вывести/работать» (луп)' },
};

interface Voice { src: AudioBufferSourceNode; gain: GainNode; id: TrackId; stopping: boolean }

export interface MusicDirector {
  readonly ready: Promise<void>;
  /** включить дорожку с кроссфейдом; loop по умолчанию true (кроме end) */
  play(id: TrackId, opts?: { loop?: boolean; fade?: number; onEnd?: () => void }): void;
  stop(fade?: number): void;
  setVolume(v: number): void;
  current(): TrackId | null;
  dispose(): void;
}

export function createMusicDirector(volume = 0.55): MusicDirector {
  const ctx = getSharedAudioContext();
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  // Opus в .ogg не везде играет (Safari) — там берём AAC .m4a
  const probe = document.createElement('audio');
  const ext = probe.canPlayType('audio/ogg; codecs=opus') ? 'ogg' : 'm4a';

  const buffers = new Map<TrackId, AudioBuffer>();
  const ids: TrackId[] = ['main', 'middle', 'end', 'chill'];
  let disposed = false;

  const ready = (async () => {
    // короткие дорожки грузим первыми — меню зазвучит, не дожидаясь боевой
    const order: TrackId[] = ['chill', 'middle', 'end', 'main'];
    await Promise.all(order.map(async (id) => {
      try {
        const res = await fetch(`/music/${id}.${ext}`);
        if (!res.ok) throw new Error(`${res.status}`);
        buffers.set(id, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch (e) {
        console.warn(`[music] не загрузилась дорожка ${id}:`, e);
      }
    }));
  })();

  let voices: Voice[] = [];
  let cur: TrackId | null = null;

  const fadeOut = (v: Voice, fade: number) => {
    if (v.stopping) return;
    v.stopping = true;
    const t = ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
    // equal-power: спад по кривой, а не линейно — на середине склейки нет провала
    v.gain.gain.setTargetAtTime(0.0001, t, Math.max(0.05, fade) / 3.5);
    try { v.src.stop(t + fade + 0.15); } catch { /* уже остановлен */ }
    window.setTimeout(() => {
      try { v.src.disconnect(); v.gain.disconnect(); } catch { /* noop */ }
      voices = voices.filter((x) => x !== v);
    }, (fade + 0.3) * 1000);
  };

  return {
    ready,
    current: () => cur,
    play(id, opts = {}) {
      if (disposed) return;
      void ctx.resume();
      const fade = opts.fade ?? 1.2;
      const loop = opts.loop ?? id !== 'end';
      if (cur === id && voices.some((v) => v.id === id && !v.stopping)) return; // уже играет
      for (const v of voices) fadeOut(v, fade);

      const buf = buffers.get(id);
      cur = id;
      if (!buf) { // ещё не догрузилась — доиграем позже
        void ready.then(() => { if (!disposed && cur === id) this.play(id, { ...opts, fade: 0.4 }); });
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.setTargetAtTime(1, t, Math.max(0.05, fade) / 3.5);
      src.connect(gain).connect(master);
      const voice: Voice = { src, gain, id, stopping: false };
      if (opts.onEnd && !loop) {
        src.onended = () => { if (!voice.stopping && !disposed) opts.onEnd?.(); };
      }
      src.start(t);
      voices.push(voice);
    },
    stop(fade = 0.8) {
      cur = null;
      for (const v of voices) fadeOut(v, fade);
    },
    setVolume(v) { master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.08); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const v of voices) { try { v.src.stop(); v.src.disconnect(); v.gain.disconnect(); } catch { /* noop */ } }
      voices = [];
      window.setTimeout(() => { try { master.disconnect(); } catch { /* noop */ } }, 300);
    },
  };
}
