#!/usr/bin/env node
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- JSON documents cross an untyped process boundary. */
// A model exporter that knows nothing of Tau: it reads a `.box` file ({ "size": <mm> }), lets `--parameters-json`
// override its fields, writes a STEP cube of that size centred on the origin and answers in GeoSpec subprocess
// protocol 1.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    format: { type: 'string' },
    project: { type: 'string' },
    out: { type: 'string' },
    'parameters-json': { type: 'string' },
  },
});

const source = await readFile(join(values.project, values.file));
/** @type {{ size?: unknown }} */
const { size } = { ...JSON.parse(source.toString('utf8')), ...JSON.parse(values['parameters-json'] ?? '{}') };
if (!(typeof size === 'number' && size > 0)) {
  process.stdout.write(
    JSON.stringify({ protocol: 1, error: { code: 'BOX_SIZE_INVALID', message: 'size must be a positive number.' } }),
  );
  process.exit(2);
}

const h = size / 2;
const corner = (x, y, z) => `(${x * h},${y * h},${z * h})`;
const step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('box'),'2;1');
FILE_NAME('box.step','2026-10-20T00:00:00',(''),(''),'box-exporter','box-exporter','');
FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 3 1 4 }'));
ENDSEC;
DATA;
#1=APPLICATION_CONTEXT('managed model based 3d engineering');
#2=APPLICATION_PROTOCOL_DEFINITION('international standard','ap242_managed_model_based_3d_engineering',2020,#1);
#3=PRODUCT_CONTEXT('',#1,'mechanical');
#6=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');
#400=(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#404)) GLOBAL_UNIT_ASSIGNED_CONTEXT((#401,#402,#403)) REPRESENTATION_CONTEXT('','3D'));
#401=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));
#402=(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.));
#403=(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT());
#404=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),#401,'distance_accuracy_value','');
#4=PRODUCT('box','box','',(#3));
#5=PRODUCT_DEFINITION_FORMATION('','',#4);
#7=PRODUCT_DEFINITION('','',#5,#6);
#8=PRODUCT_DEFINITION_SHAPE('','',#7);
#9=SHAPE_DEFINITION_REPRESENTATION(#8,#10);
#10=ADVANCED_BREP_SHAPE_REPRESENTATION('box',(#111,#513),#400);
#507=CARTESIAN_POINT('',(0.,0.,0.));
#508=DIRECTION('',(0.,0.,1.));
#509=DIRECTION('',(1.,0.,0.));
#513=AXIS2_PLACEMENT_3D('',#507,#508,#509);
#111=MANIFOLD_SOLID_BREP('box',#112);
#112=CLOSED_SHELL('',(#1100,#1110,#1120,#1130,#1140,#1150));
#120=CARTESIAN_POINT('',${corner(-1, -1, -1)});
#121=CARTESIAN_POINT('',${corner(1, -1, -1)});
#122=CARTESIAN_POINT('',${corner(1, 1, -1)});
#123=CARTESIAN_POINT('',${corner(-1, 1, -1)});
#124=CARTESIAN_POINT('',${corner(-1, -1, 1)});
#125=CARTESIAN_POINT('',${corner(1, -1, 1)});
#126=CARTESIAN_POINT('',${corner(1, 1, 1)});
#127=CARTESIAN_POINT('',${corner(-1, 1, 1)});
#130=VERTEX_POINT('',#120);
#131=VERTEX_POINT('',#121);
#132=VERTEX_POINT('',#122);
#133=VERTEX_POINT('',#123);
#134=VERTEX_POINT('',#124);
#135=VERTEX_POINT('',#125);
#136=VERTEX_POINT('',#126);
#137=VERTEX_POINT('',#127);
#140=DIRECTION('',(1.,0.,0.));
#141=DIRECTION('',(0.,1.,0.));
#142=DIRECTION('',(0.,0.,1.));
#150=VECTOR('',#140,${size});
#151=VECTOR('',#141,${size});
#152=VECTOR('',#142,${size});
#160=LINE('',#120,#150);
#161=LINE('',#121,#151);
#162=LINE('',#123,#150);
#163=LINE('',#120,#151);
#164=LINE('',#124,#150);
#165=LINE('',#125,#151);
#166=LINE('',#127,#150);
#167=LINE('',#124,#151);
#168=LINE('',#120,#152);
#169=LINE('',#121,#152);
#170=LINE('',#122,#152);
#171=LINE('',#123,#152);
#180=EDGE_CURVE('',#130,#131,#160,.T.);
#181=EDGE_CURVE('',#131,#132,#161,.T.);
#182=EDGE_CURVE('',#133,#132,#162,.T.);
#183=EDGE_CURVE('',#130,#133,#163,.T.);
#184=EDGE_CURVE('',#134,#135,#164,.T.);
#185=EDGE_CURVE('',#135,#136,#165,.T.);
#186=EDGE_CURVE('',#137,#136,#166,.T.);
#187=EDGE_CURVE('',#134,#137,#167,.T.);
#188=EDGE_CURVE('',#130,#134,#168,.T.);
#189=EDGE_CURVE('',#131,#135,#169,.T.);
#190=EDGE_CURVE('',#132,#136,#170,.T.);
#191=EDGE_CURVE('',#133,#137,#171,.T.);
#1100=ADVANCED_FACE('',(#1101),#1105,.F.);
#1101=FACE_OUTER_BOUND('',#1102,.T.);
#1102=EDGE_LOOP('',(#11030,#11031,#11032,#11033));
#11030=ORIENTED_EDGE('',*,*,#180,.T.);
#11031=ORIENTED_EDGE('',*,*,#181,.T.);
#11032=ORIENTED_EDGE('',*,*,#182,.F.);
#11033=ORIENTED_EDGE('',*,*,#183,.F.);
#1105=PLANE('',#1106);
#1106=AXIS2_PLACEMENT_3D('',#120,#142,#140);
#1110=ADVANCED_FACE('',(#1111),#1115,.T.);
#1111=FACE_OUTER_BOUND('',#1112,.T.);
#1112=EDGE_LOOP('',(#11130,#11131,#11132,#11133));
#11130=ORIENTED_EDGE('',*,*,#184,.T.);
#11131=ORIENTED_EDGE('',*,*,#185,.T.);
#11132=ORIENTED_EDGE('',*,*,#186,.F.);
#11133=ORIENTED_EDGE('',*,*,#187,.F.);
#1115=PLANE('',#1116);
#1116=AXIS2_PLACEMENT_3D('',#124,#142,#140);
#1120=ADVANCED_FACE('',(#1121),#1125,.F.);
#1121=FACE_OUTER_BOUND('',#1122,.T.);
#1122=EDGE_LOOP('',(#11230,#11231,#11232,#11233));
#11230=ORIENTED_EDGE('',*,*,#180,.T.);
#11231=ORIENTED_EDGE('',*,*,#189,.T.);
#11232=ORIENTED_EDGE('',*,*,#184,.F.);
#11233=ORIENTED_EDGE('',*,*,#188,.F.);
#1125=PLANE('',#1126);
#1126=AXIS2_PLACEMENT_3D('',#120,#141,#140);
#1130=ADVANCED_FACE('',(#1131),#1135,.T.);
#1131=FACE_OUTER_BOUND('',#1132,.T.);
#1132=EDGE_LOOP('',(#11330,#11331,#11332,#11333));
#11330=ORIENTED_EDGE('',*,*,#181,.T.);
#11331=ORIENTED_EDGE('',*,*,#190,.T.);
#11332=ORIENTED_EDGE('',*,*,#185,.F.);
#11333=ORIENTED_EDGE('',*,*,#189,.F.);
#1135=PLANE('',#1136);
#1136=AXIS2_PLACEMENT_3D('',#121,#140,#141);
#1140=ADVANCED_FACE('',(#1141),#1145,.T.);
#1141=FACE_OUTER_BOUND('',#1142,.T.);
#1142=EDGE_LOOP('',(#11430,#11431,#11432,#11433));
#11430=ORIENTED_EDGE('',*,*,#182,.T.);
#11431=ORIENTED_EDGE('',*,*,#190,.T.);
#11432=ORIENTED_EDGE('',*,*,#186,.F.);
#11433=ORIENTED_EDGE('',*,*,#191,.F.);
#1145=PLANE('',#1146);
#1146=AXIS2_PLACEMENT_3D('',#123,#141,#140);
#1150=ADVANCED_FACE('',(#1151),#1155,.F.);
#1151=FACE_OUTER_BOUND('',#1152,.T.);
#1152=EDGE_LOOP('',(#11530,#11531,#11532,#11533));
#11530=ORIENTED_EDGE('',*,*,#183,.T.);
#11531=ORIENTED_EDGE('',*,*,#191,.T.);
#11532=ORIENTED_EDGE('',*,*,#187,.F.);
#11533=ORIENTED_EDGE('',*,*,#188,.F.);
#1155=PLANE('',#1156);
#1156=AXIS2_PLACEMENT_3D('',#120,#140,#141);
ENDSEC;
END-ISO-10303-21;
`;

await writeFile(join(values.out, 'box.step'), step);
process.stdout.write(
  JSON.stringify({
    protocol: 1,
    format: 'step',
    sourceUnit: 'mm',
    primary: 'box.step',
    consumedSources: [{ path: values.file, sha256: createHash('sha256').update(source).digest('hex') }],
  }),
);
