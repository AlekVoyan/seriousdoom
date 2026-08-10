import * as THREE from 'three';
import type { EngineId, InputState, MiniGameOpts, MiniGameResult } from './types';
import { createInput } from './input';
import { buildGeometry, type VoxModel } from './voxelModel';
import { asset } from './assets';

/**
 * 3D-рантайм мини-игр на Three.js с ОРТОГРАФИЧЕСКОЙ камерой («2D-вид»).
 * Мир — настоящий 3D из вокселей; поверх — 2D-canvas HUD (текст/полосы).
 * Контракт тот же: start(ctx, opts) → ctx.finish({success, score}).
 */

export interface MiniGame3DContext {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  /** 2D-слой поверх 3D для HUD/текста (очищается каждый кадр). */
  hud: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly input: InputState;
  onFrame(cb: (dt: number) => void): void;
  finish(result: MiniGameResult): void;
}

export interface MiniGame3D {
  id: string;
  title: string;
  engine: EngineId;
  reference: string;
  trigger: string;
  implemented: true;
  /** маркер 3D-игры для меню. */
  dim: '3d';
  /**
   * true — рантайм создаёт ПЕРСПЕКТИВНУЮ камеру вместо орто (игры с глубиной,
   * напр. «Адмирал v2»). ctx.camera при этом фактически PerspectiveCamera —
   * игра кастует сама: `ctx.camera as unknown as THREE.PerspectiveCamera`.
   */
  persp?: true;
  start(ctx: MiniGame3DContext, opts: MiniGameOpts): void;
}

// ── камера-профили (орто, «под 2D») ───────────────────────────────────────────
/**
 * Боковой вид (сайд-скроллер). yaw/pitch (рад) добавляют лёгкий наклон, чтобы
 * читался объём (3D), оставаясь «плоской» орто-проекцией. 0,0 = строго сбоку.
 */
export function sideView(
  cam: THREE.OrthographicCamera,
  viewH: number,
  aspect: number,
  yaw = 0,
  pitch = 0,
): void {
  const halfH = viewH / 2;
  const halfW = halfH * aspect;
  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.near = -1000;
  cam.far = 1000;
  const d = 200;
  cam.position.set(
    Math.sin(yaw) * Math.cos(pitch) * d,
    Math.sin(pitch) * d,
    Math.cos(yaw) * Math.cos(pitch) * d,
  );
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
}

/**
 * «Активная» камера (как в 3D-тетрисе): плавно качается вокруг цели, показывая
 * сцену с разных углов. Зови КАЖДЫЙ кадр, передавая накопленное время t.
 * Качание небольшое — управление влево/вправо (мир-X) остаётся читаемым.
 */
export function swayView(
  cam: THREE.OrthographicCamera,
  viewH: number,
  aspect: number,
  t: number,
  yawAmp = 0.4,
  pitchBase = 0.26,
  pitchAmp = 0.1,
  speed = 0.5,
): void {
  sideView(cam, viewH, aspect, Math.sin(t * speed) * yawAmp, pitchBase + Math.sin(t * speed * 0.7) * pitchAmp);
}

/**
 * Профессиональный камера-риг (орто, «под 2D»). Всё на пружинах-демпферах:
 * цель (look-at) следит мягко, zoom/углы плавно твинятся, есть импульс-зум (punch)
 * и тряска. Зови update(dt) каждый кадр; меняй target/zoom/angles — камера сама
 * красиво доезжает. Это даёт киношность: follow, dolly, орбита, удар камеры.
 */
export class Camera3D {
  readonly cam: THREE.OrthographicCamera;
  aspect: number;
  dist = 300;
  /** жёсткости пружин (больше = быстрее доезд). */
  posStiff = 6;
  zoomStiff = 4;
  angStiff = 4.5;

  private tx = 0; private ty = 0; private tz = 0;       // желаемая цель
  private cx = 0; private cy = 0; private cz = 0;       // текущая цель
  private vh: number; private cvh: number;              // zoom (высота орто)
  private yaw0: number; private cyaw: number;
  private pitch0: number; private cpitch: number;
  private shakeAmt = 0; private time = 0;

