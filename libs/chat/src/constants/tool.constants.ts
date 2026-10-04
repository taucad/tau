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
  listMachines: 'list_machines',
  getMachine: 'get_machine',
  machineAction: 'machine_action',
  stopMachine: 'stop_machine',
  getPrintProfiles: 'get_print_profiles',
  requestJob: 'request_job',
  checkJob: 'check_job',
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
