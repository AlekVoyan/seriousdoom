import * as THREE from 'three';

/**
 * Загрузка и построение воксель-модели предмета из JSON
 * (формат tools/voxelize.py): { size:[X,Y,Z], palette:["#hex"], voxels:[[x,y,z,colorIdx]] }.
 *
 * ВАЖНО: это точная копия логики `src/world/itemModel.ts` основного проекта
 * (face-culling, vertex colors, центр по X/Z, основание на Y=0, масштаб в ITEM_SIZE).
 * Превью показывает ровно то, что увидит игра. Любые правды билдера сюда и в игру синхронно.
 */

export interface VoxModel {
  size: [number, number, number];
  palette: string[];
  voxels: Array<[number, number, number, number]>;
  /** опц. человекочитаемое имя (для библиотеки) */
  name?: string;
}

/** мировой размер предмета по самой длинной стороне (как кубик дропа ~0.5 в игре) */
export const ITEM_SIZE = 0.55;

// грани единичного куба: нормаль + 4 угла. Рендерим DoubleSide — винтинг некритичен.
const FACES: Array<{ n: [number, number, number]; v: Array<[number, number, number]> }> = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

export function buildGeometry(data: VoxModel): THREE.BufferGeometry {
  const [sx, sy, sz] = data.size;
  const occ = new Uint8Array(sx * sy * sz);
  const at = (x: number, y: number, z: number): number => (z * sy + y) * sx + x;
  for (const [x, y, z] of data.voxels) occ[at(x, y, z)] = 1;
  const solid = (x: number, y: number, z: number): boolean =>
    x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && occ[at(x, y, z)] === 1;

  const cols = data.palette.map((h) => new THREE.Color(h));
  const maxDim = Math.max(sx, sy, sz) || 1;
  const vox = ITEM_SIZE / maxDim;
  const ox = -sx / 2;
  const oz = -sz / 2;

  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let vi = 0;

  for (const [x, y, z, c] of data.voxels) {
    const tint = cols[c] ?? cols[0] ?? new THREE.Color(0x888888);
    for (const f of FACES) {
      if (solid(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
      for (const v of f.v) {
        pos.push((x + v[0] + ox) * vox, (y + v[1]) * vox, (z + v[2] + oz) * vox);
        nor.push(f.n[0], f.n[1], f.n[2]);
        col.push(tint.r, tint.g, tint.b);
      }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
