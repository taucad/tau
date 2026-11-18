/** Representative source samples shared by parser and rendered-editor acceptance. */
export const editorSyntaxFixtures = [
  ['typescript', 'const radius: number = 12; // dimension'],
  ['typescriptreact', 'const mesh = <box name="測定" />;'],
  ['javascript', 'const radius = 12; // dimension'],
  ['javascriptreact', 'const mesh = <box name="測定" />;'],
  ['python', 'def radius(value):\n    return "測定" # label'],
  ['json', '{"nested":{"radius":12}}'],
  ['jsonc', '{ // radius\n "radius":12}'],
  ['jsonl', '{"radius":12}\n{"radius":13}'],
  [
    'markdown',
    '# Title\n**strong** and *emphasis* with `code`.\n[Reference](https://example.com)\n\n```typescript\nconst radius: number = 12;\n```',
  ],
  ['yaml', 'radius: 12\nname: "測定"'],
  ['bash', '#!/bin/bash\necho "測定"'],
  ['csharp', 'public class Model { public double Radius = 12; }'],
  ['kcl', '/* measurement */\nradius = 12\nname = "測定"'],
  ['openscad', 'module part() { cube([1,2,3]); } // solid'],
  ['stepfile', "ISO-10303-21;\nDATA;\n#1=CARTESIAN_POINT('',(0.,0.,0.));\nENDSEC;"],
  ['stl', 'solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nendloop\nendfacet\nendsolid test'],
  ['usd', '#usda 1.0\ndef Xform "part" {\n double radius = 12\n}'],
  ['sysml', 'package Example { part def Wheel; }'],
] as const;
