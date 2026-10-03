# PicoGK — Native viewer — PicoGK.Viewer

13 top-level symbols. Signatures are verbatim csharp.

// Category: Native viewer
// Abstract camera class to interact with the view
// PicoGK.Viewer.Camera (class)
public abstract class Camera

  // Drag, Spin, Pan the camera
  // PicoGK.Viewer.Camera.EDragType (enum)
  public enum EDragType

    // Rotate the camera (up/down)
    // PicoGK.Viewer.Camera.EDragType.Rotate (enumMember)
    Rotate

    // Spin the camera around the view vector
    // PicoGK.Viewer.Camera.EDragType.Spin (enumMember)
    Spin

    // Move the camera up/down
    // PicoGK.Viewer.Camera.EDragType.Pan (enumMember)
    Pan

  // PicoGK.Viewer.Camera.qOrientation (property)
  public abstract Quaternion qOrientation { get; set; }

  // PicoGK.Viewer.Camera.matVP (property)
  public abstract Matrix4x4 matVP { get; }

  // PicoGK.Viewer.Camera.vecEye (property)
  public abstract Vector3 vecEye { get; }

  // PicoGK.Viewer.Camera.SetViewPort (method)
  public abstract void SetViewPort(Vector2 vecSize, float fSceneDepth)

  // PicoGK.Viewer.Camera.LookAt (method)
  public abstract void LookAt(Vector3 vec)

  // PicoGK.Viewer.Camera.ZoomToFit (method)
  public abstract void ZoomToFit(BBox3 oBBox)

  // PicoGK.Viewer.Camera.Scroll (method)
  public abstract void Scroll(Vector2 vecMouseRel)

  // PicoGK.Viewer.Camera.MouseDrag (method)
  public abstract void MouseDrag(Vector2 vecMouseRel, EDragType eType)

  // Category: Subclass-only
  // PicoGK.Viewer.Camera.Camera (constructor)
  protected Camera()

// Category: Native viewer
// PicoGK.Viewer.CamPerspectiveArcball (class)
public class CamPerspectiveArcball : Camera

  // PicoGK.Viewer.CamPerspectiveArcball.matVP (property)
  public override Matrix4x4 matVP { get; }

  // PicoGK.Viewer.CamPerspectiveArcball.vecEye (property)
  public override Vector3 vecEye { get; }

  // PicoGK.Viewer.CamPerspectiveArcball.qOrientation (property)
  public override Quaternion qOrientation { get; set; }

  // PicoGK.Viewer.CamPerspectiveArcball.CamPerspectiveArcball (constructor)
  public CamPerspectiveArcball(float fFovVertical = float.Pi / 4)

  // PicoGK.Viewer.CamPerspectiveArcball.SetVerticalFov (method)
  public void SetVerticalFov(float fFov)

  // PicoGK.Viewer.CamPerspectiveArcball.SetViewPort (method)
  public override void SetViewPort(Vector2 vecSizePx, float fSceneRadius)

  // PicoGK.Viewer.CamPerspectiveArcball.LookAt (method)
  public override void LookAt(Vector3 vec)

  // PicoGK.Viewer.CamPerspectiveArcball.ZoomToFit (method)
  public override void ZoomToFit(BBox3 oBBox)

  // PicoGK.Viewer.CamPerspectiveArcball.MouseDrag (method)
  public override void MouseDrag(Vector2 vecMouseRel, EDragType eType)

  // PicoGK.Viewer.CamPerspectiveArcball.Scroll (method)
  public override void Scroll(Vector2 vecMouseRel)

