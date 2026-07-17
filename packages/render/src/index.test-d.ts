import { expectTypeOf } from 'vitest';
import type { ExportFile } from '@taucad/types';
import * as renderModule from '#index.js';

const { createRenderImageOptions, createRenderImagesOptions, renderGlbToImage, renderGlbToImages } = renderModule;
type RenderModule = typeof renderModule;
expectTypeOf<
  Extract<
    keyof RenderModule,
    | 'RenderDeps'
    | 'RawRenderer'
    | 'StrictRenderImagesOptions'
    | 'imageFileName'
    | 'isNodeRuntime'
    | 'renderManyRaw'
    | 'renderRaw'
    | 'toImageRequestJson'
    | 'toImagesRequestJson'
  >
>().toEqualTypeOf<never>();

const glb = new Uint8Array([1, 2, 3]);

const singular = createRenderImageOptions({
  format: 'webp',
  label: 'Isometric',
  includeAxes: true,
  includeLabel: true,
  includeScale: true,
});
expectTypeOf(singular).toEqualTypeOf<{
  readonly format: 'webp';
  readonly label: 'Isometric';
  readonly includeAxes: true;
  readonly includeLabel: true;
  readonly includeScale: true;
}>();
expectTypeOf(renderGlbToImage(glb, singular)).toEqualTypeOf<Promise<ExportFile>>();

const options = createRenderImagesOptions({
  format: 'png',
  includeAxes: true,
  includeLabel: true,
  includeScale: true,
  views: [
    { id: 'front', label: 'Front', phi: 90, theta: 0 },
    { id: 'top', label: 'Top', phi: 0, theta: 0 },
  ],
});
const rendered = renderGlbToImages(glb, options);
expectTypeOf(rendered).toEqualTypeOf<
  Promise<readonly [renderModule.RenderedImage<'front'>, renderModule.RenderedImage<'top'>]>
>();

const dynamicViews: renderModule.RenderImageView[] = [{ id: 'front', phi: 90, theta: 0 }];
const dynamic = renderGlbToImages(glb, { format: 'png', views: dynamicViews });
expectTypeOf(dynamic).toEqualTypeOf<Promise<readonly renderModule.RenderedImage[]>>();

// @ts-expect-error empty literal view tuples are rejected
void renderGlbToImages(glb, { format: 'png', views: [] });
// @ts-expect-error includeAxes is shared, not per view
void renderGlbToImages(glb, { format: 'png', views: [{ id: 'front', phi: 90, theta: 0, includeAxes: true }] });
// @ts-expect-error includeLabel true requires a singular label
createRenderImageOptions({ format: 'png', includeLabel: true });
// @ts-expect-error includeLabel true requires every batch view label
createRenderImagesOptions({ format: 'png', includeLabel: true, views: [{ id: 'front', phi: 90, theta: 0 }] });
// @ts-expect-error includeScale is shared, not per view
void renderGlbToImages(glb, { format: 'png', views: [{ id: 'front', phi: 90, theta: 0, includeScale: true }] });
// @ts-expect-error singular label is not a batch-level property
createRenderImagesOptions({ format: 'png', label: 'Front', views: [{ id: 'front', phi: 90, theta: 0 }] });
// @ts-expect-error format is shared, not per view
createRenderImagesOptions({ format: 'png', views: [{ id: 'front', phi: 90, theta: 0, format: 'png' }] });
// @ts-expect-error plural angles belong on each view
createRenderImagesOptions({ format: 'png', phi: 90, views: [{ id: 'front', phi: 90, theta: 0 }] });
// @ts-expect-error missing theta
createRenderImagesOptions({ format: 'png', views: [{ id: 'front', phi: 90 }] });
// @ts-expect-error misspelled singular option
createRenderImageOptions({ format: 'png', includeAxis: true });
// @ts-expect-error misspelled plural option
createRenderImagesOptions({ format: 'png', includeAxis: true, views: [{ id: 'front', phi: 90, theta: 0 }] });
// @ts-expect-error missing singular format
createRenderImageOptions({ includeAxes: true });
// @ts-expect-error unrelated top-level plural option
void renderGlbToImages(glb, { format: 'png', lighting: 'studio', views: [{ id: 'front', phi: 90, theta: 0 }] });
// @ts-expect-error width is shared, not per view
void renderGlbToImages(glb, { format: 'png', views: [{ id: 'front', phi: 90, theta: 0, width: 320 }] });
// @ts-expect-error missing view id
createRenderImagesOptions({ format: 'png', views: [{ phi: 90, theta: 0 }] });
