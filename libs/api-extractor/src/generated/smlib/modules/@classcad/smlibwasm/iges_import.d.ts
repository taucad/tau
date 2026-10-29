import type { BytesLike } from './_bytes.js';
import { Part, Shell, type ShapeList } from './shapes.js';
/** How an IGES file is read: `heal` (default true) repairs solids that come out invalid, as
 * `fromStep` does; `strict` (default false) throws a ModelingError for the first thing that cannot
 * be read instead of leaving it out with a warning. */
export interface IgesImportOptions {
    heal?: boolean;
    strict?: boolean;
}
/**
 * Read the solids and surfaces of IGES file contents (IGES 5.3, ASCII): the text, or the bytes of
 * the file.
 *
 * Returns a single `Part` (or `Shell`) when the file holds one body, otherwise a `ShapeList` of
 * them, in millimeters whatever unit the file uses, named and colored as the file has them.
 *
 * Solids (manifold solid B-rep objects, entity 186) come in as STEP bodies do: each face on its
 * exact surface, each edge on its exact curve, the faces sharing their edges. Trimmed and bounded
 * surfaces (144, 143), the way most CAD systems write IGES, share nothing: each becomes a face, the
 * faces are stitched where their edges meet, and each set of faces that closes up becomes a part,
 * the others sheets. `heal` repairs solids that come out invalid, as `fromStep` does.
 *
 * Something that cannot be read (an entity smlibwasm does not read, one the kernel cannot build) is
 * left out with a warning that names it and the reason; `strict: true` throws a `ModelingError`
 * instead. A file none of whose bodies can be read throws.
 */
export declare function fromIges(data: string | BytesLike, options?: IgesImportOptions): Part | Shell | ShapeList<Part | Shell>;
/** Read the solids and surfaces of an IGES file (.igs, .iges; IGES 5.3, ASCII); see `fromIges`. */
export declare function importIges(path: string, options?: IgesImportOptions): Part | Shell | ShapeList<Part | Shell>;
