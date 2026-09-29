import type { GeometryComponentAppearance } from '@taucad/types';

type SurfaceMaterials = NonNullable<GeometryComponentAppearance['materials']>;

export const gltfDefaultBaseColorLabel = '#ffffff';

const numericFactor = (value: number | 'unavailable' | undefined): number => (typeof value === 'number' ? value : 1);

/** A small shaded preview of the same material the model workbench displays. */
export function MaterialSwatch({ materials }: { readonly materials: SurfaceMaterials }): React.JSX.Element {
  const colors = [
    ...new Set(
      materials.map(({ color }) =>
        color === undefined || color === 'unavailable' ? gltfDefaultBaseColorLabel : color,
      ),
    ),
  ];
  const fill =
    colors.length === 1
      ? colors[0]!
      : `conic-gradient(${colors.map((color, index) => `${color} ${(index * 100) / colors.length}% ${((index + 1) * 100) / colors.length}%`).join(', ')})`;
  const roughness = numericFactor(materials[0]?.roughness);
  const metalness = numericFactor(materials[0]?.metalness);
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Light and shadow on a rendered material preview, not UI palette colours.
  const highlight = `radial-gradient(circle at 32% 30%, rgb(255 255 255 / ${0.85 * (1 - roughness)}) 0, transparent ${35 + 35 * roughness}%)`;
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Light and shadow on a rendered material preview, not UI palette colours.
  const rim = `radial-gradient(circle, transparent 50%, rgb(0 0 0 / ${0.1 + 0.3 * metalness}) 100%)`;
  return (
    <span
      aria-hidden
      data-slot='material-swatch'
      className='size-4 shrink-0 rounded-full ring-1 ring-border'
      style={{ background: `${highlight}, ${rim}, ${fill}` }}
    />
  );
}
