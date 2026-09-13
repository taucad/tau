type EngineeringDisciplineConfig = {
  name: string;
  slug: string;
  description: string;
};

export const engineeringDisciplines = {
  mechanical: {
    name: 'Mechanical',
    slug: 'mechanical-engineering',
    description:
      'The branch of engineering that deals with the design, analysis, and manufacturing of mechanical systems.',
  },
  electrical: {
    name: 'Electrical',
    slug: 'electrical-engineering',
    description:
      'The branch of engineering that deals with the design, analysis, and manufacturing of electrical systems.',
  },
  firmware: {
    name: 'Firmware',
    slug: 'firmware-engineering',
    description:
      'The branch of engineering that deals with the design, analysis, and manufacturing of firmware systems.',
  },
  software: {
    name: 'Software',
    slug: 'software-engineering',
    description:
      'The branch of engineering that deals with the design, analysis, and manufacturing of software systems.',
  },
} as const satisfies Record<string, EngineeringDisciplineConfig>;
