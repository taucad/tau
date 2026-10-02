# PicoGK — Native viewer — PicoGK.Viewer

13 top-level symbols. Signatures are verbatim csharp.

// Category: Native viewer
// Abstract camera class to interact with the view
public abstract class Camera

  // Drag, Spin, Pan the camera
  public enum EDragType

    // Rotate the camera (up/down)
    Rotate

    // Spin the camera around the view vector
    Spin

    // Move the camera up/down
    Pan

  public abstract Quaternion qOrientation { get; set; }

  public abstract Matrix4x4 matVP { get; }

  public abstract Vector3 vecEye { get; }

  public abstract void SetViewPort(Vector2 vecSize, float fSceneDepth)

  public abstract void LookAt(Vector3 vec)

  public abstract void ZoomToFit(BBox3 oBBox)

  public abstract void Scroll(Vector2 vecMouseRel)

  public abstract void MouseDrag(Vector2 vecMouseRel, EDragType eType)

  // Category: Subclass-only
  protected Camera()

// Category: Native viewer
public class CamPerspectiveArcball : Camera

  public override Matrix4x4 matVP { get; }

  public override Vector3 vecEye { get; }

  public override Quaternion qOrientation { get; set; }

  public CamPerspectiveArcball(float fFovVertical = float.Pi / 4)

  public void SetVerticalFov(float fFov)

  public override void SetViewPort(Vector2 vecSizePx, float fSceneRadius)

  public override void LookAt(Vector3 vec)

  public override void ZoomToFit(BBox3 oBBox)

  public override void MouseDrag(Vector2 vecMouseRel, EDragType eType)

  public override void Scroll(Vector2 vecMouseRel)

// Category: Native viewer
public interface IKeyHandler

  bool bHandleEvent(Viewer oViewer, EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

// Category: Native viewer
public enum EKeys

  Key_Space = 32

  Key_0 = 48

  Key_1

  Key_2

  Key_3

  Key_4

  Key_5

  Key_6

  Key_7

  Key_8

  Key_9

  Key_A = 65

  Key_B

  Key_C

  Key_D

  Key_E

  Key_F

  Key_G

  Key_H

  Key_I

  Key_J

  Key_K

  Key_L

  Key_M

  Key_N

  Key_O

  Key_P

  Key_Q

  Key_R

  Key_S

  Key_T

  Key_U

  Key_V

  Key_W

  Key_X

  Key_Y

  Key_Z = 90

  Key_ESC = 256

  Key_Enter

  Key_Tab

  Key_Backspace

  Key_Insert

  Key_Delete

  Key_Right

  Key_Left

  Key_Down

  Key_Up

  Key_PgUp

  Key_PgDn

  Key_Home

  Key_End = 269

  Key_F1 = 290

  Key_F2

  Key_F3

  Key_F4

  Key_F5

  Key_F6

  Key_F7

  Key_F8

  Key_F9

  Key_F10

  Key_F11

  Key_F12

// Category: Native viewer
public class KeyAction

  public KeyAction(IViewerAction xAction, EKeys eKey, bool bPressed = false, // Handle on release by default
   bool bShift = false, bool bCtrl = false, bool bAlt = false, bool bCmd = false)

  public bool bKeyEquals(EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

  public void Do(Viewer oViewer)

// Category: Native viewer
public class KeyHandler : IKeyHandler

  public void AddAction(KeyAction oAction)

  public bool bHandleEvent(Viewer oViewer, EKeys eKey, bool bPressed, bool bShift, bool bCtrl, bool bAlt, bool bCmd)

  public KeyHandler()

// Category: Native viewer
public void AddKeyHandler(IKeyHandler xKeyHandler)

// Category: Native viewer
public void StartTimeLapse(float fIntervalInMilliseconds, string strPath, string strFileName = "frame_", uint nStartFrame = 0, bool bPaused = false)

// Category: Native viewer
public void PauseTimeLapse()

// Category: Native viewer
public void ResumeTimeLapse()

// Category: Native viewer
public void StopTimeLapse()

// Category: Native viewer
public SideBar oCreateSideBarLeft(int nMin, int nMax, int nDef, ColorFloat clrNormal, ColorFloat clrHovered)

// Category: Native viewer
public SideBar oCreateSideBarRight(int nMin, int nMax, int nDef, ColorFloat clrNormal, ColorFloat clrHovered)
