import type { KernelId } from '@taucad/types/constants';
import type { ModelFamily } from '@taucad/chat';
import type { SvgIcons } from '#components/icons/generated/svg-icons.js';
import manifoldPng from '#components/icons/raw/manifold.png?url';

const pngIcons = {
  manifold: manifoldPng,
} as const satisfies Record<string, string>;

const iconAliases = {
  llama: 'meta',
  glm: 'zai',
} as const satisfies Record<string, SvgIcons>;

/** Keys of {@link pngIcons} — icons rendered via `<image>` instead of the sprite. */
export type PngIconId = keyof typeof pngIcons;

/** Keys of {@link iconAliases} — non-canonical names that resolve to a sprite icon. */
export type IconAliasId = keyof typeof iconAliases;

/** Sentinel id meaning "we have no renderable icon"; SvgIcon renders nothing for it. */
export const unknownIconId = 'unknown';
export type UnknownIconId = typeof unknownIconId;

/**
 * Every id `SvgIcon` accepts. Empty strings and arbitrary strings are rejected
 * at the type level, so misleading fallbacks (e.g. `?? 'anthropic'`) cannot
 * silently render the wrong brand for an unresolved model.
 */
export type IconId = SvgIcons | PngIconId | IconAliasId | UnknownIconId;

// Compile-time guarantee that every kernel id and every model family resolves
// to a real renderable icon. If a future kernel/family lands without a matching
// sprite, PNG, or alias, the build fails here instead of silently rendering an
// empty `<use href="...#newid">`.
type AssertKernelIdsRenderable = KernelId extends IconId ? true : never;
type AssertModelFamiliesRenderable = ModelFamily extends IconId ? true : never;
const kernelIdsRenderableCheck: AssertKernelIdsRenderable = true;
const modelFamiliesRenderableCheck: AssertModelFamiliesRenderable = true;
void kernelIdsRenderableCheck;
void modelFamiliesRenderableCheck;

export function SvgIcon({
  id,
  className,
  ...properties
}: React.SVGProps<SVGSVGElement> & { readonly id: IconId }): React.JSX.Element | undefined {
  if (id === unknownIconId) {
    return undefined;
  }

  if (id in pngIcons) {
    const pngSource = pngIcons[id as PngIconId];
    return (
      <svg {...properties} className={className} viewBox='0 0 56 56' role='img' aria-label={id}>
        <image href={pngSource} width='56' height='56' />
      </svg>
    );
  }

  const aliasTarget = (iconAliases as Record<string, SvgIcons | undefined>)[id];
  const resolvedIconId: SvgIcons = aliasTarget ?? (id as SvgIcons);

  // Same-document `<use>` reference: the sprite is inlined once at the app
  // shell via `<SvgSpriteMount />` (mounted in `root.tsx`), so every browser
  // (including Safari) materialises the symbol's `<defs>` correctly.
  return (
    <svg {...properties} className={className} viewBox='0 0 56 56'>
      <use href={`#${resolvedIconId}`} />
    </svg>
  );
}