  constructor(cam: THREE.OrthographicCamera, viewH: number, aspect: number, yaw = 0, pitch = 0) {
    this.cam = cam;
    this.aspect = aspect;
    this.vh = this.cvh = viewH;
    this.yaw0 = this.cyaw = yaw;
    this.pitch0 = this.cpitch = pitch;
    this.apply(0);
  }

  target(x: number, y: number, z = 0): this { this.tx = x; this.ty = y; this.tz = z; return this; }
  snapTarget(x: number, y: number, z = 0): this {
    this.target(x, y, z); this.cx = x; this.cy = y; this.cz = z; return this;
  }
  zoom(viewH: number): this { this.vh = viewH; return this; }
  /** Резкий импульс зума (камера «клюёт» и пружиной возвращается). */
  zoomPunch(amount: number): this { this.cvh = Math.max(2, this.cvh - amount); return this; }
  angles(yaw: number, pitch: number): this { this.yaw0 = yaw; this.pitch0 = pitch; return this; }
  shake(a: number): this { this.shakeAmt = Math.max(this.shakeAmt, a); return this; }

  update(dt: number): void {
    const k = (s: number) => 1 - Math.exp(-s * dt);
    const kp = k(this.posStiff);
    this.cx += (this.tx - this.cx) * kp;
    this.cy += (this.ty - this.cy) * kp;
    this.cz += (this.tz - this.cz) * kp;
    this.cvh += (this.vh - this.cvh) * k(this.zoomStiff);
    const ka = k(this.angStiff);
    this.cyaw += (this.yaw0 - this.cyaw) * ka;
    this.cpitch += (this.pitch0 - this.cpitch) * ka;
    this.shakeAmt *= Math.exp(-dt * 7);
    if (this.shakeAmt < 0.02) this.shakeAmt = 0;
    this.time += dt;
    this.apply(this.shakeAmt);
  }

  private apply(shake: number): void {
    const halfH = this.cvh / 2;
    const halfW = halfH * this.aspect;
    this.cam.left = -halfW;
    this.cam.right = halfW;
    this.cam.top = halfH;
    this.cam.bottom = -halfH;
    // узкий диапазон вокруг dist=300 → высокая точность буфера глубины (меньше z-fighting)
    this.cam.near = 120;
    this.cam.far = 480;
    const ox = Math.sin(this.time * 47) * shake;
    const oy = Math.cos(this.time * 59) * shake;
    const dx = Math.sin(this.cyaw) * Math.cos(this.cpitch);
    const dy = Math.sin(this.cpitch);
    const dz = Math.cos(this.cyaw) * Math.cos(this.cpitch);
    this.cam.position.set(this.cx + dx * this.dist + ox, this.cy + dy * this.dist + oy, this.cz + dz * this.dist);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this.cx + ox, this.cy + oy, this.cz);
    this.cam.updateProjectionMatrix();
  }
}

/** Вид сверху (для лабиринтов/сеток): смотрим вниз вдоль −Y, X вправо, Z вниз экрана. */
export function topView(cam: THREE.OrthographicCamera, viewH: number, aspect: number): void {
  const halfH = viewH / 2;
  const halfW = halfH * aspect;
  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.near = -1000;
  cam.far = 1000;
  cam.position.set(0, 100, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
}

/** Лёгкая изометрия (3/4 вид) — объём заметнее, но всё ещё «плоская» орто. */
export function isoView(cam: THREE.OrthographicCamera, viewH: number, aspect: number): void {
  const halfH = viewH / 2;
  const halfW = halfH * aspect;
  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.near = -1000;
  cam.far = 1000;
  cam.position.set(60, 70, 90);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
}

// ── воксель-меши ──────────────────────────────────────────────────────────────
const MAT_CACHE = new THREE.MeshLambertMaterial({ vertexColors: true });

/** Меш из ассета-библиотеки по id (или null). Высота ≈ ITEM_SIZE. */
export function assetMesh(id: string): THREE.Mesh | null {
  const m = asset(id);
  return m ? modelMesh(m) : null;
}

/** Меш из произвольной воксель-модели. */
export function modelMesh(model: VoxModel): THREE.Mesh {
  return new THREE.Mesh(buildGeometry(model), MAT_CACHE);
}

/** Простой цветной воксель-куб (для процедурных объектов). */
export function box(w: number, h: number, d: number, color: THREE.ColorRepresentation): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  return mesh;
}

