# PicoGK — PicoGK (3)

10 top-level symbols. Signatures are verbatim csharp.

Utils

  // Creates a temporary folder with an arbitrary filename in the system's default temp directory, which is guaranteed to be writable (we don't check this, but the system should guarantee it) Use the "using" syntax to automatically cleanup after the object runs out of scope
  TempFolder

    strFolder: string

    public TempFolder()

    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

  // Helper function to create simple box mesh from a bounding box
  public static Mesh mshCreateCube(BBox3 oBox)
  public static Mesh mshCreateCube(Vector3? vecScale = null, Vector3? vecOffsetMM = null)
  public static Mesh mshCreateCube(Library lib, BBox3 oBox)
  public static Mesh mshCreateCube(Library lib, Vector3? vecScale = null, Vector3? vecOffsetMM = null)

  // Strip quotes of a quoted path like "/usr/lib/" -> /usr/lib/
  public static string strStripQuotesFromPath(string strPath)

  // Strips the extension from a filename
  public static string strStripExtension(string strPath)

  // Wait for a file's creation
  public static bool bWaitForFileExistence(string strFile, float fTimeOut = 1000000)

  // Returns the path to the home folder (cross platform compatible)
  public static string strHomeFolder()

  // Returns the path to the documents folder (cross platform compatible)
  public static string strDocumentsFolder()

  // Returns the path to the source folder of your project, under the assumption that the executable .NET DLL is in its usual place
  public static string strProjectRootFolder()

  // Returns the path to the source folder of PicoGK, making the following Assumptions
  public static string strPicoGKSourceCodeFolder()

  // Returns the path in which your current executable resides
  public static string strExecutableFolder()

  // Returns a file name in the form 20230930_134500 to be used in log files etc
  public static string strDateTimeFilename(in string strPrefix, in string strPostfix)
  //   strPrefix: Prepended before the date/time stamp
  //   strPostfix: Appended after the date/time stamp

  // Shorted a string, IF it is too long
  public static string strShorten(string str, int iMaxCharacters)
  //   str: String to shorten (if too long)
  //   iMaxCharacters: Number of max characters in the string

// Helper class to save a voxel field contained in a VDB file to a CLI slice file
Vdb2Cli

  // Convert a voxel field to a CLI slice file
  public static void Convert(string strVdbFilePath, float fCliLayerHeight, string strCliFilePath = "", string strVoxelFieldName = "", IProgress? xProgress = null)
  //   strVdbFilePath: Path to the VDB file
  //   fCliLayerHeight: Layer height in millimeters
  //   strCliFilePath: Path to the CLI file
  //   strVoxelFieldName: Name of the voxel field, or the first voxel field in the file
  //   xProgress: Progress reporting interface

VdbHandle

  Value: long

  public VdbHandle(long Value)

VdbMetaHandle

  Value: nint

  public VdbMetaHandle(nint Value)

// A Field of 3D floating point vectors
VectorField

  // VectorField metadata
  m_oMetadata: FieldMetadata

  lib: Library

  public FieldMetadata oMetaData()

  // Create an empty VectorField object
  public VectorField()
  public VectorField(Library libSet)
  public VectorField(in VectorField oSource)
  public VectorField(Voxels vox)
  public VectorField(Voxels vox, Vector3 vecValue, float fSdThreshold = 0.5)

  // Sets the value at the specified position in mm When you set a value, the position gets "activated" When no value is set, the position doesn't contain a value, and bGetValue returns false
  public void SetValue(Vector3 vecPosition, Vector3 vecValue)
  //   vecPosition: Position in mm
  //   vecValue: Value

  // Get the value at the specified position If the specified position doesn't contain a value the function returns false
  public bool bGetValue(Vector3 vecPosition, out Vector3 vecValue)
  //   vecPosition: Position in mm
  //   vecValue: Value at position

  // Removes the value at the specified position
  public void RemoveValue(Vector3 vecPosition)
  //   vecPosition: Position of the value in space

  // Visit each active value in the vector field and call the InformActiveValue methot of the ITraverseVectorField interface
  public void TraverseActive(ITraverseVectorField xTraverse)
  //   xTraverse: The interface containing the callback

  public static extern VectorFieldHandle _hCreate(LibHandle hLib)

  public static extern VectorFieldHandle _hCreateCopy(LibHandle hLib, VectorFieldHandle hSource)

  public static extern VectorFieldHandle _hCreateFromVoxels(LibHandle hLib, VoxHandle hVoxels)

  public static extern VectorFieldHandle _hBuildFromVoxels(LibHandle hLib, VoxHandle hVoxels, in Vector3 vecValue, float fSDThreshold)

  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

