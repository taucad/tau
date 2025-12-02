export const toolName = {
  webSearch: 'webSearch',
  webBrowser: 'webBrowser',
  fileEdit: 'editFile',
  imageAnalysis: 'analyzeImage',
} as const satisfies Record<string, string>;

export const toolNames = Object.values(toolName) as [(typeof toolName)[keyof typeof toolName]];

export const toolMode = {
  none: 'none',
  auto: 'auto',
  any: 'any',
  custom: 'custom',
} as const satisfies Record<string, string>;

export const toolModes = Object.values(toolMode) as [(typeof toolMode)[keyof typeof toolMode]];
