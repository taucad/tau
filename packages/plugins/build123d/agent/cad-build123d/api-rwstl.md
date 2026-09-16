# build123d — RWStl

1 top-level symbols. Signatures are verbatim python.

// This class provides methods to read and write triangulation from / to the STL files
RWStl

  // __init__(self
  __init__(self: OCP.OCP.RWStl.RWStl) -> None

  // WriteBinary_s(theMesh
  WriteBinary_s(theMesh: OCP.OCP.Poly.Poly_Triangulation, thePath: OCP.OCP.OSD.OSD_Path, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10ea5ec70>) -> bool

  // WriteAscii_s(theMesh
  WriteAscii_s(theMesh: OCP.OCP.Poly.Poly_Triangulation, thePath: OCP.OCP.OSD.OSD_Path, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10e6a9270>) -> bool

  // ReadFile_s(*args, **kwargs)
  ReadFile_s(*args, **kwargs)
  ReadFile_s(theFile: OCP.OCP.OSD.OSD_Path, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10eb83bf0>) -> OCP.OCP.Poly.Poly_Triangulation
  ReadFile_s(theFile: str, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10e9b1170>) -> OCP.OCP.Poly.Poly_Triangulation
  ReadFile_s(theFile: str, theMergeAngle: float, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10eab7570>) -> OCP.OCP.Poly.Poly_Triangulation
  ReadFile_s(theFile: str, theMergeAngle: float, theTriangList: NCollection_Sequence<opencascade::handle<Poly_Triangulation>>, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10e8e04b0>) -> None

  // ReadBinary_s(thePath
  ReadBinary_s(thePath: OCP.OCP.OSD.OSD_Path, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10ebf0f30>) -> OCP.OCP.Poly.Poly_Triangulation

  // ReadAscii_s(thePath
  ReadAscii_s(thePath: OCP.OCP.OSD.OSD_Path, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10e668d70>) -> OCP.OCP.Poly.Poly_Triangulation
