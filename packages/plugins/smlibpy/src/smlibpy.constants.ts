/**
 * Browser-safe SMLibPy kernel metadata shared by registration adapters.
 */

/**
 * The Python module SMLibPy authors import the modeling API from.
 * @public
 */
export const smlibpyModuleName = 'smlibpy';

/**
 * Detects an entry that imports SMLibPy: `import smlibpy`, `import numpy, smlibpy as sm`, `from smlibpy import ...` or
 * `from smlibpy.parts import ...`, at the start of a line. A `.py` entry that matches selects SMLibPy; any other `.py`
 * entry falls through to the next Python kernel, so SMLibPy is listed before build123d.
 * @public
 */
export const smlibpyDetectPattern =
  /^[\t ]*(?:import[\t ]+(?:[\w.]+(?:[\t ]+as[\t ]+\w+)?[\t ]*,[\t ]*)*smlibpy\b|from[\t ]+smlibpy(?:\.\w+)*[\t ]+import\b)/mu;
