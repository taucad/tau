/** @public */
export const toolName = {
  webSearch: 'web_search',
  webBrowser: 'web_browser',
  testModel: 'test_model',
  useSkill: 'use_skill',
  readFile: 'read_file',
  editFile: 'edit_file',
  arrangeWorkbench: 'arrange_workbench',
  listDirectory: 'list_directory',
  createFile: 'create_file',
  deleteFile: 'delete_file',
  grep: 'grep',
  globSearch: 'glob_search',
  evaluateModel: 'evaluate_model',
  exportModel: 'export_model',
  getParameters: 'get_parameters',
  applyParameterOperation: 'apply_parameter_operation',
  screenshot: 'screenshot',
  revisions: 'revisions',
  updateTodos: 'update_todos',
  askQuestions: 'ask_questions',
  installPackages: 'install_packages',
  getMachine: 'get_machine',
  getPrintProfiles: 'get_print_profiles',
  requestPrint: 'request_print',
  getPrintRequest: 'get_print_request',
  listPrintRequests: 'list_print_requests',
  cancelPrint: 'cancel_print',
} as const satisfies Record<string, string>;

/** @public */
export const toolNames = Object.values(toolName) as [(typeof toolName)[keyof typeof toolName]];

/** @public */
export const toolMode = {
  none: 'none',
  auto: 'auto',
  any: 'any',
  custom: 'custom',
} as const satisfies Record<string, string>;

/** @public */
export const toolModes = Object.values(toolMode) as [(typeof toolMode)[keyof typeof toolMode]];
