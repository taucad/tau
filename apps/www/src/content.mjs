/** Public copy only. Commercial and capability provenance lives in README.md. */
export const sourceUrl = 'https://github.com/taucad/tau';
export const exampleUrl = `${sourceUrl}/tree/199c8079d5ee42f8c5771fc2cb02bf2791cc3bdf/libs/tau-examples/src/kernels/replicad/planetary-gear-system`;
export const discordUrl = 'https://discord.gg/6pfSAN3t7A';
export const salesEmail = 'sales@tau.new';

export const navigation = [
  ['Product', '/product/'],
  ['Use cases', '/use-cases/'],
  ['Vision', '/vision/'],
  ['Pricing', '/pricing/'],
  ['Journal', '/blog/'],
];

/** The three promises, each with a line diagram drawn in the site's fine-line language. */
export const principles = [
  {
    id: 'design',
    title: 'Start with a what if.',
    body: 'Describe it in plain language, then shape every detail in editable code and named parameters.',
    detail: 'Words → parametric source',
  },
  {
    id: 'verify',
    title: 'Make it add up.',
    body: 'Declare the envelope, clearances and hole patterns. GeoSpec checks them against the actual geometry, and reports what it cannot measure as unknown.',
    detail: 'Measured, not guessed',
  },
  {
    id: 'print',
    title: 'Take it off the screen.',
    body: 'Export a mesh for your slicer or STEP for your next tool. The source and the files stay yours.',
    detail: 'STL · 3MF · STEP',
  },
];

/**
 * The planetary story. Labels state what is real (the authored model, its parameters,
 * a recorded GeoSpec run) and what is illustration (agent tasks, print preparation).
 */
export const storyChapters = [
  {
    id: 'idea',
    label: 'Idea',
    title: 'Start with the constraints.',
    body: 'A reduction you need, a size it has to fit, the hardware already in your drawer. The idea begins as numbers before it has a shape.',
    detail: '4:1 reduction · 174 mm rim · M3 socket screws',
  },
  {
    id: 'prompt',
    label: 'Prompt',
    title: 'Say it in a sentence.',
    body: 'Describe the mechanism the way you would to a colleague. Tau turns the request into a plan of named parts.',
    detail: '“Create a planetary gearbox with a 4:1 reduction, three planets and socket screws on top.”',
  },
  {
    id: 'agents',
    label: 'Parts',
    title: 'Every part gets its own task.',
    body: 'The ring, the gear train and the carrier hardware are worked on as separate, named parts. Each is parametric source you can open and edit.',
    detail: 'Ring gear · Gear train · Carrier & hardware',
    note: 'Illustration of a design session',
  },
  {
    id: 'formation',
    label: 'Geometry',
    title: 'Code becomes geometry.',
    body: 'Each part’s source evaluates to a solid. Teeth, pins, bushings and fasteners resolve from the same shared parameters.',
    detail: '34 solids · 24 / 24 / 72 teeth',
  },
  {
    id: 'assembly',
    label: 'Assembly',
    title: 'Then it goes together.',
    body: 'Carrier, pins and bearings first; planets, sun and ring next; the output carrier and its screws last. One turn of the sun moves the carrier a quarter turn.',
    detail: 'Fixed ring · sun input · carrier output · 4:1',
  },
  {
    id: 'parameter',
    label: 'Parameter',
    title: 'Change one number.',
    body: 'Widen the gears from 14 to 18 mm. The ring, pins, bushings and hardware follow the source, and the axial envelope grows from 68 to 72 mm.',
    detail: 'faceWidth 14 → 18 · inputAngle 0° → 30°',
  },
  {
    id: 'verification',
    label: 'Evidence',
    title: 'Check it against the requirements.',
    body: 'The example declares ten GeoSpec requirements. Anything GeoSpec cannot yet measure comes back inconclusive, never as a pass.',
    detail: 'Recorded GeoSpec run',
  },
  {
    id: 'print',
    label: 'Print',
    title: 'Prepare it for the printer.',
    body: 'Pick a part, check that it fits your build volume and export it for your slicer. Here the ring gear goes onto a 256 mm plate.',
    detail: 'Illustration · no print job is sent',
  },
  {
    id: 'devices',
    label: 'Anywhere',
    title: 'Pick it up on another computer.',
    body: 'Back the project up to Tau Cloud and open it wherever you sign in to Tau: its files, its revision history and, unless you turn them off, its chats.',
    detail: 'Tau Cloud backup & sync · Pro and Enterprise',
  },
];

