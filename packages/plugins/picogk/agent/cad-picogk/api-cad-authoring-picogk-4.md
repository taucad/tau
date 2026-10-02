# PicoGK — CAD authoring — PicoGK (4)

3 top-level symbols. Signatures are verbatim csharp.

// Category: CAD authoring
// PicoGK viewer
public partial class Viewer : IDisposable

  public delegate void InfoCallback(string strMessage, bool bFatalError);

  public delegate void UpdateCallback(IntPtr hViewer, in Vector2 vecViewport, ref ColorFloat clrBackground, ref Matrix4x4 matVP, ref Vector3 vecEye);

  public delegate void KeyPressedCallback(IntPtr hViewer, int iKey, int iScancode, int iAction, int iModifiers);

  public delegate void MouseMovedCallback(IntPtr poViewer, in Vector2 vecMousePos, bool bShift, bool bCtrl, bool bAlt, bool bCmd);

  public delegate void MouseButtonCallback(IntPtr hViewer, int iButton, int iAction, int iModifiers, in Vector2 vecMousePos);

  public delegate void ScrollWheelCallback(IntPtr hViewer, in Vector2 vecScrollWheel, in Vector2 vecMousePos, bool bShift, bool bCtrl, bool bAlt, bool bCmd);

  public delegate void WindowSizelCallback(IntPtr hViewer, in Vector2 vecWindowSize);

  public partial class GpuTex : IDisposable

    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

  public partial class ImageQuad : IDisposable

    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

  public partial class SideBar : IDisposable

    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

  // True when viewer operations are delegated to an embedding backend
  public bool bIsHosted { get; }

  // Access to the rotational component (orientation) of the viewer
  public Quaternion qOrientation { get; set; }

  public readonly Quaternion qOrientationHome;

  public readonly Quaternion qOrientationTop;

  public readonly Quaternion qOrientationBottom;

  public readonly Quaternion qOrientationFront;

  public readonly Quaternion qOrientationLeft;

  public readonly Quaternion qOrientationBack;

  public readonly Quaternion qOrientationRight;

  // An abstract interface for viewer actions
  public interface IViewerAction

    // Called from inside the main viewer thread to execute the action
    void Do(Viewer oViewer)
    //   oViewer: Viewer object to work with

  public class AnimGroupMatrixRotate : Animation.IAction

    public AnimGroupMatrixRotate(Viewer oViewer, int nGroup, Matrix4x4 matInit, Vector3 vecAxis, float fDegrees)

    public void Do(float fFactor)

  // Animate view rotation
  public class AnimViewRotate : Animation.IAction

    // Animate movement to a viewer orientation
    public AnimViewRotate(Viewer oViewer, Quaternion qFrom, Quaternion qTo)
    //   oViewer: Viewer to use
    //   qFrom: Original orientation Quaternion Format
    //   qTo: New orientation in Quaternion format

    public void Do(float fFactor)

  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

  // Capture an application-defined mechanism on a hosted viewer
  // Remarks: The native viewer throws NotSupportedException. Tau snapshots supported JSON-equivalent values synchronously: known structural C# properties accept idiomatic PascalCase or canonical names; dictionary keys and raw JSON remain exact. JsonPropertyName and JsonIgnore are honored, numeric enum values are retained, and readable getters run once. Invalid projection clears mechanism metadata with a warning while retaining geometry; cancellation and allocation failure propagate.
  public void SetMechanism(object source)

  // Request a refresh of the viewer
  public void RequestUpdate()

  // Load the IBL light setup from the specified ZIP file
  public void LoadLightSetup(string strFilePath)
  public void LoadLightSetup(Stream oStream)

  // Add the object to the viewer, using the specified viewer group
  // Remarks: Tau hosted Add owns an independent geometry snapshot before returning. Dispose temporary geometry with ordinary using statements; mutate and Add again to publish a replacement for the same object reference. Native viewers also capture geometry before returning; queued operations own that capture until processing or teardown.
  public void Add(in Voxels vox, string name, int nGroupID = 0)
  public void Add(in Voxels vox, int nGroupID = 0)
  public void Add(Mesh msh, string name, int nGroupID = 0)
  public void Add(Mesh msh, int nGroupID = 0)
  public void Add(PolyLine oPoly, string name, int nGroupID = 0)
  public void Add(PolyLine oPoly, int nGroupID = 0)

  // Removes the object from the viewer
  public void Remove(Voxels vox)
  public void Remove(Mesh msh)
  public void Remove(PolyLine oPoly)

  // Set the transformation matrix for the specified object
  public void SetObjectMatrix(Voxels vox, in Matrix4x4 mat)
  public void SetObjectMatrix(Mesh msh, in Matrix4x4 mat)
  public void SetObjectMatrix(PolyLine poly, in Matrix4x4 mat)

  // Remove all objects from the viewer
  public void RemoveAllObjects()

  // Request screenshot (TGA), which will be saved to the the specified location
  // Remarks: Tau hosted screenshots are a no-op. Native viewer screenshot support follows the native window backend.
  public void RequestScreenShot(string strScreenShotPath)

  // Enable/disable experimental rendering features
  // Remarks: Tau hosted experimental rendering is unsupported and raises a worker capability issue. Native viewer support follows its backend.
  public void EnableExperimental(bool bEnable)

  // Enable or disable the display of a viewer group
  public void SetGroupVisible(int nGroupID, bool bVisible)

  // Assign a typed physical material to every object in the hosted group
  // Remarks: Tau owns a copy of encoded image bytes before returning. Invalid material input reports a worker validation issue identifying its group and property path.
  // Throws: System.ArgumentNullException: The material is null.
  // Throws: System.NotSupportedException: The viewer has no hosted backend.
  public void SetGroupMaterial(int groupId, Material material)
  public void SetGroupMaterial(int nGroupID, ColorFloat clr, float fMetallic, float fRoughness)
  //   groupId: Existing viewer group assignment
  //   material: Appearance and encoded textures, snapshotted synchronously

  // Set the group's transformation matrix
  public void SetGroupMatrix(int nGroupID, Matrix4x4 mat)

  // Enables overhang severity visualization for the specified viewer group
  public void EnableOverhangWarning(int nGroupID, Overhang uWarning, Overhang uError)
  public void EnableOverhangWarning(int nGroupID, int nWarningAngleDeg, int nErrorAngleDeg)
  //   nGroupID: Viewer group ID
  //   uWarning: Overhang at which the warning color sets in
  //   uError: Overhang at which the error color sets in

  // Disables the overhang angle warning of the specified group
  public void DisableOverhangWarning(int nGroupID)

  // Returns the bounding box of all elements inside the view
  public BBox3 oBBox()

  // Sets the background color of the viewer
  public void SetBackgroundColor(ColorFloat clr)

  // Zoom to fit the contents of the viewer
  // Remarks: Tau hosted zoom-to-fit camera control is unsupported and raises a worker capability issue.
  public void ZoomToFit()

  // Set Vertical Field of View in radians (i.e
  public void SetFov(float fAngle)

  // Allows you to query if all viewer actions are complete
  public bool bIsIdle()

  public void AddAnimation(Animation oAnim)

  public void RemoveAllAnimations()

  // Marks the supplied coordinate with a cross-shaped polyline
  public void AddCross(Vector3 vecPt, ColorFloat clr, float fSizeMM = 1f, int nViewerGroup = 0)
  public void AddCross(Vector3 vecPt)
  //   vecPt: Coordinate of the point to mark
  //   clr: Color of the point
  //   fSizeMM: Size of the cross in mm
  //   nViewerGroup: Viewer group to use

  // Adds an line ending in an arrow to the viewer
  public void AddArrow(Vector3 vecPtFrom, Vector3 vecPtTo, ColorFloat clr, float fSizeMM = 1f, int nViewerGroup = 0)
  public void AddArrow(Vector3 vecPtFrom, Vector3 vecPtTo)
  //   vecPtFrom: Start point of the line
  //   vecPtTo: End point of the line
  //   clr: Color of the line
  //   fSizeMM: Size of the arrow in mm
  //   nViewerGroup: Viewer group to use

