import { warehouseParts } from '@taucad/warehouse/builtin';
import type { BuiltinProjectCardModel } from '#constants/project-examples.js';

/** Lightweight card metadata; source bytes load only for open, preview or remix. */
export const warehouseProjects: readonly BuiltinProjectCardModel[] = warehouseParts.map((part) => ({
  locator: part.locator,
  kernel: 'replicad',
  id: part.manifest.id,
  name: part.manifest.name,
  description: part.manifest.description,
  tags: part.manifest.tags,
  assets: part.manifest.assets,
  thumbnail: part.thumbnailUrl,
  fileAssets: part.assets,
}));
