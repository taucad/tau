# PicoGK — Advanced embedding/native — PicoGK.Viewer

3 top-level symbols. Signatures are verbatim csharp.

// Category: Advanced embedding/native
// PicoGK.Viewer._hCreate (method)
public static extern IntPtr _hCreate(string strWindowTitle, in Vector2 vecSize, InfoCallback fnInfoCallback, UpdateCallback fnUpdateCallback, KeyPressedCallback fnKeyPressedCallback, MouseMovedCallback fnMouseMoveCallback, MouseButtonCallback fnMouseButtonCallback, ScrollWheelCallback fnScrollWheelCallback, WindowSizelCallback fnWindowSizeCallback)

// Category: Advanced embedding/native
// Initialize a hosted Viewer that delegates display operations without creating a native window
// PicoGK.Viewer.Viewer (constructor)
public Viewer(IViewerBackend xBackend, ILog xLog)
public Viewer(string strTitle, Vector2 vecSize, ILog xLog)

// Category: Advanced embedding/native
// Run this function in your main thread while it returns true
// PicoGK.Viewer.bPoll (method)
public bool bPoll()