// Category: Native viewer
// PicoGK.Viewer.IKeyHandler (interface)
public interface IKeyHandler

  // PicoGK.Viewer.IKeyHandler.bHandleEvent (method)
  bool bHandleEvent(Viewer oViewer, EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

// Category: Native viewer
// PicoGK.Viewer.EKeys (enum)
public enum EKeys

  // PicoGK.Viewer.EKeys.Key_Space (enumMember)
  Key_Space = 32

  // PicoGK.Viewer.EKeys.Key_0 (enumMember)
  Key_0 = 48

  // PicoGK.Viewer.EKeys.Key_1 (enumMember)
  Key_1

  // PicoGK.Viewer.EKeys.Key_2 (enumMember)
  Key_2

  // PicoGK.Viewer.EKeys.Key_3 (enumMember)
  Key_3

  // PicoGK.Viewer.EKeys.Key_4 (enumMember)
  Key_4

  // PicoGK.Viewer.EKeys.Key_5 (enumMember)
  Key_5

  // PicoGK.Viewer.EKeys.Key_6 (enumMember)
  Key_6

  // PicoGK.Viewer.EKeys.Key_7 (enumMember)
  Key_7

  // PicoGK.Viewer.EKeys.Key_8 (enumMember)
  Key_8

  // PicoGK.Viewer.EKeys.Key_9 (enumMember)
  Key_9

  // PicoGK.Viewer.EKeys.Key_A (enumMember)
  Key_A = 65

  // PicoGK.Viewer.EKeys.Key_B (enumMember)
  Key_B

  // PicoGK.Viewer.EKeys.Key_C (enumMember)
  Key_C

  // PicoGK.Viewer.EKeys.Key_D (enumMember)
  Key_D

  // PicoGK.Viewer.EKeys.Key_E (enumMember)
  Key_E

  // PicoGK.Viewer.EKeys.Key_F (enumMember)
  Key_F

  // PicoGK.Viewer.EKeys.Key_G (enumMember)
  Key_G

  // PicoGK.Viewer.EKeys.Key_H (enumMember)
  Key_H

  // PicoGK.Viewer.EKeys.Key_I (enumMember)
  Key_I

  // PicoGK.Viewer.EKeys.Key_J (enumMember)
  Key_J

  // PicoGK.Viewer.EKeys.Key_K (enumMember)
  Key_K

  // PicoGK.Viewer.EKeys.Key_L (enumMember)
  Key_L

  // PicoGK.Viewer.EKeys.Key_M (enumMember)
  Key_M

  // PicoGK.Viewer.EKeys.Key_N (enumMember)
  Key_N

  // PicoGK.Viewer.EKeys.Key_O (enumMember)
  Key_O

  // PicoGK.Viewer.EKeys.Key_P (enumMember)
  Key_P

  // PicoGK.Viewer.EKeys.Key_Q (enumMember)
  Key_Q

  // PicoGK.Viewer.EKeys.Key_R (enumMember)
  Key_R

  // PicoGK.Viewer.EKeys.Key_S (enumMember)
  Key_S

  // PicoGK.Viewer.EKeys.Key_T (enumMember)
  Key_T

  // PicoGK.Viewer.EKeys.Key_U (enumMember)
  Key_U

  // PicoGK.Viewer.EKeys.Key_V (enumMember)
  Key_V

  // PicoGK.Viewer.EKeys.Key_W (enumMember)
  Key_W

  // PicoGK.Viewer.EKeys.Key_X (enumMember)
  Key_X

  // PicoGK.Viewer.EKeys.Key_Y (enumMember)
  Key_Y

  // PicoGK.Viewer.EKeys.Key_Z (enumMember)
  Key_Z = 90

  // PicoGK.Viewer.EKeys.Key_ESC (enumMember)
  Key_ESC = 256

  // PicoGK.Viewer.EKeys.Key_Enter (enumMember)
  Key_Enter

  // PicoGK.Viewer.EKeys.Key_Tab (enumMember)
  Key_Tab

  // PicoGK.Viewer.EKeys.Key_Backspace (enumMember)
  Key_Backspace

  // PicoGK.Viewer.EKeys.Key_Insert (enumMember)
  Key_Insert

  // PicoGK.Viewer.EKeys.Key_Delete (enumMember)
  Key_Delete

  // PicoGK.Viewer.EKeys.Key_Right (enumMember)
  Key_Right

  // PicoGK.Viewer.EKeys.Key_Left (enumMember)
  Key_Left

  // PicoGK.Viewer.EKeys.Key_Down (enumMember)
  Key_Down

  // PicoGK.Viewer.EKeys.Key_Up (enumMember)
  Key_Up

  // PicoGK.Viewer.EKeys.Key_PgUp (enumMember)
  Key_PgUp

  // PicoGK.Viewer.EKeys.Key_PgDn (enumMember)
  Key_PgDn

  // PicoGK.Viewer.EKeys.Key_Home (enumMember)
  Key_Home

  // PicoGK.Viewer.EKeys.Key_End (enumMember)
  Key_End = 269

  // PicoGK.Viewer.EKeys.Key_F1 (enumMember)
  Key_F1 = 290

  // PicoGK.Viewer.EKeys.Key_F2 (enumMember)
  Key_F2

  // PicoGK.Viewer.EKeys.Key_F3 (enumMember)
  Key_F3

  // PicoGK.Viewer.EKeys.Key_F4 (enumMember)
  Key_F4

  // PicoGK.Viewer.EKeys.Key_F5 (enumMember)
  Key_F5

  // PicoGK.Viewer.EKeys.Key_F6 (enumMember)
  Key_F6

  // PicoGK.Viewer.EKeys.Key_F7 (enumMember)
  Key_F7

  // PicoGK.Viewer.EKeys.Key_F8 (enumMember)
  Key_F8

  // PicoGK.Viewer.EKeys.Key_F9 (enumMember)
  Key_F9

  // PicoGK.Viewer.EKeys.Key_F10 (enumMember)
  Key_F10

  // PicoGK.Viewer.EKeys.Key_F11 (enumMember)
  Key_F11

  // PicoGK.Viewer.EKeys.Key_F12 (enumMember)
  Key_F12

// Category: Native viewer
// PicoGK.Viewer.KeyAction (class)
public class KeyAction

  // PicoGK.Viewer.KeyAction.KeyAction (constructor)
  public KeyAction(IViewerAction xAction, EKeys eKey, bool bPressed = false, // Handle on release by default
   bool bShift = false, bool bCtrl = false, bool bAlt = false, bool bCmd = false)

  // PicoGK.Viewer.KeyAction.bKeyEquals (method)
  public bool bKeyEquals(EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

  // PicoGK.Viewer.KeyAction.Do (method)
  public void Do(Viewer oViewer)

// Category: Native viewer
// PicoGK.Viewer.KeyHandler (class)
public class KeyHandler : IKeyHandler

  // PicoGK.Viewer.KeyHandler.AddAction (method)
  public void AddAction(KeyAction oAction)

  // PicoGK.Viewer.KeyHandler.bHandleEvent (method)
  public bool bHandleEvent(Viewer oViewer, EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

  // PicoGK.Viewer.KeyHandler.KeyHandler (constructor)
  public KeyHandler()

// Category: Native viewer
// PicoGK.Viewer.AddKeyHandler (method)
public void AddKeyHandler(IKeyHandler xKeyHandler)

// Category: Native viewer
// PicoGK.Viewer.StartTimeLapse (method)
public void StartTimeLapse(float fIntervalInMilliseconds, string strPath, string strFileName = "frame_", uint nStartFrame = 0, bool bPaused = false)

// Category: Native viewer
// PicoGK.Viewer.PauseTimeLapse (method)
public void PauseTimeLapse()

// Category: Native viewer
// PicoGK.Viewer.ResumeTimeLapse (method)
public void ResumeTimeLapse()

// Category: Native viewer
// PicoGK.Viewer.StopTimeLapse (method)
public void StopTimeLapse()

// Category: Native viewer
// PicoGK.Viewer.oCreateSideBarLeft (method)
public SideBar oCreateSideBarLeft(int nMin, int nMax, int nDef, ColorFloat clrNormal, ColorFloat clrHovered)

// Category: Native viewer
// PicoGK.Viewer.oCreateSideBarRight (method)
public SideBar oCreateSideBarRight(int nMin, int nMax, int nDef, ColorFloat clrNormal, ColorFloat clrHovered)
