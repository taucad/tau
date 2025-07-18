export const signatureSymbolDescriptor = {
  module: 'module',
  function: 'function',
  constant: '(const)',
  variable: '(var)',
  parameter: '(param)',
} as const;

export const documentationDescriptor = {
  default: '_@default_',
  examples: '_@examples_',
  category: '_@category_',
  group: '_@group_',
  parameters: '_@parameters_',
  returns: '_@returns_',
  documentation: '_@documentation_',
} as const;

export const requirementDescriptor = {
  required: '**required**',
  optional: '*optional*',
} as const;
