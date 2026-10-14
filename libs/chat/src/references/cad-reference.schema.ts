// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';
import type { GeometryComponentReference } from '@taucad/types';

/** Component kinds a geometry manifest names (`GeometryComponentKind` in `@taucad/types`). @public */
export const cadReferenceComponentKinds = [
  'model',
  'assembly',
  'part',
  'body',
  'face',
  'edge',
  'vertex',
  'mesh',
  'line',
  'material',
  'unknown',
] as const;

/**
 * One referenced piece of CAD geometry (blueprint D6): the workspace file that renders it and the component in that
 * file's model tree. `componentId` is the identity the Model pane and `arrange_workbench` component lists use;
 * `selector` is the renderer's node selector, carried for GeoSpec alignment. The component's kind is `componentKind`
 * because `kind` already discriminates the target.
 * @public
 */
export const cadReferenceSchema = z.strictObject({
  resource: z.strictObject({
    kind: z.literal('workspace-file'),
    path: z.string().min(1).max(1024),
    /** The geometry hash the reference was taken from, when the renderer knew it. */
    revision: z.string().min(1).max(128).optional(),
  }),
  target: z.strictObject({
    kind: z.literal('component'),
    componentId: z.string().min(1).max(256),
    selector: z.string().max(256).optional(),
    label: z.string().max(256),
    componentKind: z.enum(cadReferenceComponentKinds),
  }),
});

/** @public */
export type CadReference = z.infer<typeof cadReferenceSchema>;

/** At most this many references travel with one message or one viewer selection. @public */
export const maxCadReferences = 32;

/** A list of references, as a message or a viewer selection carries them. @public */
export const cadReferencesSchema = z.array(cadReferenceSchema).max(maxCadReferences);

/**
 * The viewer's own component reference (`GeometryComponentReference` in `@taucad/types`), as a composer chip stores
 * it; `cadReferenceFromGeometryComponent` maps it onto the wire shape.
 * @public
 */
export const geometryComponentReferenceSchema = z.strictObject({
  scheme: z.literal('tau-cad'),
  filePath: z.string().min(1).max(1024),
  componentId: z.string().min(1).max(256),
  selector: z.string().max(256),
  geometryHash: z.string().min(1).max(128).optional(),
  label: z.string().max(256),
  kind: z.enum(cadReferenceComponentKinds),
}) satisfies z.ZodType<GeometryComponentReference>;