/** Группа кубов-вокселей одного цвета (instanced) из списка позиций [x,y,z]. */
export function voxels(
  positions: Array<[number, number, number]>,
  size: number,
  color: THREE.ColorRepresentation,
): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshLambertMaterial({ color });
  const im = new THREE.InstancedMesh(geo, mat, positions.length);
  const m = new THREE.Matrix4();
  positions.forEach((p, i) => {
    m.makeTranslation(p[0], p[1], p[2]);
    im.setMatrixAt(i, m);
  });
  im.instanceMatrix.needsUpdate = true;
  return im;
}

// ── рантайм ───────────────────────────────────────────────────────────────────
export function runMiniGame3D(game: MiniGame3D, opts: MiniGameOpts = {}): Promise<MiniGameResult> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'mg-overlay';
    const glCanvas = document.createElement('canvas');
    const hudCanvas = document.createElement('canvas');
    hudCanvas.style.position = 'absolute';
    hudCanvas.style.inset = '0';
    hudCanvas.style.pointerEvents = 'none';
    root.appendChild(glCanvas);
    root.appendChild(hudCanvas);
    document.body.appendChild(root);

    const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
    renderer.setClearColor(0x0b1020, 1);
    const scene = new THREE.Scene();
    // перспективная камера по флагу игры (persp), иначе — стандартная орто «под 2D»
    const camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = game.persp
      ? new THREE.PerspectiveCamera(55, 1, 0.5, 500)
      : new THREE.OrthographicCamera(-10, 10, 10, -10, -1000, 1000);

    // освещение: мягкий ambient + направленный (грани вокселей читаются)
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(0.4, 1, 0.7);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0x88aaff, 0.25);
    dir2.position.set(-0.5, 0.2, -0.6);
    scene.add(dir2);

    const hud = hudCanvas.getContext('2d')!;
    const input = createInput(root);

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // подстраховка: если оверлей ещё не измерен (0), берём окно — иначе aspect=NaN
      width = root.clientWidth || window.innerWidth || 1;
      height = root.clientHeight || window.innerHeight || 1;
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      hudCanvas.width = Math.round(width * dpr);
      hudCanvas.height = Math.round(height * dpr);
      hudCanvas.style.width = width + 'px';
      hudCanvas.style.height = height + 'px';
      hud.setTransform(dpr, 0, 0, dpr, 0, 0);
      // у перспективной камеры аспект ведёт рантайм (орто-проекцию задаёт игра)
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = 0;
    let frameCb: ((dt: number) => void) | null = null;
    let done = false;

    const finish = (result: MiniGameResult) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onEsc);
      input.dispose();
      renderer.dispose();
      root.remove();
      resolve(result);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.code === 'Escape') finish({ success: false, score: 0 });
    };
    window.addEventListener('keydown', onEsc);

    const context: MiniGame3DContext = {
      scene,
      camera: camera as THREE.OrthographicCamera, // при game.persp — фактически PerspectiveCamera
      hud,
      get width() {
        return width;
      },
      get height() {
        return height;
      },
      input: input.state,
      onFrame(cb) {
        frameCb = cb;
      },
      finish,
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
      last = t;
      hud.clearRect(0, 0, width, height);
      if (frameCb) frameCb(dt);
      renderer.render(scene, camera);
      input.endFrame();
    };

    game.start(context, opts);
    raf = requestAnimationFrame(loop);
  });
}
