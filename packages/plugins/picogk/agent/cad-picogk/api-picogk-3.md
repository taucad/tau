# PicoGK — PicoGK (3)

17 top-level symbols. Signatures are verbatim csharp.

SdfVisualizer

  // Create a color image which encodes the signed distance values contained in the ScalarField
  // PicoGK.SdfVisualizer.imgEncodeFromSdf (method)
  public static ImageColor imgEncodeFromSdf(ScalarField oField, float fBackgroundValue, int nSlice, ColorFloat? _clrBackground = null, ColorFloat? _clrSurface = null, ColorFloat? _clrInside = null, ColorFloat? _clrOutside = null, ColorFloat? _clrDefect = null)
  //   oField: Scalar field to visualize
  //   fBackgroundValue: Background value, usually 3.0f
  //   nSlice: Slice to visualize
  //   _clrBackground: Color used for background value voxels
  //   _clrSurface: Color used for surface value voxels
  //   _clrInside: Color used for the voxels on the inside
  //   _clrOutside: Color used for the voxels on the outside
  //   _clrDefect: Color used for defective voxels

  // Checks if the scalar field slice contains a defective voxel
  // PicoGK.SdfVisualizer.bDoesSliceContainDefect (method)
  public static bool bDoesSliceContainDefect(ScalarField oField, int nSlice)
  //   oField: Field to analyze
  //   nSlice: Slice to analyze

  // Saves a stack of TGA files, visualizing the signed distance field contained in the ScalarField
  // PicoGK.SdfVisualizer.bVisualizeSdfSlicesAsTgaStack (method)
  public static bool bVisualizeSdfSlicesAsTgaStack(ScalarField oField, float fBackgroundValue, string strPath, string strFilePrefix = "Sdf_", bool bOnlyDefective = false, ColorFloat? _clrBackground = null, ColorFloat? _clrSurface = null, ColorFloat? _clrInside = null, ColorFloat? _clrOutside = null, ColorFloat? _clrDefect = null)
  //   oField: Scalar SDF to visualize (you can build one from if a Voxels object if needed
  //   fBackgroundValue: Background value (usually 3.0f)
  //   strPath: Path to write the image stack to
  //   strFilePrefix: File prefix to use, before slice number is appended
  //   bOnlyDefective: Write only frames that contain defective values (such as NaN, Infinity)
  //   _clrBackground: Color used for background value voxels
  //   _clrSurface: Color used for surface value voxels
  //   _clrInside: Color used for the voxels on the inside
  //   _clrOutside: Color used for the voxels on the outside
  //   _clrDefect: Color used for defective voxels

SliceViz

  // The number of slices in this voxel field
  nSliceCount: int

  // PicoGK.SliceViz.SliceViz (constructor)
  public SliceViz(Viewer oViewer, Voxels vox, Voxels.ESliceAxis eAxis = Z)

  // Visualize the slice in the viewer using a normalized parameter from 0..1
  // PicoGK.SliceViz.Visualize (method)
  public void Visualize(float fNormalized)
  public void Visualize(int nSlice)

  // Dispose the object (IDispose)
  // PicoGK.SliceViz.Dispose (method)
  public void Dispose()

// This class allows you to split progress reporting into multiple subtasks
SplitProgress

  // Create a new SplitProgress object
  // PicoGK.SplitProgress.SplitProgress (constructor)
  public SplitProgress(IProgress xProgress, int nSubTasks)
  //   xProgress: Progress reporting interface to use
  //   nSubTasks: Number of subtasks, each with their independet 0..1 progress

  // Report progress from 0..1 - this function automatically scales the value to reflect the current subtask
  // PicoGK.SplitProgress.Progress (method)
  public void Progress(float f)

  // Allow you to use ++ to count up to the next subtask
  // PicoGK.SplitProgress.op_Increment (method)
  public static SplitProgress operator ++(SplitProgress pc)

SurfaceNormalFieldExtractor

  // PicoGK.SurfaceNormalFieldExtractor.oExtract (method)
  public static VectorField oExtract(Voxels vox, float fSurfaceThresholdVx = 0.5, Vector3? vecDirectionFilter = null, float fDirectionFilterTolerance = 0, Vector3? vecScaleBy = null)

  // PicoGK.SurfaceNormalFieldExtractor.SurfaceNormalFieldExtractor (constructor)
  protected SurfaceNormalFieldExtractor(Voxels voxSource, VectorField oDestination, float fSurfaceThresholdVx, Vector3 vecDirFilter, float fDirTolerance, Vector3 vecScaleBy)

  // PicoGK.SurfaceNormalFieldExtractor.Run (method)
  protected void Run()

  // PicoGK.SurfaceNormalFieldExtractor.InformActiveValue (method)
  public void InformActiveValue(in Vector3 vecPosition, float fValue)

