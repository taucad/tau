/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON field names */
/**
 * KCL `import` of foreign files: the `import_files` command.
 *
 * kcl-lib reads the imported file (and a glTF's external buffers) itself and sends their bytes with the format
 * options it resolved from the import's attributes. The engine writes them to libcascade's in-memory filesystem
 * and reads them with OCCT's own readers (`TauOffline.importFile`): STEP becomes a B-rep body; glTF, GLB, OBJ and STL
 * become mesh bodies, surface-less triangle faces that count neither volume nor area, as Zoo's mass properties leave
 * imported meshes out. The body is mapped from the file's axes and length unit into the engine's frame (millimetres,
 * Z up, -Y forward); glTF is read in glTF space (Y up, metres), where Zoo's own glTF export writes.
 */
import type { OfflineEngine } from '#offline/offline-engine.js';
import type { ModelingCommand } from '#offline/offline-engine.types.js';
import { OfflineEngineError } from '#offline/offline-engine.types.js';
import type { Oc, TopoDS_Shape } from '#offline/offline-occt.js';
import { unitScale } from '#offline/offline-engine-support.js';

type WireAxis = { axis: 'x' | 'y' | 'z'; direction: 'positive' | 'negative' };

/** `InputFormat3d` as kcl-lib sends it; only the fields the readers need. */
type WireInputFormat = { type: string; coords?: { forward: WireAxis; up: WireAxis }; units?: string };

/** `TauOffline.importFile` (`libcascade/tau-offline.cpp`). */
// oxlint-disable-next-line max-params -- the native function takes positional arguments
type ImportFile = (
  path: string,
  format: string,
  forward: number,
  up: number,
  millimetresPerUnit: number,
) => TopoDS_Shape;

/**
 * An axis as `TauOffline.importFile` takes it: 1, 2, 3 for +X, +Y, +Z, negated for the opposite direction.
 *
 * @param axis - an axis and direction from the wire
 * @returns its code
 */
const axisCode = ({ axis, direction }: WireAxis): number =>
  ('xyz'.indexOf(axis) + 1) * (direction === 'negative' ? -1 : 1);

const directory = '/tmp/offline_import';

/**
 * Runs a filesystem call whose failure means there is nothing to do: the directory exists, or the file is gone.
 *
 * @param call - the filesystem call
 */
const quietly = (call: () => void): void => {
  try {
    call();
  } catch {
    // Nothing to do.
  }
};

/**
 * Imports the files of an `import_files` command as one body with the command's id.
 *
 * @param engine - offline engine
 * @param id - command id, which kcl-lib uses as the imported geometry's id
 * @param cmd - `import_files` command
 * @returns `ImportFiles` response
 */
export function importFiles(engine: OfflineEngine, id: string, cmd: ModelingCommand): Record<string, unknown> {
  const { oc } = engine;
  const format = cmd['format'] as WireInputFormat;
  const files = cmd['files'] as Array<{ path: string; data: number[] }>;
  const importFile = (oc as Oc & { TauOffline?: { importFile?: ImportFile } }).TauOffline?.importFile;
  const paths = files.map((file) => `${directory}/${file.path}`);
  try {
    // A glTF's buffers keep their relative paths, so the reader finds them beside the main file.
    for (const [index, file] of files.entries()) {
      const parts = paths[index]!.split('/');
      for (let depth = 3; depth < parts.length; depth++) {
        quietly(() => {
          oc.FS.mkdir(parts.slice(0, depth).join('/'));
        });
      }

      oc.FS.writeFile(paths[index]!, Uint8Array.from(file.data));
    }

    // Kcl-lib sends the engine's own axes (Z up, -Y forward) when the import names none.
    const shape = importFile?.(
      paths[0] ?? directory,
      format.type,
      format.coords ? axisCode(format.coords.forward) : -2,
      format.coords ? axisCode(format.coords.up) : 3,
      1 / unitScale(format.units, 1),
    );
    if (!shape || shape.IsNull()) {
      throw new OfflineEngineError(`Could not import ${files[0]?.path ?? 'nothing'} as ${format.type}`, 'bad_request');
    }

    engine.scene.add({ kind: 'solid', id, shape, faces: new Map(), edges: new Map(), sweeps: [], hidden: false });
  } finally {
    for (const path of paths) {
      quietly(() => {
        oc.FS.unlink(path);
      });
    }
  }

  return { object_id: id };
}
/* eslint-enable @typescript-eslint/naming-convention -- end Kittycad wire JSON field names */
