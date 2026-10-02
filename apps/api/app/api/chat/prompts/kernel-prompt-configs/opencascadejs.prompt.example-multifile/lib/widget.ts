import { BRepPrimAPI_MakeBox, gp_Pnt, type TopoDS_Shape } from 'opencascade.js';

export const makeWidget = (): TopoDS_Shape => {
  const builder = new BRepPrimAPI_MakeBox(new gp_Pnt(-5, -5, -5), 10, 10, 10);
  try {
    return builder.Shape();
  } finally {
    builder.delete();
  }
};
