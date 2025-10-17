export const tool = {
  webSearch: 'web_search',
  webBrowser: 'web_browser',
  fileEdit: 'edit_file',
  imageAnalysis: 'analyze_image',
} as const satisfies Record<string, string>;

export const tools = Object.values(tool) as [(typeof tool)[keyof typeof tool]];

export const toolSelection = {
  none: 'none',
  auto: 'auto',
  any: 'any',
} as const satisfies Record<string, string>;

export const toolSelections = Object.values(toolSelection) as [(typeof toolSelection)[keyof typeof toolSelection]];
