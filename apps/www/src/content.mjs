/** Public copy only. Commercial and capability provenance lives in README.md. */
export const appOrigin = 'https://tau.new';
export const navigation = [
  ['Product', '/product/'],
  ['Use cases', '/use-cases/'],
  ['Vision', '/vision/'],
  ['Pricing', '/pricing/'],
  ['Journal', '/blog/'],
  ['Contact', '/contact/'],
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
        'Export supported geometry for your fabrication workflow. Check material, tolerances and process settings before making the part.',
      ],
    ],
  },
  {
    slug: 'engineering',
    title: 'Give every revision a question to answer.',
    audience: 'For engineers & technical teams',
    description:
      'Use code-based geometry and explicit checks to make design changes inspectable. Keep the requirements close to the model you are evaluating.',
    image: 'engine.webp',
    alt: 'V8 engine model from the Tau example library',
    steps: [
      ['Make intent explicit', 'Describe the envelope, interfaces and clearances that constrain the design.'],
      [
        'Check the geometry',
        'GeoSpec evaluates declared geometric requirements. A passed geometry check is evidence about that requirement, not a general safety certification.',
      ],
      [
        'Review the evidence',
        'Inspect the model and its source before moving to analysis, tooling or manufacture. Physical performance requires appropriate validation.',
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
export const visionChapters = [
  [
    'Today',
    'Describe. Build. Inspect.',
    'AI-assisted CAD authoring, editable source, parameters and geometric checks bring ideas into an inspectable form.',
  ],
  [
    'Foundation',
    'Objects that move.',
    'Kinematic models describe how parts move together. Prescribed movement illustrates a mechanism; it does not predict loads, wear or material behavior.',
  ],
  [
    'Vision',
    'Connect design to making.',
    'A connected workflow could carry intent through fabrication, sourcing and service. Broader machine coverage and lifecycle coordination remain development directions.',
  ],
  [
    'Principle',
    'People keep the judgment.',
    'More automation should make creating more accessible. People still choose what to make, evaluate the evidence and authorize actions in the physical world.',
  ],
];
