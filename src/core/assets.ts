import type { VoxModel } from './voxelModel';

/**
 * Загрузчик воксель-ассетов из src/assets/**.json (формат tools/voxelize.py).
 * Один JSON → и Three.js (voxelModel.buildGeometry), и 2D. Источник моделей —
 * библиотека ../VoxEvasion-items, файлы скопированы сюда для независимости.
 */
const mods = import.meta.glob<VoxModel>('../assets/**/*.json', { eager: true, import: 'default' });

const BY_ID: Record<string, VoxModel> = {};
for (const [path, model] of Object.entries(mods)) {
  const id = path.split('/').pop()!.replace(/\.json$/, '');
  BY_ID[id] = model;
}

/** Модель по id файла (без .json), напр. 'ifak', 'knife', 'pot'. */
export function asset(id: string): VoxModel | null {
  return BY_ID[id] ?? null;
}

export const ASSET_IDS = Object.keys(BY_ID);