VectorFieldHandle

  Value: nint

  public VectorFieldHandle(nint Value)

VectorFieldMerge

  public static void Merge(VectorField oSource, VectorField oTarget)

  protected VectorFieldMerge(VectorField oSource, VectorField oTarget)

  protected void Run()

  public void InformActiveValue(in Vector3 vecPosition, in Vector3 vecValue)

// PicoGK viewer
Viewer

  InfoCallback

  UpdateCallback

  KeyPressedCallback

  MouseMovedCallback

  MouseButtonCallback

  ScrollWheelCallback

  WindowSizelCallback

  GpuTex

    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

    public GpuTex(Viewer oSetViewer, ImageRgba32 img)

    public void ReplaceWith(ImageRgba32 img)

  ImageQuad

    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

    public ImageQuad(Viewer oSetViewer, ImageRgba32 img, ColorFloat clrDefault, float fAlpha, Matrix4x4 matDefault, bool bFlipX, bool bFlipY, bool bDoubleSided)

    public void UpdateImage(ImageRgba32 img)

    public void UpdateMatrix(in Matrix4x4 mat)

  SideBar

    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

    public SideBar(Viewer oSetViewer, bool bLeft, int nMin, int nMax, int nDef, ColorFloat clrNormal, ColorFloat clrHovered)

  // True when viewer operations are delegated to an embedding backend
  bIsHosted: bool

  // Access to the rotational component (orientation) of the viewer
  qOrientation: Quaternion

  qOrientationHome: Quaternion

  qOrientationTop: Quaternion

  qOrientationBottom: Quaternion

  qOrientationFront: Quaternion

  qOrientationLeft: Quaternion

  qOrientationBack: Quaternion

  qOrientationRight: Quaternion

  // An abstract interface for viewer actions
  IViewerAction

    // Called from inside the main viewer thread to execute the action
    void Do(Viewer oViewer)
    //   oViewer: Viewer object to work with

  AnimGroupMatrixRotate

    public AnimGroupMatrixRotate(Viewer oViewer, int nGroup, Matrix4x4 matInit, Vector3 vecAxis, float fDegrees)

    public void Do(float fFactor)

  // Animate view rotation
  AnimViewRotate

    // Animate movement to a viewer orientation
    public AnimViewRotate(Viewer oViewer, Quaternion qFrom, Quaternion qTo)
    //   oViewer: Viewer to use
    //   qFrom: Original orientation Quaternion Format
    //   qTo: New orientation in Quaternion format

    public void Do(float fFactor)

  // Abstract camera class to interact with the view
  Camera

    // Drag, Spin, Pan the camera
    EDragType

      // Rotate the camera (up/down)
      Rotate: Rotate

      // Spin the camera around the view vector
      Spin: Spin

      // Move the camera up/down
      Pan: Pan

    qOrientation: Quaternion

    matVP: Matrix4x4

    vecEye: Vector3

    public abstract void SetViewPort(Vector2 vecSize, float fSceneDepth)

    public abstract void LookAt(Vector3 vec)

    public abstract void ZoomToFit(BBox3 oBBox)

    public abstract void Scroll(Vector2 vecMouseRel)

    public abstract void MouseDrag(Vector2 vecMouseRel, Viewer.Camera.EDragType eType)

  CamPerspectiveArcball

    matVP: Matrix4x4

    vecEye: Vector3

    qOrientation: Quaternion

    public CamPerspectiveArcball(float fFovVertical = 0.7853982)

    public void SetVerticalFov(float fFov)

    public override void SetViewPort(Vector2 vecSizePx, float fSceneRadius)

    public override void LookAt(Vector3 vec)

    public override void ZoomToFit(BBox3 oBBox)

    public override void MouseDrag(Vector2 vecMouseRel, Viewer.Camera.EDragType eType)

    public override void Scroll(Vector2 vecMouseRel)

  IKeyHandler

    bool bHandleEvent(Viewer oViewer, Viewer.EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

  EKeys

    Key_Space: Key_Space

    Key_0: Key_0

    Key_1: Key_1

    Key_2: Key_2

    Key_3: Key_3

    Key_4: Key_4

    Key_5: Key_5

    Key_6: Key_6

    Key_7: Key_7

    Key_8: Key_8

    Key_9: Key_9

    Key_A: Key_A

    Key_B: Key_B

    Key_C: Key_C

    Key_D: Key_D

    Key_E: Key_E

    Key_F: Key_F

    Key_G: Key_G

    Key_H: Key_H

    Key_I: Key_I

    Key_J: Key_J

    Key_K: Key_K

    Key_L: Key_L

    Key_M: Key_M

    Key_N: Key_N

    Key_O: Key_O

    Key_P: Key_P

    Key_Q: Key_Q

    Key_R: Key_R

    Key_S: Key_S

    Key_T: Key_T

    Key_U: Key_U

    Key_V: Key_V

    Key_W: Key_W

    Key_X: Key_X

    Key_Y: Key_Y

    Key_Z: Key_Z

    Key_ESC: Key_ESC

    Key_Enter: Key_Enter

    Key_Tab: Key_Tab

    Key_Backspace: Key_Backspace

    Key_Insert: Key_Insert

    Key_Delete: Key_Delete

    Key_Right: Key_Right

    Key_Left: Key_Left

    Key_Down: Key_Down

    Key_Up: Key_Up

    Key_PgUp: Key_PgUp

    Key_PgDn: Key_PgDn

    Key_Home: Key_Home

    Key_End: Key_End

    Key_F1: Key_F1

    Key_F2: Key_F2

    Key_F3: Key_F3

    Key_F4: Key_F4

    Key_F5: Key_F5

    Key_F6: Key_F6

    Key_F7: Key_F7

    Key_F8: Key_F8

    Key_F9: Key_F9

    Key_F10: Key_F10

    Key_F11: Key_F11

    Key_F12: Key_F12

  KeyAction

    public KeyAction(Viewer.IViewerAction xAction, Viewer.EKeys eKey, bool bPressed = false, bool bShift = false, bool bCtrl = false, bool bAlt = false, bool bCmd = false)

    public bool bKeyEquals(Viewer.EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

    public void Do(Viewer oViewer)

  KeyHandler

    public void AddAction(Viewer.KeyAction oAction)

    public bool bHandleEvent(Viewer oViewer, Viewer.EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

  public static extern nint _hCreate(string strWindowTitle, in Vector2 vecSize, Viewer.InfoCallback fnInfoCallback, Viewer.UpdateCallback fnUpdateCallback, Viewer.KeyPressedCallback fnKeyPressedCallback, Viewer.MouseMovedCallback fnMouseMoveCallback, Viewer.MouseButtonCallback fnMouseButtonCallback, Viewer.ScrollWheelCallback fnScrollWheelCallback, Viewer.WindowSizelCallback fnWindowSizeCallback)

  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

  // Initialize a hosted Viewer that delegates display operations without creating a native window
  public Viewer(IViewerBackend xBackend, ILog xLog)
  public Viewer(string strTitle, Vector2 vecSize, ILog xLog)

  // Run this function in your main thread while it returns true
  public bool bPoll()

  // Request a refresh of the viewer
  public void RequestUpdate()

  // Load the IBL light setup from the specified ZIP file
  public void LoadLightSetup(string strFilePath)
  public void LoadLightSetup(Stream oStream)

  // Add the object to the viewer, using the specified viewer group
  public void Add(in Voxels vox, int nGroupID = 0)
  public void Add(Mesh msh, int nGroupID = 0)
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
  public void RequestScreenShot(string strScreenShotPath)

  // Enable/disable experimental rendering features
  public void EnableExperimental(bool bEnable)

  // Enable or disable the display of a viewer group
  public void SetGroupVisible(int nGroupID, bool bVisible)

  // Set the material for this viewer group
  public void SetGroupMaterial(int nGroupID, ColorFloat clr, float fMetallic, float fRoughness)
  //   nGroupID: Group ID
  //   clr: Color of the meshes in this group
  //   fMetallic: Metallic factor 0..1
  //   fRoughness: Roughness factor 0..1

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
  public void ZoomToFit()

  // Set Vertical Field of View in radians (i.e
  public void SetFov(float fAngle)

  // Allows you to query if all viewer actions are complete
  public bool bIsIdle()

  public void AddAnimation(Animation oAnim)

  public void RemoveAllAnimations()

  public void AddKeyHandler(Viewer.IKeyHandler xKeyHandler)

  public void StartTimeLapse(float fIntervalInMilliseconds, string strPath, string strFileName = "frame_", uint nStartFrame = 0, bool bPaused = false)

  public void PauseTimeLapse()

  public void ResumeTimeLapse()

  public void StopTimeLapse()

  // Marks the supplied coordinate with a cross-shaped polyline
  public void AddCross(Vector3 vecPt, ColorFloat clr, float fSizeMM = 1, int nViewerGroup = 0)
  public void AddCross(Vector3 vecPt)
  //   vecPt: Coordinate of the point to mark
  //   clr: Color of the point
  //   fSizeMM: Size of the cross in mm
  //   nViewerGroup: Viewer group to use

  // Adds an line ending in an arrow to the viewer
  public void AddArrow(Vector3 vecPtFrom, Vector3 vecPtTo, ColorFloat clr, float fSizeMM = 1, int nViewerGroup = 0)
  public void AddArrow(Vector3 vecPtFrom, Vector3 vecPtTo)
  //   vecPtFrom: Start point of the line
  //   vecPtTo: End point of the line
  //   clr: Color of the line
  //   fSizeMM: Size of the arrow in mm
  //   nViewerGroup: Viewer group to use

  public Viewer.SideBar oCreateSideBarLeft(int nMin, int nMax, int nDef, ColorFloat clrNormal, ColorFloat clrHovered)

  public Viewer.SideBar oCreateSideBarRight(int nMin, int nMax, int nDef, ColorFloat clrNormal, ColorFloat clrHovered)

// Visualizes the result of a voxel filed cut along an axis slice
VoxCutViz

  // Number of slices in the voxel field
  nSliceCount: int

  // Initializes a new VoxCutViz object with the specified Viewer and VoxelField
  public VoxCutViz(Viewer oViewer, Voxels vox, int nViewerGroup = 0, Voxels.ESliceAxis eAxis = Z)
  //   oViewer: Viewer to use to visualize
  //   vox: Voxel field to slice and cut
  //   nViewerGroup: Viewer group to use for the sliced object
  //   eAxis: Axis along which to slice

  // Cut the voxel field along the two normalized values (0 is the first slice 1 is the last)
  public void Cut(float fNormalizedPos1 = 0, float fNormalizedPos2 = 0)
  public void Cut(int nSlice1, int nSlice2)
  //   fNormalizedPos1: First slice position (0..1)
  //   fNormalizedPos2: Second slice position (0..1)

  // Call to stop the visualization (or let the object go out of scope, if you used using)
  public void Dispose()

VoxHandle

  Value: long

  public VoxHandle(long Value)