// Category: CAD authoring
// Visualizes the result of a voxel filed cut along an axis slice
public class VoxCutViz : IDisposable

  // Number of slices in the voxel field
  public int nSliceCount { get; }

  // Initializes a new VoxCutViz object with the specified Viewer and VoxelField
  public VoxCutViz(Viewer oViewer, Voxels vox, int nViewerGroup = 0, Voxels.ESliceAxis eAxis = Voxels.ESliceAxis.Z)
  //   oViewer: Viewer to use to visualize
  //   vox: Voxel field to slice and cut
  //   nViewerGroup: Viewer group to use for the sliced object
  //   eAxis: Axis along which to slice

  // Cut the voxel field along the two normalized values (0 is the first slice 1 is the last)
  public void Cut(float fNormalizedPos1 = 0.0f, float fNormalizedPos2 = 0.0f)
  public void Cut(int nSlice1, int nSlice2)
  //   fNormalizedPos1: First slice position (0..1)
  //   fNormalizedPos2: Second slice position (0..1)

  // Call to stop the visualization (or let the object go out of scope, if you used using)
  public void Dispose()

// Category: CAD authoring
public partial class Voxels : IFieldWithMetadata, IDisposable

  // Returns the voxel size in millimeters used in the voxel field
  public float fVoxelSize { get; }

  public enum ESliceMode

    SignedDistance

    BlackWhite

    Antialiased

  public enum ESliceAxis

    X

    Y

    Z

  public FieldMetadata m_oMetadata;

  // Return metadata borrowed from this field owner
  // Remarks: The field disposes its metadata. Keep the metadata within the field lifetime and leave its disposal to that field.
  public FieldMetadata oMetaData()

  // Create a new empty voxels object, using the global library instance
  public Voxels()
  public Voxels(in IImplicit xImplicit, in BBox3 oBounds)
  public Voxels(in IBoundedImplicit xImplicit)
  public Voxels(Library libSet)
  public Voxels(in Voxels voxSource)
  public Voxels(in ScalarField oSource)
  public Voxels(Library libSet, in IImplicit xImplicit, in BBox3 oBounds)
  public Voxels(Library libSet, in IBoundedImplicit xImplicit)
  public Voxels(in Mesh msh)
  public Voxels(in Lattice lat)

  // Create a new Voxels object using the global library instance, rendering a sphere with the specified center and radius
  public static Voxels voxSphere(Vector3 vecCenter, float fRadius)
  public static Voxels voxSphere(Library libSet, Vector3 vecCenter, float fRadius)
  //   vecCenter: Center of the sphere
  //   fRadius: Radius of the Sphere

  // Returns a lattice beam with hemispherical ends internally uses an optimized internal function, so is faster than the general lattice functions
  public static Voxels voxLatticeBeam(Vector3 vec1, float fRadius1, Vector3 vec2, float fRadius2)
  public static Voxels voxLatticeBeam(Library libSet, Vector3 vec1, float fRadius1, Vector3 vec2, float fRadius2)
  //   vec1: Start point
  //   fRadius1: Radius at start
  //   vec2: End point
  //   fRadius2: Radius at end

  // Creates a shelled (hollow) Voxels object from a mesh
  public static Voxels voxMeshShell(Mesh msh, float fRadius)
  public static Voxels voxMeshShell(Library libSet, Mesh msh, float fRadius)
  //   msh: Mesh object
  //   fRadius: Offset radius (in all directions)

  // Create a new Voxels object using the global library instance, and adds all voxel fields in the container, returning the result
  public static Voxels voxCombineAll(in IEnumerable<Voxels> avoxList)
  public static Voxels voxCombineAll(Library libSet, in IEnumerable<Voxels> avoxList)
  //   avoxList: Container with the voxel fields

  // Create Voxels from a OpenVDB file (.vdb) using the global library instance
  // Throws: System.IO.FileLoadException: If file is empty or no compatible field found, an exception is thrown.
  public static Voxels voxFromVdbFile(string strFileName)
  public static Voxels voxFromVdbFile(Library libSet, string strFileName)
  //   strFileName: Path and file name of the VDB file

  // Create a duplicate of the current voxel field
  public Voxels voxDuplicate()

  // Return the current voxel field as a mesh
  public Mesh mshAsMesh()

  // Checks whether this Voxels object is empty, i.e
  public bool bIsEmpty()

  // Returns the amount of memory in bytes used by this object
  public long nMemUsage()

  // Performs a boolean union between two voxel fields Our voxelfield will have all the voxels set that the operands also has set
  public void BoolAdd(in Voxels voxOperand)
  //   voxOperand: Voxels to add to our field

  // Performs a boolean union operation on a copy of the current voxel field and the operand and returns the copy
  public Voxels voxBoolAdd(in Voxels voxOperand)
  //   voxOperand: Voxels to add

  // Performs a boolean union of all voxels supplied in the container (List, Array, etc.)
  public void BoolAddAll(in IEnumerable<Voxels> avoxList)
  //   avoxList: Container containing Voxels to be added

  // Performs a boolean union of all voxels supplied in the container (List, Array, etc.) on a copy of the current voxel field and returns that copy
  public Voxels voxBoolAddAll(in IEnumerable<Voxels> avoxList)
  //   avoxList: Container containing Voxels to be added

  // Combines two voxel fields and returns the result using BoolAdd
  public static Voxels voxCombine(in Voxels vox1, in Voxels vox2)
  //   vox1: First field
  //   vox2: Second field

  // Performs a boolean difference between the two voxel fields Our voxel field's voxel will have all the matter removed that is set in the operand
  public void BoolSubtract(in Voxels voxOperand)
  //   voxOperand: Voxels to remove from our field

  // Performs a boolean difference operation on a copy of the current voxel field and the operand and returns the copy
  public Voxels voxBoolSubtract(in Voxels voxOperand)
  //   voxOperand: Voxels to add

  // Subtracts on all voxels supplied in the container (List, Array, etc.) from the current field
  public void BoolSubtractAll(in IEnumerable<Voxels> avoxList)
  //   avoxList: Container containing Voxels to be subtracted

  // Subtracts on all voxels supplied in the container (List, Array, etc.) from a copy of the current field and returns the result
  public Voxels voxBoolSubtractAll(in IEnumerable<Voxels> avoxList)
  //   avoxList: Container containing Voxels to be subtracted

  // Performs a boolean intersection between two voxel fields
  public void BoolIntersect(in Voxels voxOperand)
  //   voxOperand: Voxels masking our voxel field

  // Performs a boolean intersection operation on a copy of the current voxel field and the operand and returns the copy
  public Voxels voxBoolIntersect(in Voxels voxOperand)
  //   voxOperand: Voxels to intersect with

  // Overloaded operators allow you to do things like vox = vox1 + vox2
  public static Voxels operator +(Voxels voxA, Voxels voxB)

  // Overloaded operators allow you to do things like vox = vox1 - vox2
  public static Voxels operator -(Voxels voxA, Voxels voxB)

  // Overloaded operator for intersect (boolean AND) vox = vox1 & vox2
  public static Voxels operator &(Voxels voxA, Voxels voxB)

  // Intersects the voxel field with the specified bounding box so all voxels outside the box are trimmed away
  public void Trim(BBox3 oBox)

  // Intersects a copy of the voxel field with the specified bounding box so all voxels outside the box are trimmed away
  public Voxels voxTrim(BBox3 oBox)

  // Offsets the voxel field by the specified distance
  public void Offset(float fDistMM)
  //   fDistMM: The distance to move the surface outward (positive) or inward (negative) in millimeters

  // Offsets a copy of the voxel field by the specified distance
  public Voxels voxOffset(float fDistMM)
  //   fDistMM: The distance to move the surface outward (positive) or inward (negative) in millimeters

  // Offsets the voxel field twice, by the specified distances Outwards is positive, inwards is negative
  public void DoubleOffset(float fDist1MM, float fDist2MM)
  //   fDist1MM: First offset distance in mm
  //   fDist2MM: Second distance in mm

  // Offsets a copy of the voxel field twice, by the specified distances Outwards is positive, inwards is negative
  public Voxels voxDoubleOffset(float fDist1MM, float fDist2MM)
  //   fDist1MM: First distance to offset
  //   fDist2MM: Second distance to offset

  // Offsets the voxel field three times by the specified distance
  public void TripleOffset(float fDistMM)
  //   fDistMM: Distance to move (in mm)

  // Offsets a copy of the voxel field three times by the specified distance
  public Voxels voxTripleOffset(float fDistMM)
  //   fDistMM: Distance to move (in mm)

  // Same as TripleOffset
  public void Smoothen(float fDistMM)
  //   fDistMM: Distance to move (in mm)

  // Same as TripleOffset
  public Voxels voxSmoothen(float fDistMM)
  //   fDistMM: Distance to move (in mm)

  // Similar to DoubleOffset, but allows you to specify the offsetted distance to the original surface as the second parameter
  public void OverOffset(float fFirstOffsetMM, float fFinalSurfaceDistInMM = 0)
  //   fFirstOffsetMM: Initial offset
  //   fFinalSurfaceDistInMM: absolute final offset value

  // Similar to DoubleOffset, but allows you to specify the offsetted distance to the original surface as the second parameter
  public Voxels voxOverOffset(float fFirstOffsetMM, float fFinalSurfaceDistInMM = 0)
  //   fFirstOffsetMM: Initial offset
  //   fFinalSurfaceDistInMM: Absolute final offset from initial surface

  // Creates a fillet-like effect
  public void Fillet(float fRoundingMM)

  // Creates a fillet-like effect
  public Voxels voxFillet(float fRoundingMM)

  // Creates a shell of a voxel field
  public Voxels voxShell(float fOffset)
  public Voxels voxShell(float fNegOffsetMM, float fPosOffsetMM, float fSmoothInnerMM = 0f)

  // Renders a mesh into the voxel field, combining it with the existing content
  public void RenderMesh(in Mesh msh)
  //   msh: The mesh to render (needs to be a closed surface)

  // Render an implicit signed distance function into the voxels overwriting the existing content with the voxels where the implicit function returns smaller or equal to 0 You will often want to use IntersectImplicit instead
  public void RenderImplicit(in IImplicit xImp, in BBox3 oBounds)
  //   xImp: Implicit object with signed distance function
  //   oBounds: Bounding box in which to render the implicit

  // Render an implicit signed distance function into the voxels but using the existing voxels as a mask
  public void IntersectImplicit(in IImplicit xImp)
  //   xImp: Implicit object with signed distance function

  // Same as IntersectImplicit, but uses a copy of the current voxel field and returns the result
  public Voxels voxIntersectImplicit(in IImplicit xImp)
  //   xImp: Implicit function to use

  // Renders a lattice into the voxel field, combining it with the existing content
  public void RenderLattice(in Lattice lat)
  //   lat: The lattice to render

  // Projects the slices at the start Z position upwards or downwards, until it reaches the end Z position
  public void ProjectZSlice(float fStartZMM, float fEndZMM)
  //   fStartZMM: Start voxel slice in mm
  //   fEndZMM: End voxel slice in mm

  // Makes a copy of the voxel field and applies the ProjectZSlice function to the copy
  public Voxels voxProjectZSlice(float fStartZMM, float fEndZMM)

  // Returns true if the voxel fields contain the same content
  public bool bIsEqual(in Voxels voxOther)
  //   voxOther: Voxels to compare to

  // This function evaluates the entire voxel field and returns the volume of all voxels in cubic millimeters and the Bounding Box in real world coordinates Note this function is potentially slow, as it needs to traverse the entire voxel field
  public void CalculateProperties(out float fVolumeCubicMM, out BBox3 oBBox)
  //   fVolumeCubicMM: Cubic MMs of volume filled with voxels
  //   oBBox: The real world bounding box of the voxels

  // Calculates the bounding box of a voxel field Note
  public BBox3 oCalculateBoundingBox()

  // Returns whether the location specified lies inside the solid domain of the voxel field (are you at or below the surface)
  public bool bIsInside(Vector3 vecTestPoint)
  //   vecTestPoint: Point to evaluate

  // Returns the normal of the surface found at the specified point
  public Vector3 vecSurfaceNormal(in Vector3 vecSurfacePoint)
  //   vecSurfacePoint: The point (on the surface of a voxel field, for which to return the normal

  // Returns the closest point from the search point on the surface of the voxel field
  public bool bClosestPointOnSurface(in Vector3 vecSearch, out Vector3 vecSurfacePoint)
  //   vecSearch: Search position
  //   vecSurfacePoint: Point on the surface of the voxel field which is closest to the supplied point

  // Returns the closest point from the search point on the surface of the voxel field
  // Throws: System.Exception: Throws an exception if no point found, which means the voxel field is empty
  public Vector3 vecClosestPointOnSurface(in Vector3 vecSearch)
  //   vecSearch: Search position

  // Casts a ray to the surface of a voxel field and finds the point on the surface where the ray intersects
  public bool bRayCastToSurface(in Vector3 vecSearch, in Vector3 vecDirection, out Vector3 vecSurfacePoint)
  //   vecSearch: Search point
  //   vecDirection: Direction to search in
  //   vecSurfacePoint: Point on the surface

  // Casts a ray to the surface of a voxel field and finds the point on the surface where the ray intersects
  // Throws: System.Exception: Throws an exception of no intersection with surface found.
  public Vector3 vecRayCastToSurface(in Vector3 vecSearch, in Vector3 vecDirection)
  //   vecSearch: Search point
  //   vecDirection: Direction to search in

  // Returns the dimensions of the voxel field in discrete voxels
  public void GetVoxelDimensions(out int nXOrigin, out int nYOrigin, out int nZOrigin, out int nXSize, out int nYSize, out int nZSize)
  public void GetVoxelDimensions(out int nXSize, out int nYSize, out int nZSize)
  //   nXOrigin: X origin of the voxel field in voxels
  //   nYOrigin: Y origin of the voxel field in voxels
  //   nZOrigin: Z origin of the voxel field in voxels
  //   nXSize: Size in x direction in voxels
  //   nYSize: Size in y direction in voxels
  //   nZSize: Size in z direction in voxels

  // Query the real world origin of a voxel slice, which is also the origin of the actual voxel field in space
  public Vector3 vecZSliceOrigin(int nZSlice = 0)
  //   nZSlice: Slice you are looking for

  // Return the number of slices in this voxel field
  public int nSliceCount()

  // Allocate a grayscale image that can hold a voxel slice
  public ImageGrayScale imgAllocateSlice(out int nSliceCount, ESliceAxis eAxis = ESliceAxis.Z)
  //   nSliceCount: Number of slices in the specified axis
  //   eAxis: Axis to use for the slice direction

  // Returns a slice of the voxel field along the specified axis
  public void GetVoxelSlice(in int nSlice, ref ImageGrayScale img, ESliceMode eMode = ESliceMode.SignedDistance, ESliceAxis eAxis = ESliceAxis.Z)
  //   nSlice: Slice to retrieve
  //   img: Reusable grayscale image
  //   eMode: Encoding mode of the image, defaults to signed distance, which is the native narrow band distance encoded in the float image
  //   eAxis: Axis to slice along, defaults to Z, but you can also slice along X and Y

  // Returns a signed distance-field-encoded slice of the voxel field Reuses the supplied image when its dimensions match the observed field
  public void GetInterpolatedVoxelSlice(in float fZSlice, ref ImageGrayScale img, ESliceMode eMode = ESliceMode.SignedDistance)
  //   fZSlice: Slice to retrieve
  //   img: Reusable grayscale image
  //   eMode: Encoding mode of the image, defaults to signed distance, which is the native narrow band distance encoded in the float image

  // Vectorize a Voxels object using Marching Squares
  // Throws: System.Exception: An exception is thrown if no slices are detected.
  public PolySliceStack oVectorize(float fLayerHeight = 0f, bool bUseAbsXYOrigin = false, IProgress? xProgress = null)
  //   fLayerHeight: Layer height in MM
  //   bUseAbsXYOrigin: By default the origin lies at 0/0 of the bounding box
  //   xProgress: Optional parameter that allows you to report the progress

  // Save the voxel field to a .cli file CLI is an quasi industry standard for exchanging layer information with Laser Powder Bed Fusion (LBPF) industrial 3D printers
  public void SaveToCliFile(string strFileName, float fLayerHeight = 0f, CliIo.EFormat eFormat = CliIo.EFormat.FirstLayerWithContent, bool bUseAbsXYOrigin = false, IProgress? xProgress = null)
  //   strFileName: File name of the .CLI file
  //   fLayerHeight: Layer height in mm Typical values are 30 micron (0.03f) or 60 micron (0.06f)
  //   eFormat: Format options
  //   bUseAbsXYOrigin: If specified, the CLI file uses the position in space in X/Y that the voxel field was in
  //   xProgress: Optional progress reporting interface

  // Creates a new .vdb file and saves the voxel field to it
  // Throws: Throws an exception if unable to save
  public void SaveToVdbFile(string strFileName)
  //   strFileName: Path and filename of the file

  public void Dispose()
  protected virtual void Dispose(bool bDisposing)
