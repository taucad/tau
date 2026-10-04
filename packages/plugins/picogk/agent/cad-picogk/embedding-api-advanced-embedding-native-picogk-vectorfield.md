# PicoGK — Advanced embedding/native — PicoGK.VectorField

5 top-level symbols. Signatures are verbatim csharp.

// Category: Advanced embedding/native
// Borrowed library owner
// PicoGK.VectorField.lib (field)
public readonly Library lib;

// Category: Advanced embedding/native
// PicoGK.VectorField._hCreate (method)
public static extern VectorFieldHandle _hCreate(LibHandle hLib)

// Category: Advanced embedding/native
// PicoGK.VectorField._hCreateCopy (method)
public static extern VectorFieldHandle _hCreateCopy(LibHandle hLib, VectorFieldHandle hSource)

// Category: Advanced embedding/native
// PicoGK.VectorField._hCreateFromVoxels (method)
public static extern VectorFieldHandle _hCreateFromVoxels(LibHandle hLib, VoxHandle hVoxels)

// Category: Advanced embedding/native
// PicoGK.VectorField._hBuildFromVoxels (method)
public static extern VectorFieldHandle _hBuildFromVoxels(LibHandle hLib, VoxHandle hVoxels, in Vector3 vecValue, float fSDThreshold)
