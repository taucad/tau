import type { TopoDS_Shape } from 'opencascade.js';
import { makeWidget } from './lib/widget.js';

export default function main(): TopoDS_Shape {
  return makeWidget();
}
