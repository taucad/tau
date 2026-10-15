import { BRepAlgoAPI_Cut, BRepPrimAPI_MakeBox, Message_ProgressRange, gp_Pnt } from 'libcascade';

export const defaultParams = { width: 20, depth: 10, height: 5, hole: 4 };

export default function main(p = defaultParams) {
  const block = new BRepPrimAPI_MakeBox(new gp_Pnt(-p.width / 2, -p.depth / 2, 0), p.width, p.depth, p.height);
  const hole = new BRepPrimAPI_MakeBox(
    new gp_Pnt(3 - p.hole / 2, -p.hole / 2, -p.height),
    p.hole,
    p.hole,
    p.height * 3,
  );
  const cut = new BRepAlgoAPI_Cut(block.Shape(), hole.Shape(), new Message_ProgressRange());
  return cut.Shape();
}
