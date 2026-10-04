/**
 * How large an admitted JSON Schema may be. A slicer's full settings (Bambu Studio: about 400 described
 * settings, 3,000 nodes and 60,000 characters) fits with room to spare; depth stays shallow.
 * @internal
 */
export const jsonSchemaBudget = { maximumDepth: 20, maximumNodes: 8192, maximumCharacters: 262_144 } as const;
