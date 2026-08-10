/**
 * Мобильный слой для мини-игр: детект тача, мульти-тач трекер и набор
 * экранных контролов (рисуются на 2D-HUD, хит-тест по координатам тача).
 *
 * Координаты тача (clientX/Y) совпадают с координатами HUD: оверлей мини-игры —
 * position:fixed; inset:0, поэтому пересчёт не нужен. Игры на тач-устройстве
 * сами читают эти контролы и вписывают результат в ctx.input (логика игры не
 * меняется), либо дёргают свои колбэки напрямую.
 */

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    window.matchMedia?.('(pointer: coarse)')?.matches === true
  );
}

export interface TPoint { id: number; x: number; y: number; sx: number; sy: number }

/** Мульти-тач трекер. Слушает window; зови endFrame() в конце кадра, dispose() при выходе. */
export function createMultiTouch() {
  const map = new Map<number, TPoint>();
  let started: TPoint[] = [];
  let ended: TPoint[] = [];
  let disposed = false;

  const onStart = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const p: TPoint = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY };
      map.set(t.identifier, p);
      started.push(p);
    }
    e.preventDefault();
  };
  const onMove = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const p = map.get(t.identifier);
      if (p) { p.x = t.clientX; p.y = t.clientY; }
    }
    e.preventDefault();
  };
  const onEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const p = map.get(t.identifier);
      if (p) { ended.push(p); map.delete(t.identifier); }
    }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('touchstart', onStart);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onEnd);
    window.removeEventListener('touchcancel', onEnd);
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') dispose(); };

  window.addEventListener('touchstart', onStart, { passive: false });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd, { passive: false });
  window.addEventListener('touchcancel', onEnd, { passive: false });
  window.addEventListener('keydown', onKey);

  return {
    /** активные касания (текущие позиции) */
    get active() { return Array.from(map.values()); },
    /** касания, начавшиеся в этом кадре */
    get started() { return started; },
    /** касания, завершившиеся в этом кадре (последняя позиция) */
    get ended() { return ended; },
    endFrame() { started = []; ended = []; },
    dispose,
  };
}

// ── геометрия зон ────────────────────────────────────────────────────────────
export const inRect = (px: number, py: number, x: number, y: number, w: number, h: number) =>
  px >= x && px <= x + w && py >= y && py <= y + h;
export const inCircle = (px: number, py: number, cx: number, cy: number, r: number) =>
  (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;

// ── отрисовка контролов на HUD ────────────────────────────────────────────────
type G = CanvasRenderingContext2D;

/**
 * Подобрать размер шрифта (px), чтобы текст влез в maxW. Возвращает строку для
 * g.font. family — напр. '"PixelHalf", ui-monospace, monospace'. Меняет g.font
 * как побочный эффект (на подобранный), так что можно сразу рисовать.
 */
export function fitFont(g: G, text: string, maxW: number, maxPx: number, family: string, minPx = 9): string {
  let s = Math.round(maxPx);
  for (; s > minPx; s--) {
    g.font = `${s}px ${family}`;
    if (g.measureText(text).width <= maxW) break;
  }
  const f = `${s}px ${family}`;
  g.font = f;
  return f;
}

/** Полупрозрачная круглая кнопка с подписью. on — подсвечена (нажата). */
export function drawButton(g: G, cx: number, cy: number, r: number, label: string, on: boolean, accent = '#9fe6ff'): void {
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = on ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = on ? accent : 'rgba(255,255,255,0.32)';
  g.stroke();
  g.fillStyle = on ? accent : 'rgba(235,240,250,0.82)';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${Math.round(r * 0.62)}px ui-monospace, monospace`;
  g.fillText(label, cx, cy + 1);
  g.restore();
}

/** Крестовина 4-way. pressed — какие направления зажаты. Возвращает зоны не нужно — хит-тест отдельно. */
export function drawDpad(g: G, cx: number, cy: number, r: number, p: { l: boolean; r: boolean; u: boolean; d: boolean }): void {
  const arm = r * 0.62, w = r * 0.5;
  g.save();
  g.translate(cx, cy);
  // подложка
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.stroke();
  const seg = (dx: number, dy: number, on: boolean) => {
    g.save(); g.translate(dx, dy);
    g.fillStyle = on ? 'rgba(159,230,255,0.85)' : 'rgba(235,240,250,0.5)';
    g.beginPath();
    if (dx === 0) { g.moveTo(0, dy < 0 ? -arm * 0.6 : arm * 0.6); g.lineTo(-w * 0.32, 0); g.lineTo(w * 0.32, 0); }
    else { g.moveTo(dx < 0 ? -arm * 0.6 : arm * 0.6, 0); g.lineTo(0, -w * 0.32); g.lineTo(0, w * 0.32); }
    g.closePath(); g.fill();
    g.restore();
  };
  seg(0, -arm, p.u); seg(0, arm, p.d); seg(-arm, 0, p.l); seg(arm, 0, p.r);
  g.restore();
}
