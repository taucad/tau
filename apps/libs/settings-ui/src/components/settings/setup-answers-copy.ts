/**
 * The copy of Settings → Agents' setup answers: the switch that decides whether Tau's own agent is told what the person
 * makes and the code they read, and the row that shows the answers with Edit and Clear.
 */
export const setupAnswersCopy = {
  group: 'Setup answers',
  switchTitle: 'Use my setup answers',
  switchDescription:
    'Tau tells the agent what you make and the code you read. This is saved with each chat in the project, where people you share it with can read it. Turning this off does not change chats already saved.',
  rowTitle: 'Setup answers',
  makes: 'You make',
  tool: 'Tool you know best',
  reads: 'Code you read',
  notAnswered: 'Not answered',
  edit: 'Edit',
  clear: 'Clear',
  clearRefused: 'Tau could not clear your answers on this device. They are cleared until you close Tau.',
} as const;