/** Geometry engines from libs/types kernel constants. Desktop entries are labelled as such. */
export const ecosystem = [
  {
    title: 'Geometry engines',
    body: 'Precise solids, meshes, implicit fields and circuits.',
    items: [
      ['OpenSCAD', 'Browser'],
      ['Replicad', 'Browser'],
      ['JSCAD', 'Browser'],
      ['Manifold', 'Browser'],
      ['OpenCascade', 'Browser'],
      ['PicoVoxel', 'Browser'],
      ['tscircuit', 'Browser'],
      ['Zoo KCL', 'Cloud · Pro'],
      ['Build123d', 'Desktop · in development'],
      ['PicoGK', 'Desktop · in development'],
    ],
  },
  {
    title: 'Models',
    body: 'Tau-hosted AI, paid with credits.',
    items: [
      ['Anthropic', 'Claude'],
      ['OpenAI', 'GPT'],
      ['Google', 'Gemini'],
      ['xAI', 'Grok'],
      ['Together AI', 'Open-weight models'],
    ],
  },
  {
    title: 'Coding agents',
    body: 'Bring your own agent to Tau Desktop.',
    items: [
      ['Claude Code', 'Desktop · in development'],
      ['Codex', 'Desktop · in development'],
      ['Grok Build', 'Desktop · in development'],
    ],
  },
];

export const useCases = [
  {
    slug: 'prototyping',
    title: 'A better first prototype.',
    audience: 'For makers & product designers',
    description:
      'Turn a specific problem into an editable part. Explore an enclosure, a custom mount or a replacement component, then refine the dimensions that matter.',
    image: 'quadcopter.webp',
    alt: 'Tau example of a parametric racing quadcopter frame',
    steps: [
      [
        'Start with the constraints',
        'Describe what the part needs to hold, where it needs to fit and which dimensions you already know.',
      ],
      [
        'Refine the same design',
        'Keep the source, adjust parameters and inspect the next revision. Your first result is a starting point.',
      ],
      [
        'Prepare your next step',
        'Export STL, 3MF or STEP for your fabrication workflow. Check material, tolerances and process settings before making the part.',
      ],
    ],
  },
  {
    slug: 'engineering',
    title: 'Give every revision a question to answer.',
    audience: 'For engineers & technical teams',
    description:
      'Use code-based geometry and explicit checks to make design changes inspectable. Keep the requirements next to the model they constrain.',
    image: 'engine.webp',
    alt: 'V8 engine model from the Tau example library',
    steps: [
      ['Make intent explicit', 'Declare the envelope, interfaces and clearances that constrain the design.'],
      [
        'Check the geometry',
        'GeoSpec evaluates declared geometric requirements. A pass is evidence about that requirement, not a general safety certification; unsupported evidence is reported as inconclusive.',
      ],
      [
        'Review the evidence',
        'Inspect the model and its source before moving to analysis, tooling or manufacture. Physical performance still needs appropriate validation.',
      ],
    ],
  },
  {
    slug: 'learning',
    title: 'Understand it by changing it.',
    audience: 'For students & curious minds',
    description:
      'Explore how geometry responds to code. Change a parameter, inspect the result and ask a more precise question.',
    image: 'heat-exchanger.webp',
    alt: 'Parametric heat exchanger example in Tau',
    steps: [
      ['Open an example', 'Begin with a model you can inspect instead of an empty canvas.'],
      [
        'Try one change',
        'Adjust a dimension or ask the agent to explain a modeling choice. Compare the resulting geometry.',
      ],
      [
        'Keep asking why',
        'Use the source and geometric checks to connect the visible object to the decisions behind it.',
      ],
    ],
  },
];

