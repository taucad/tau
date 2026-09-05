/** OpenAI-compatible SSE fixtures mirrored from the authoritative Tau gateway route. */
export const authoritativeGatewayWireFixtures = {
  toolTurn: [
    'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_file","arguments":"{\\"target"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"File\\":\\"main.ts\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
    'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4,"prompt_tokens_details":{"cached_tokens":5}}}\n\n',
    'data: [DONE]\n\n',
  ],
  browserTurn: [
    'data: {"id":"chatcmpl-worker","choices":[{"index":0,"delta":{"content":"Worker ready."},"finish_reason":null}]}\n\n',
    'data: {"id":"chatcmpl-worker","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n',
    'data: [DONE]\n\n',
  ],
  // Direct-OpenAI catalog rows speak the Responses wire, whose terminal
  // `response.completed` frame is the only place usage appears.
  openAiResponsesToolTurn: [
    'event: response.created\ndata: {"type":"response.created","response":{"id":"resp-fixture","status":"in_progress"}}\n\n',
    'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call-1","name":"read_file","arguments":""}}\n\n',
    'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","output_index":0,"delta":"{\\"target"}\n\n',
    'event: response.function_call_arguments.done\ndata: {"type":"response.function_call_arguments.done","output_index":0,"arguments":"{\\"targetFile\\":\\"main.ts\\"}"}\n\n',
    'event: response.output_item.done\ndata: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call-1","name":"read_file","arguments":"{\\"targetFile\\":\\"main.ts\\"}"}}\n\n',
    'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-fixture","status":"completed","output":[],"usage":{"input_tokens":12,"output_tokens":4,"input_tokens_details":{"cached_tokens":5},"output_tokens_details":{"reasoning_tokens":0},"total_tokens":16}}}\n\n',
  ],
  anthropicToolTurn: [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-fixture","type":"message","role":"assistant","content":[],"model":"fixture-model","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":7,"output_tokens":0,"cache_read_input_tokens":5,"cache_creation_input_tokens":2}}}\n\n',
    'event: ping\ndata: {"type":"ping"}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"think"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-fixture"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call-1","name":"read_file","input":{}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"target"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"File\\":\\"main.ts\\"}"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":4}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ],
} as const;
