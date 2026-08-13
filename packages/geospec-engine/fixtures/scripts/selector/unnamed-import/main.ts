import { makeBaseBox } from 'replicad';

// Master acceptance case 4 (unnamed import): the contact/flange-face-positive
// geometry re-exported with no `interfaces` — a third-party-style artifact
// where queries and probes resolve while interface selectors return
// `unsupported`.
export default function main() {
  const head = makeBaseBox(40, 20, 40);
  const flange = makeBaseBox(40, 6, 40).translate([0, -13, 0]);

  return [
    { shape: head, name: 'head' },
    { shape: flange, name: 'runnerFlange' },
  ];
}