Text

  oDefaultTypeface: SKTypeface

  // PicoGK.Text.imgRenderText (method)
  public static ImageRgba32 imgRenderText(string strText, int nFontHeight, int nPadding = 10, ColorFloat? _clrBackground = null, ColorFloat? _clrText = null, SKTypeface? _oTypeface = null)

TgaIo

  // PicoGK.TgaIo.SaveTga (method)
  public static void SaveTga(string strFilename, in Image img)
  public static void SaveTga(in BinaryWriter oWriter, in Image img)

  // PicoGK.TgaIo.GetFileInfo (method)
  public static void GetFileInfo(string strFilename, out Image.EType eType, out int nWidth, out int nHeight)
  public static void GetFileInfo(in BinaryReader oReader, out Image.EType eType, out int nWidth, out int nHeight)

  // PicoGK.TgaIo.LoadTga (method)
  public static void LoadTga(string strFilename, out Image img)
  public static void LoadTga(in BinaryReader oReader, out Image img)

Triangle

  A: int

  B: int

  C: int

  // PicoGK.Triangle.Triangle (constructor)
  public Triangle(int a, int b, int c)

Utils

  // Creates a temporary folder with an arbitrary filename in the system's default temp directory, which is guaranteed to be writable (we don't check this, but the system should guarantee it) Use the "using" syntax to automatically cleanup after the object runs out of scope
  TempFolder

    strFolder: string

    // PicoGK.Utils.TempFolder.TempFolder (constructor)
    public TempFolder()

    // PicoGK.Utils.TempFolder.Dispose (method)
    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

  // Helper function to create simple box mesh from a bounding box
  // PicoGK.Utils.mshCreateCube (method)
  public static Mesh mshCreateCube(BBox3 oBox)
  public static Mesh mshCreateCube(Vector3? vecScale = null, Vector3? vecOffsetMM = null)
  public static Mesh mshCreateCube(Library lib, BBox3 oBox)
  public static Mesh mshCreateCube(Library lib, Vector3? vecScale = null, Vector3? vecOffsetMM = null)

  // Strip quotes of a quoted path like "/usr/lib/" -> /usr/lib/
  // PicoGK.Utils.strStripQuotesFromPath (method)
  public static string strStripQuotesFromPath(string strPath)

  // Strips the extension from a filename
  // PicoGK.Utils.strStripExtension (method)
  public static string strStripExtension(string strPath)

  // Wait for a file's creation
  // PicoGK.Utils.bWaitForFileExistence (method)
  public static bool bWaitForFileExistence(string strFile, float fTimeOut = 1000000)

  // Returns the path to the home folder (cross platform compatible)
  // PicoGK.Utils.strHomeFolder (method)
  public static string strHomeFolder()

  // Returns the path to the documents folder (cross platform compatible)
  // PicoGK.Utils.strDocumentsFolder (method)
  public static string strDocumentsFolder()

  // Returns the path to the source folder of your project, under the assumption that the executable .NET DLL is in its usual place
  // PicoGK.Utils.strProjectRootFolder (method)
  public static string strProjectRootFolder()

  // Returns the path to the source folder of PicoGK, making the following Assumptions
  // PicoGK.Utils.strPicoGKSourceCodeFolder (method)
  public static string strPicoGKSourceCodeFolder()

  // Returns the path in which your current executable resides
  // PicoGK.Utils.strExecutableFolder (method)
  public static string strExecutableFolder()

  // Returns a file name in the form 20230930_134500 to be used in log files etc
  // PicoGK.Utils.strDateTimeFilename (method)
  public static string strDateTimeFilename(in string strPrefix, in string strPostfix)
  //   strPrefix: Prepended before the date/time stamp
  //   strPostfix: Appended after the date/time stamp

  // Shorted a string, IF it is too long
  // PicoGK.Utils.strShorten (method)
  public static string strShorten(string str, int iMaxCharacters)
  //   str: String to shorten (if too long)
  //   iMaxCharacters: Number of max characters in the string

