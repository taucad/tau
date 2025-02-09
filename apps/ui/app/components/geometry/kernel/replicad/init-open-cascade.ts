import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';

import opencascadeWithExceptions from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import opencascadeWithExceptionsWasm from 'replicad-opencascadejs/src/replicad_with_exceptions.wasm?url';

export const initOpenCascade = async () => {
  // @ts-expect-error - incorrect types
  const OpenCascade = await opencascade({
    locateFile: () => opencascadeWasm,
  });

  return OpenCascade;
};

export const initOpenCascadeWithExceptions = async () => {
  // @ts-expect-error - incorrect types
  const OpenCascadeWithExceptions = await opencascadeWithExceptions({
    locateFile: () => opencascadeWithExceptionsWasm,
  });

  return OpenCascadeWithExceptions;
};
