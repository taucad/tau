/**
 * What each first-party Tau tool is to agent observability (LQ5): its name may leave the device, and its class says
 * what it does to a design. The names are Tau's public source; a tool outside this vocabulary (an MCP server's, a
 * user's) can be private, so it is reported only as {@link externalToolName}. The keys are the tool names
 * `tauToolKinds` lists, and a test keeps the two the same.
 */

/** The evidence contract's tool classes. @public */
export type ToolEvidenceClass = 'read' | 'write' | 'execute' | 'geometry' | 'verification' | 'export' | 'other';

/** The name every tool outside the first-party vocabulary is reported as. @public */
export const externalToolName = 'external-tool';

/** Each first-party tool's evidence class, by tool name. @public */
export const tauToolEvidence: ReadonlyMap<string, ToolEvidenceClass> = new Map<string, ToolEvidenceClass>([
  ['read_file', 'read'],
  ['list_directory', 'read'],
  ['grep', 'read'],
  ['glob_search', 'read'],
  ['web_search', 'read'],
  ['web_browser', 'read'],
  ['create_file', 'write'],
  ['edit_file', 'write'],
  ['arrange_workbench', 'write'],
  ['delete_file', 'write'],
  ['evaluate_model', 'geometry'],
  ['get_parameters', 'read'],
  ['apply_parameter_operation', 'write'],
  ['test_model', 'verification'],
  ['export_model', 'export'],
  ['screenshot', 'geometry'],
  ['revisions', 'read'],
  ['use_skill', 'read'],
  ['update_todos', 'write'],
  ['ask_questions', 'other'],
  ['install_packages', 'write'],
  ['list_machines', 'read'],
  ['get_machine', 'read'],
  ['machine_action', 'execute'],
  ['stop_machine', 'execute'],
  ['get_print_profiles', 'read'],
  ['request_job', 'execute'],
  ['check_job', 'read'],
  ['shell', 'execute'],
]);