/** @type {Array<[string, string, string]>} */
export const visionChapters = [
  [
    'Today',
    'Describe. Build. Check.',
    'AI-assisted CAD authoring, editable source, parameters and geometric checks bring an idea into an inspectable form.',
  ],
  [
    'Foundation',
    'Objects that move.',
    'Kinematic models describe how parts move together. Prescribed movement illustrates a mechanism; it does not predict loads, wear or material behavior.',
  ],
  [
    'Direction',
    'Connect design to making.',
    'A connected workflow could carry intent through fabrication, sourcing and service. Machine connections and lifecycle coordination are development directions, not shipped features.',
  ],
  [
    'Principle',
    'People keep the judgment.',
    'More automation should make creating more accessible. People still choose what to make, weigh the evidence and authorize actions in the physical world.',
  ],
];

/** Plans from apps/libs/billing tau-plan-catalog and entitlements; prices in USD. */
export const plans = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'For your next idea.',
    price: 'US$0',
    period: 'forever',
    features: [
      ['All AI models, paid with credits'],
      ['All open-source CAD kernels'],
      ['Unlimited local geometry checks'],
      ['Export to every supported format'],
      ['Public share links'],
      ['Back up to GitHub'],
    ],
    cta: ['Start designing', '/projects/new'],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Keep the iterations coming.',
    price: 'US$20',
    period: 'per month, plus applicable tax',
    features: [
      ['Everything in Free'],
      ['2,000 credits every month'],
      ['Unused plan credits roll over, up to 4,000'],
      ['Tau Cloud backup & sync, 10 GB'],
      ['Zoo KCL cloud kernel, metered'],
      ['Private and unlisted share links'],
      ['No training on your designs'],
      ['Hosted design verification', 'soon'],
    ],
    cta: ['Choose Pro in Tau', '/?settings=billing'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For the way your team works.',
    price: 'Custom',
    period: 'annual agreement',
    features: [
      ['Everything in Pro'],
      ['Tau Cloud backup & sync, 100 GB'],
      ['Custom credit allotment'],
      ['Contractual no-train guarantee (DPA)'],
      ['Dedicated technical contact'],
      ['Invoicing and PO support'],
      ['Signed evidence reports', 'soon'],
      ['Verification CI and org dashboards', 'soon'],
    ],
    cta: ['Talk to us', `mailto:${salesEmail}`],
  },
];

/** @type {Array<[string, string]>} */
export const pricingFaq = [
  [
    'How do credits work?',
    'Credits pay for metered Tau-hosted activity such as AI models and the Zoo KCL kernel. Usage varies by model and task, so a balance is not a guaranteed number of designs.',
  ],
  [
    'Can I buy credits without Pro?',
    'Yes. Credits cost US$1 per 100, with top-ups from US$5 to US$5,000 before applicable tax. Purchased credits do not expire.',
  ],
  [
    'What does Tau Cloud backup & sync include?',
    'On Pro and Enterprise, each project’s files and revision history back up to Tau Cloud and sync wherever you sign in. Chats travel with the project unless you turn chat sync off for it. Storage is per account: 10 GB on Pro, 100 GB on Enterprise. You need to be signed in; while offline you keep working on your local copy.',
  ],
  [
    'Can I back up on the Free plan?',
    'Yes, to GitHub. Every plan can connect a project to a GitHub repository. Tau Cloud sync is part of Pro and Enterprise.',
  ],
  [
    'What happens to unused Pro credits?',
    'Unused plan credits roll over up to 4,000. Purchased credits are separate and never expire. Review subscription and cancellation terms in the app before purchasing.',
  ],
  [
    'Is hosted verification included?',
    'GeoSpec checks run locally on every plan. Hosted design verification is in development and not part of any plan today.',
  ],
];