// Helper class to save a voxel field contained in a VDB file to a CLI slice file
Vdb2Cli

  // Convert a voxel field to a CLI slice file
  // PicoGK.Vdb2Cli.Convert (method)
  public static void Convert(string strVdbFilePath, float fCliLayerHeight, string strCliFilePath = "", string strVoxelFieldName = "", IProgress? xProgress = null)
  //   strVdbFilePath: Path to the VDB file
  //   fCliLayerHeight: Layer height in millimeters
  //   strCliFilePath: Path to the CLI file
  //   strVoxelFieldName: Name of the voxel field, or the first voxel field in the file
  //   xProgress: Progress reporting interface

VdbHandle

  Value: long

  // PicoGK.VdbHandle.VdbHandle (constructor)
  public VdbHandle(long Value)

VdbMetaHandle

  Value: nint

  // PicoGK.VdbMetaHandle.VdbMetaHandle (constructor)
  public VdbMetaHandle(nint Value)

// A Field of 3D floating point vectors
VectorField

  // VectorField metadata
  m_oMetadata: FieldMetadata

  lib: Library

  // PicoGK.VectorField.oMetaData (method)
  public FieldMetadata oMetaData()

  // Create an empty VectorField object
  // PicoGK.VectorField.VectorField (constructor)
  public VectorField()
  public VectorField(Library libSet)
  public VectorField(in VectorField oSource)
  public VectorField(Voxels vox)
  public VectorField(Voxels vox, Vector3 vecValue, float fSdThreshold = 0.5)

  // Sets the value at the specified position in mm When you set a value, the position gets "activated" When no value is set, the position doesn't contain a value, and bGetValue returns false
  // PicoGK.VectorField.SetValue (method)
  public void SetValue(Vector3 vecPosition, Vector3 vecValue)
  //   vecPosition: Position in mm
  //   vecValue: Value

  // Get the value at the specified position If the specified position doesn't contain a value the function returns false
  // PicoGK.VectorField.bGetValue (method)
  public bool bGetValue(Vector3 vecPosition, out Vector3 vecValue)
  //   vecPosition: Position in mm
  //   vecValue: Value at position

  // Removes the value at the specified position
  // PicoGK.VectorField.RemoveValue (method)
  public void RemoveValue(Vector3 vecPosition)
  //   vecPosition: Position of the value in space

  // Visit each active value in the vector field and call the InformActiveValue methot of the ITraverseVectorField interface
  // PicoGK.VectorField.TraverseActive (method)
  public void TraverseActive(ITraverseVectorField xTraverse)
  //   xTraverse: The interface containing the callback

  // PicoGK.VectorField._hCreate (method)
  public static extern VectorFieldHandle _hCreate(LibHandle hLib)

  // PicoGK.VectorField._hCreateCopy (method)
  public static extern VectorFieldHandle _hCreateCopy(LibHandle hLib, VectorFieldHandle hSource)

  // PicoGK.VectorField._hCreateFromVoxels (method)
  public static extern VectorFieldHandle _hCreateFromVoxels(LibHandle hLib, VoxHandle hVoxels)

  // PicoGK.VectorField._hBuildFromVoxels (method)
  public static extern VectorFieldHandle _hBuildFromVoxels(LibHandle hLib, VoxHandle hVoxels, in Vector3 vecValue, float fSDThreshold)

  // PicoGK.VectorField.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

VectorFieldHandle

  Value: nint

  // PicoGK.VectorFieldHandle.VectorFieldHandle (constructor)
  public VectorFieldHandle(nint Value)

