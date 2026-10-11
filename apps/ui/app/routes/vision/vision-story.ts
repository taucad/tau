/** Seconds. One absolute timeline drives the copy, geometry and transport. */
export const chapterDuration = 12;
export const visionChapters = [
  {
    id: 'imagine',
    label: 'Imagine',
    eyebrow: 'An idea is a beginning',
    title: 'Give ideas\nphysical form',
    body: 'A thought becomes words. Words become a model. A model becomes something you can hold. Tau is building the open tools that connect those steps.',
    caption: 'One idea. Thirty-four parts. A world of possibilities.',
    status: 'The vision',
    detail:
      'For most of history, the distance between imagining an object and making it has been filled with specialist tools, handoffs and expense. AI can shorten that distance. The opportunity is to give more people a way to act on what they imagine, while keeping the design inspectable and the decisions accountable.',
  },
  {
    id: 'design',
    label: 'Describe',
    eyebrow: 'Language → editable design',
    title: 'Start with\nwhat you need',
    body: 'Describe a mechanism. Let an agent help write the design. Change its dimensions, read its source, and keep refining the same object.',
    caption: '“Create a planetary gearbox with a 4:1 reduction, three planets and socket screws on top.”',
    status: 'In Tau today',
    detail:
      'Tau connects AI-assisted authoring to code-based CAD kernels. Code records the choices that produce the geometry, making a design repeatable and changeable. The gearbox on screen is Tau’s authored planetary gearbox example, rendered from geometry exported from its source; this presentation does not run an AI generation in the background.',
  },
  {
    id: 'evaluate',
    label: 'Question',
    eyebrow: 'More intelligence. Better questions.',
    title: 'Make the idea\nanswer to reality',
    body: 'Explore alternatives. Check dimensions and clearances. Ask what would make the design fail. More compute helps search; evidence tells you what to trust.',
    caption: 'Requirements → candidate → checks → revision',
    status: 'Geometry checks today',
    detail:
      'An attractive model is not proof that a part will work. Tau’s geometry checks can test declared geometric requirements. Stress, heat, wear and material behavior need suitable solvers, conditions and validation. More tokens do not remove physical limits or turn an uncertain assumption into a measured fact.',
  },
  {
    id: 'time',
    label: 'Move',
    eyebrow: 'The fourth dimension is time',
    title: 'Design what\nhappens next',
    body: 'An object is more than its shape. See how parts move together, how an assembly changes, and how a design behaves across time.',
    caption: '4:1 reduction · Motion illustration, not a load simulation',
    status: 'Kinematics foundation',
    detail:
      'Tau’s kinematics package represents joints, couplings and time-based animation. Here, the sun gear turns four times for each carrier revolution, with the ring held fixed. This is a prescribed motion illustration. A 4D representation can also describe assembly, manufacturing or service history; it does not automatically predict the physical future.',
  },
  {
    id: 'open',
    label: 'Share',
    eyebrow: 'Open source. Open standards.',
    title: 'Good ideas\nshould travel',
    body: 'Use glTF to put 3D on the web. Use OpenUSD in composed production scenes. Carry the idea into visualization, collaboration and cinematic storytelling.',
    caption: 'glTF / GLB · OpenUSD · Source + engineering artifacts',
    status: 'Standards, with distinct roles',
    detail:
      'glTF delivers meshes, materials and animation. OpenUSD supports scene composition and time-varying properties. They serve different purposes, and conversion does not guarantee that CAD history, constraints or every material survives. Keep the editable source and exact engineering artifacts alongside visual exports. Full OpenUSD authoring is an exploration direction, not a claim about every Tau conversion route.',
  },
  {
    id: 'make',
    label: 'Make',
    eyebrow: 'A design meets a machine',
    title: 'The next step\nis physical',
    body: 'Connect a design to a suitable printer, CNC machine or workshop. Prepare the process, inspect the plan, and follow the job through to a real result.',
    caption: 'Ring gear on a 256 mm build plate · Illustration, no print job is sent',
    status: 'Future workflow',
    detail:
      'Tau already has a machine-provider foundation and a Bambu Developer LAN plugin. The larger goal is qualified adapters for more machines and factories. Each process needs its own material, tooling, fixture and operating constraints. A command being sent is not proof that the machine accepted it, or that the finished part meets its requirements.',
  },
  {
    id: 'source',
    label: 'Connect',
    eyebrow: 'One object. Many contributors.',
    title: 'Connect the\nmeans of making',
    body: 'Reuse shared parts. Find stock in warehouses. Request manufacturing quotes. Let authorized agents coordinate purchasing, delivery and progress updates.',
    caption: 'Parts library → suppliers → fabrication → delivery',
    status: 'Future ecosystem',
    detail:
      'A proposed sourcing workflow could compare compatible parts, check inventory, prepare an order and track fulfillment. A retailer agent, including a possible Amazon integration, would require an available authorized API and explicit purchasing scope. This is not an existing partnership. Price, payment, substitutions and delivery remain separate, observable decisions.',
  },
  {
    id: 'life',
    label: 'Learn',
    eyebrow: 'The object ships. The story continues.',
    title: 'Let experience\nimprove the design',
    body: 'Connect machine status and service history to the object that was designed. Notice changes. Investigate causes. Propose a better next revision.',
    caption: 'Observe → understand → propose → verify',
    status: 'Future lifecycle',
    detail:
      'With permission, third-party machine APIs could expose status, faults and maintenance observations throughout a product’s life. Agents could compare these with the correct revision and recommend an action. Stale data remains stale, a prediction remains a prediction, and design updates do not silently become commands to a physical device.',
  },
  {
    id: 'people',
    label: 'Empower',
    eyebrow: 'What this changes for us',
    title: 'More people\nget to be makers',
    body: 'A student can explore a mechanism. A designer can test more possibilities. A small workshop can take on a larger idea. Expertise moves closer to intent, judgment and proof.',
    caption: 'Access to tools should widen access to creating.',
    status: 'A possibility to shape',
    detail:
      'Some modeling and coordination tasks may be automated; roles and demand may change, and job losses are possible. No tool guarantees a fair transition. People still choose what is worth making, assess evidence and take responsibility for outcomes. Open tools can broaden participation, but compute, materials, skills and factory access still affect who benefits.',
  },
  {
    id: 'begin',
    label: 'Begin',
    eyebrow: 'The future is open to contribution',
    title: 'What will\nyou make real?',
    body: 'Tau is an open-source foundation for creating with AI, code and geometry. Start with one useful object. Help build what comes next.',
    caption: 'Open source · Apache-2.0 Tau-authored source',
    status: 'Build with Tau',
    detail:
      'The ambition is to make the path from intention to physical creation more accessible and more accountable. The first step is concrete: open a project, describe a useful part, inspect it and improve it. The future grows from designs that people can understand, reuse and verify.',
  },
] as const;

export const visionDuration = chapterDuration * visionChapters.length;

/** Clamp seeks, including invalid input, to a finite position in the film. */
export const clampVisionTime = (time: number): number =>
  Number.isFinite(time) ? Math.max(0, Math.min(visionDuration, time)) : 0;

/** Derive chapters from time so a backward seek also restores the whole scene. */
export const visionFrame = (
  time: number,
): { index: number; chapter: (typeof visionChapters)[number]; age: number; elapsed: number } => {
  const elapsed = clampVisionTime(time);
  const index = Math.min(visionChapters.length - 1, Math.floor(elapsed / chapterDuration));
  const age = elapsed - index * chapterDuration;
  return { index, chapter: visionChapters[index]!, age, elapsed };
};

export const formatVisionTime = (time: number): string =>
  `${Math.floor(time / 60)}:${Math.floor(time % 60)
    .toString()
    .padStart(2, '0')}`;
