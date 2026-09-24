/**
 * Bambu `.gcode.3mf` container reader and writer.
 *
 * Lane B implements `writeBambuContainer` and `readBambuContainer`; this file
 * exists so the `./container` subpath resolves for concurrent consumers.
 *
 * @module
 */

/** Members every print-ready Bambu container carries; names follow the S-M4 census. @public */
export const bambuPlateMember = 'Metadata/plate_1.gcode';
