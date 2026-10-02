# build123d — StlAPI

1 top-level symbols. Signatures are verbatim python.

// Category: StlAPI
// This class creates and writes STL files from Open CASCADE shapes
StlAPI_Writer

  // __init__(self
  // OCP.OCP.StlAPI.StlAPI_Writer.__init__ (constructor)
  __init__(self: OCP.OCP.StlAPI.StlAPI_Writer) -> None

  // Write(self
  // Remarks: Converts a given shape to STL format and writes it to file with a given filename.
  // OCP.OCP.StlAPI.StlAPI_Writer.Write (method)
  Write(self: OCP.OCP.StlAPI.StlAPI_Writer, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theFileName: str, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10ea429b0>) -> bool

  // Returns the address to the flag defining the mode for writing the file
  ASCIIMode
