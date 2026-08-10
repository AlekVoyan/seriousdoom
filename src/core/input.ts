import type { InputState } from './types';

/**
 * Унифицированный ввод: клавиатура + тач/мышь. Общий для 2D- и 3D-рантайма.
 * Вызывай endFrame() в конце кадра, dispose() при завершении.
 */
export function createInput(target: HTMLElement) {
  const state: InputState = {
    action: false,
    actionJustPressed: false,
    dir: { x: 0, y: 0 },
    pointer: { x: 0, y: 0, down: false },
    justTapped: false,
  };
  const keys = new Set<string>();
  const isAction = (c: string) => c === 'Space' || c === 'ArrowUp' || c === 'KeyW' || c === 'Enter';

  const updateDir = () => {
    const r = keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0;
    const l = keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0;
    const d = keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0;
    const u = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0;
    state.dir.x = r - l;
    state.dir.y = d - u;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    updateDir();
    if (isAction(e.code)) {
      if (!state.action) state.actionJustPressed = true;
      state.action = true;
      state.justTapped = true;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    updateDir();
    if (isAction(e.code)) state.action = [...keys].some(isAction);
  };

  const setPos = (e: PointerEvent) => {
    const r = target.getBoundingClientRect();
    state.pointer.x = e.clientX - r.left;
    state.pointer.y = e.clientY - r.top;
  };
  const onPointerDown = (e: PointerEvent) => {
    setPos(e);
    state.pointer.down = true;
    state.action = true;
    state.actionJustPressed = true;
    state.justTapped = true;
  };
  const onPointerUp = () => {
    state.pointer.down = false;
    state.action = [...keys].some(isAction);
  };
  const onPointerMove = (e: PointerEvent) => setPos(e);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointermove', onPointerMove);

  return {
    state,
    endFrame() {
      state.justTapped = false;
      state.actionJustPressed = false;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointermove', onPointerMove);
    },
  };
}
