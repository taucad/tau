export const toolName = {
  webSearch: 'web_search',
  webBrowser: 'web_browser',
  fileEdit: 'edit_file',
  imageAnalysis: 'analyze_image',
  transferToCadExpert: 'transfer_to_cad_expert',
  transferToResearchExpert: 'transfer_to_research_expert',
  transferBackToSupervisor: 'transfer_back_to_supervisor',
} as const satisfies Record<string, string>;

export const toolNames = Object.values(toolName) as [(typeof toolName)[keyof typeof toolName]];

export const toolMode = {
  none: 'none',
  auto: 'auto',
  any: 'any',
  custom: 'custom',
} as const satisfies Record<string, string>;

export const toolModes = Object.values(toolMode) as [(typeof toolMode)[keyof typeof toolMode]];
