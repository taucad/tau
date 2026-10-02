# PicoGK — Advanced embedding/native — PicoGK.Library

6 top-level symbols. Signatures are verbatim csharp.

// Category: Advanced embedding/native
// Create a new Library instance, using the specified voxel size in MM
public Library(float fVoxelSizeMM)
//   fVoxelSizeMM: Voxel size in MM

// Category: Advanced embedding/native
public static void RegisterGlobalLibrary(Library oLibrary)

// Category: Advanced embedding/native
public static void UnregisterGlobalLibrary()

// Category: Advanced embedding/native
public static void RegisterGlobalViewer(Viewer oViewer)

// Category: Advanced embedding/native
public static void UnregisterGlobalViewer()

// Category: Advanced embedding/native
// Temporarily route PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) through a host supplied by an embedding application
public static IDisposable UseHost(ILibraryHost xHost)