VectorFieldMerge

  // PicoGK.VectorFieldMerge.Merge (method)
  public static void Merge(VectorField oSource, VectorField oTarget)

  // PicoGK.VectorFieldMerge.VectorFieldMerge (constructor)
  protected VectorFieldMerge(VectorField oSource, VectorField oTarget)

  // PicoGK.VectorFieldMerge.Run (method)
  protected void Run()

  // PicoGK.VectorFieldMerge.InformActiveValue (method)
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

    // PicoGK.Viewer.GpuTex.Dispose (method)
    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

    // PicoGK.Viewer.GpuTex.GpuTex (constructor)
    public GpuTex(Viewer oSetViewer, ImageRgba32 img)

    // PicoGK.Viewer.GpuTex.ReplaceWith (method)
    public void ReplaceWith(ImageRgba32 img)

  ImageQuad

    // PicoGK.Viewer.ImageQuad.Dispose (method)
    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

    // PicoGK.Viewer.ImageQuad.ImageQuad (constructor)
    public ImageQuad(Viewer oSetViewer, ImageRgba32 img, ColorFloat clrDefault, float fAlpha, Matrix4x4 matDefault, bool bFlipX, bool bFlipY, bool bDoubleSided)

    // PicoGK.Viewer.ImageQuad.UpdateImage (method)
    public void UpdateImage(ImageRgba32 img)

    // PicoGK.Viewer.ImageQuad.UpdateMatrix (method)
    public void UpdateMatrix(in Matrix4x4 mat)

  SideBar

    // PicoGK.Viewer.SideBar.Dispose (method)
    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

    // PicoGK.Viewer.SideBar.SideBar (constructor)
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
    // PicoGK.Viewer.IViewerAction.Do (method)
    void Do(Viewer oViewer)
    //   oViewer: Viewer object to work with

  AnimGroupMatrixRotate

    // PicoGK.Viewer.AnimGroupMatrixRotate.AnimGroupMatrixRotate (constructor)
    public AnimGroupMatrixRotate(Viewer oViewer, int nGroup, Matrix4x4 matInit, Vector3 vecAxis, float fDegrees)

    // PicoGK.Viewer.AnimGroupMatrixRotate.Do (method)
    public void Do(float fFactor)

  // Animate view rotation
  AnimViewRotate

    // Animate movement to a viewer orientation
    // PicoGK.Viewer.AnimViewRotate.AnimViewRotate (constructor)
    public AnimViewRotate(Viewer oViewer, Quaternion qFrom, Quaternion qTo)
    //   oViewer: Viewer to use
    //   qFrom: Original orientation Quaternion Format
    //   qTo: New orientation in Quaternion format

    // PicoGK.Viewer.AnimViewRotate.Do (method)
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

    // PicoGK.Viewer.Camera.SetViewPort (method)
    public abstract void SetViewPort(Vector2 vecSize, float fSceneDepth)

    // PicoGK.Viewer.Camera.LookAt (method)
    public abstract void LookAt(Vector3 vec)

    // PicoGK.Viewer.Camera.ZoomToFit (method)
    public abstract void ZoomToFit(BBox3 oBBox)

    // PicoGK.Viewer.Camera.Scroll (method)
    public abstract void Scroll(Vector2 vecMouseRel)

    // PicoGK.Viewer.Camera.MouseDrag (method)
    public abstract void MouseDrag(Vector2 vecMouseRel, Viewer.Camera.EDragType eType)

  CamPerspectiveArcball

    matVP: Matrix4x4

    vecEye: Vector3

    qOrientation: Quaternion

    // PicoGK.Viewer.CamPerspectiveArcball.CamPerspectiveArcball (constructor)
    public CamPerspectiveArcball(float fFovVertical = 0.7853982)

    // PicoGK.Viewer.CamPerspectiveArcball.SetVerticalFov (method)
    public void SetVerticalFov(float fFov)

    // PicoGK.Viewer.CamPerspectiveArcball.SetViewPort (method)
    public override void SetViewPort(Vector2 vecSizePx, float fSceneRadius)

    // PicoGK.Viewer.CamPerspectiveArcball.LookAt (method)
    public override void LookAt(Vector3 vec)

    // PicoGK.Viewer.CamPerspectiveArcball.ZoomToFit (method)
    public override void ZoomToFit(BBox3 oBBox)

    // PicoGK.Viewer.CamPerspectiveArcball.MouseDrag (method)
    public override void MouseDrag(Vector2 vecMouseRel, Viewer.Camera.EDragType eType)

    // PicoGK.Viewer.CamPerspectiveArcball.Scroll (method)
    public override void Scroll(Vector2 vecMouseRel)

  IKeyHandler

    // PicoGK.Viewer.IKeyHandler.bHandleEvent (method)
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

    // PicoGK.Viewer.KeyAction.KeyAction (constructor)
    public KeyAction(Viewer.IViewerAction xAction, Viewer.EKeys eKey, bool bPressed = false, bool bShift = false, bool bCtrl = false, bool bAlt = false, bool bCmd = false)

    // PicoGK.Viewer.KeyAction.bKeyEquals (method)
    public bool bKeyEquals(Viewer.EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

    // PicoGK.Viewer.KeyAction.Do (method)
    public void Do(Viewer oViewer)

  KeyHandler

    // PicoGK.Viewer.KeyHandler.AddAction (method)
    public void AddAction(Viewer.KeyAction oAction)

    // PicoGK.Viewer.KeyHandler.bHandleEvent (method)
    public bool bHandleEvent(Viewer oViewer, Viewer.EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

  // PicoGK.Viewer._hCreate (method)
  public static extern nint _hCreate(string strWindowTitle, in Vector2 vecSize, Viewer.InfoCallback fnInfoCallback, Viewer.UpdateCallback fnUpdateCallback, Viewer.KeyPressedCallback fnKeyPressedCallback, Viewer.MouseMovedCallback fnMouseMoveCallback, Viewer.MouseButtonCallback fnMouseButtonCallback, Viewer.ScrollWheelCallback fnScrollWheelCallback, Viewer.WindowSizelCallback fnWindowSizeCallback)

  // PicoGK.Viewer.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

  // Initialize a hosted Viewer that delegates display operations without creating a native window
  // PicoGK.Viewer.Viewer (constructor)
  public Viewer(IViewerBackend xBackend, ILog xLog)
  public Viewer(string strTitle, Vector2 vecSize, ILog xLog)

  // Capture an application-defined mechanism on a hosted viewer
  // PicoGK.Viewer.SetMechanism (method)
  public void SetMechanism(object source)

  // Run this function in your main thread while it returns true
  // PicoGK.Viewer.bPoll (method)
  public bool bPoll()

  // Request a refresh of the viewer
  // PicoGK.Viewer.RequestUpdate (method)
  public void RequestUpdate()

  // Load the IBL light setup from the specified ZIP file
  // PicoGK.Viewer.LoadLightSetup (method)
  public void LoadLightSetup(string strFilePath)
  public void LoadLightSetup(Stream oStream)

  // Add the object to the viewer, using the specified viewer group
  // PicoGK.Viewer.Add (method)
  public void Add(in Voxels vox, string name, int nGroupID = 0)
  public void Add(in Voxels vox, int nGroupID = 0)
  public void Add(Mesh msh, string name, int nGroupID = 0)
  public void Add(Mesh msh, int nGroupID = 0)
  public void Add(PolyLine oPoly, string name, int nGroupID = 0)
  public void Add(PolyLine oPoly, int nGroupID = 0)

  // Removes the object from the viewer
  // PicoGK.Viewer.Remove (method)
  public void Remove(Voxels vox)
  public void Remove(Mesh msh)
  public void Remove(PolyLine oPoly)

  // Set the transformation matrix for the specified object
  // PicoGK.Viewer.SetObjectMatrix (method)
  public void SetObjectMatrix(Voxels vox, in Matrix4x4 mat)
  public void SetObjectMatrix(Mesh msh, in Matrix4x4 mat)
  public void SetObjectMatrix(PolyLine poly, in Matrix4x4 mat)

  // Remove all objects from the viewer
  // PicoGK.Viewer.RemoveAllObjects (method)
  public void RemoveAllObjects()

  // Request screenshot (TGA), which will be saved to the the specified location
  // PicoGK.Viewer.RequestScreenShot (method)
  public void RequestScreenShot(string strScreenShotPath)

  // Enable/disable experimental rendering features
  // PicoGK.Viewer.EnableExperimental (method)
  public void EnableExperimental(bool bEnable)

  // Enable or disable the display of a viewer group
  // PicoGK.Viewer.SetGroupVisible (method)
  public void SetGroupVisible(int nGroupID, bool bVisible)

  // Assign a typed physical material to every object in the hosted group
  // PicoGK.Viewer.SetGroupMaterial (method)
  public void SetGroupMaterial(int groupId, Material material)
  public void SetGroupMaterial(int nGroupID, ColorFloat clr, float fMetallic, float fRoughness)
  //   groupId: Existing viewer group assignment
  //   material: Appearance and encoded textures, snapshotted synchronously

  // Set the group's transformation matrix
  // PicoGK.Viewer.SetGroupMatrix (method)
  public void SetGroupMatrix(int nGroupID, Matrix4x4 mat)

  // Enables overhang severity visualization for the specified viewer group
  // PicoGK.Viewer.EnableOverhangWarning (method)
  public void EnableOverhangWarning(int nGroupID, Overhang uWarning, Overhang uError)
  public void EnableOverhangWarning(int nGroupID, int nWarningAngleDeg, int nErrorAngleDeg)
  //   nGroupID: Viewer group ID
  //   uWarning: Overhang at which the warning color sets in
  //   uError: Overhang at which the error color sets in

  // Disables the overhang angle warning of the specified group
  // PicoGK.Viewer.DisableOverhangWarning (method)
  public void DisableOverhangWarning(int nGroupID)

  // Returns the bounding box of all elements inside the view
  // PicoGK.Viewer.oBBox (method)
  public BBox3 oBBox()

  // Sets the background color of the viewer
  // PicoGK.Viewer.SetBackgroundColor (method)
  public void SetBackgroundColor(ColorFloat clr)

  // Zoom to fit the contents of the viewer
  // PicoGK.Viewer.ZoomToFit (method)
  public void ZoomToFit()

  // Set Vertical Field of View in radians (i.e
  // PicoGK.Viewer.SetFov (method)
  public void SetFov(float fAngle)

  // Allows you to query if all viewer actions are complete
  // PicoGK.Viewer.bIsIdle (method)
  public bool bIsIdle()

  // PicoGK.Viewer.AddAnimation (method)
  public void AddAnimation(Animation oAnim)

  // PicoGK.Viewer.RemoveAllAnimations (method)
  public void RemoveAllAnimations()

  // PicoGK.Viewer.AddKeyHandler (method)
  public void AddKeyHandler(Viewer.IKeyHandler xKeyHandler)

  // PicoGK.Viewer.StartTimeLapse (method)
  public void StartTimeLapse(float fIntervalInMilliseconds, string strPath, string strFileName = "frame_", uint nStartFrame = 0, bool bPaused = false)

  // PicoGK.Viewer.PauseTimeLapse (method)
  public void PauseTimeLapse()

  // PicoGK.Viewer.ResumeTimeLapse (method)
  public void ResumeTimeLapse()

  // PicoGK.Viewer.StopTimeLapse (method)
  public void StopTimeLapse()

  // Marks the supplied coordinate with a cross-shaped polyline
  // PicoGK.Viewer.AddCross (method)
  public void AddCross(Vector3 vecPt, ColorFloat clr, float fSizeMM = 1, int nViewerGroup = 0)
  public void AddCross(Vector3 vecPt)
  //   vecPt: Coordinate of the point to mark
  //   clr: Color of the point
  //   fSizeMM: Size of the cross in mm
  //   nViewerGroup: Viewer group to use

  // Adds an line ending in an arrow to the viewer
  // PicoGK.Viewer.AddArrow (method)
  public void AddArrow(Vector3 vecPtFrom, Vector3 vecPtTo, ColorFloat clr, float fSizeMM = 1, int nViewerGroup = 0)
  public void AddArrow(Vector3 vecPtFrom, Vector3 vecPtTo)
  //   vecPtFrom: Start point of the line
  //   vecPtTo: End point of the line
  //   clr: Color of the line
  //   fSizeMM: Size of the arrow in mm
  //   nViewerGroup: Viewer group to use

  // PicoGK.Viewer.oCreateSideBarLeft (method)
  public Viewer.SideBar oCreateSideBarLeft(int nMin, int nMax, int nDef, ColorFloat clrNormal, ColorFloat clrHovered)

  // PicoGK.Viewer.oCreateSideBarRight (method)
  public Viewer.SideBar oCreateSideBarRight(int nMin, int nMax, int nDef, ColorFloat clrNormal, ColorFloat clrHovered)

// Visualizes the result of a voxel filed cut along an axis slice
VoxCutViz

  // Number of slices in the voxel field
  nSliceCount: int

  // Initializes a new VoxCutViz object with the specified Viewer and VoxelField
  // PicoGK.VoxCutViz.VoxCutViz (constructor)
  public VoxCutViz(Viewer oViewer, Voxels vox, int nViewerGroup = 0, Voxels.ESliceAxis eAxis = Z)
  //   oViewer: Viewer to use to visualize
  //   vox: Voxel field to slice and cut
  //   nViewerGroup: Viewer group to use for the sliced object
  //   eAxis: Axis along which to slice

  // Cut the voxel field along the two normalized values (0 is the first slice 1 is the last)
  // PicoGK.VoxCutViz.Cut (method)
  public void Cut(float fNormalizedPos1 = 0, float fNormalizedPos2 = 0)
  public void Cut(int nSlice1, int nSlice2)
  //   fNormalizedPos1: First slice position (0..1)
  //   fNormalizedPos2: Second slice position (0..1)

  // Call to stop the visualization (or let the object go out of scope, if you used using)
  // PicoGK.VoxCutViz.Dispose (method)
  public void Dispose()

VoxHandle

  Value: long

  // PicoGK.VoxHandle.VoxHandle (constructor)
  public VoxHandle(long Value)
