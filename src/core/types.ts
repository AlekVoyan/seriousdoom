/**
 * Контракт мини-игры (docs/minigames.md §«Каркас»).
 * Каждая мини-игра реализует `start(ctx, opts)` и в какой-то момент зовёт
 * `ctx.finish(result)`. Запуск оборачивается в Promise (см. runMiniGame).
 */

export type EngineId = 'scroller' | 'grid' | 'rhythm' | 'sport' | 'reflex';

export interface MiniGameOpts {
  /** Стресс 0–100: ужимает зазоры/тайминги. */
  stress?: number;
  /** Выносливость 0–100: больше попыток/повторов. */
  stamina?: number;
  /** Зерно ГПСЧ — для воспроизводимых забегов. */
  seed?: number;
  /** Произвольный полезный груз под конкретную игру. */
  [key: string]: unknown;
}

export interface MiniGameResult {
  success: boolean;
  /** Очки/метрика — для финальной статистики и привязки наград. */
  score: number;
}

export interface PointerState {
  x: number;
  y: number;
  down: boolean;
}

export interface InputState {
  /** Действие зажато (Space/↑/W/Enter или палец на экране). */
  action: boolean;
  /** Действие нажато именно в этом кадре (фронт). */
  actionJustPressed: boolean;
  /** Направление -1..1 по осям (стрелки/WASD). */
  dir: { x: number; y: number };
  pointer: PointerState;
  /** Тап/нажатие действия в этом кадре (для Flappy-подобных). */
  justTapped: boolean;
}

export interface MiniGameContext {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Логический размер поля в CSS-пикселях (DPR уже учтён в transform). */
  readonly width: number;
  readonly height: number;
  readonly input: InputState;
  /** Зарегистрировать колбэк кадра. dt в секундах, ограничен сверху. */
  onFrame(cb: (dt: number) => void): void;
  /** Завершить игру и вернуть результат (resolve промиса runMiniGame). */
  finish(result: MiniGameResult): void;
}

export interface MiniGame {
  id: string;
  title: string;
  engine: EngineId;
  /** Классика-оммаж (для галереи/доки). */
  reference: string;
  /** Где в основной игре срабатывает. */
  trigger: string;
  /** false — ещё заглушка-прототип. */
  implemented: boolean;
  /** рантайм: 2D canvas (по умолчанию) либо '3d' (Three.js). */
  dim?: '2d';
  start(ctx: MiniGameContext, opts: MiniGameOpts): void;
}
