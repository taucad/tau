import type { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import type { FileEditService } from '#api/file-edit/file-edit.service.js';
import type { GeometryAnalysisService } from '#api/analysis/geometry-analysis.service.js';

/**
 * Configurable context passed to tools via LangChain RunnableConfig.
 * This allows tools to access services for executing RPC operations.
 */
export type ChatRpcConfigurable = {
  /** The ChatRpcService instance for sending RPC requests via WebSocket */
  chatRpcService: ChatRpcService;
  /** The FileEditService for processing file edits */
  fileEditService: FileEditService;
  /** The GeometryAnalysisService for deterministic geometry testing */
  geometryAnalysisService: GeometryAnalysisService;
  /** The chat/thread ID (LangGraph uses snake_case for thread_id) */
  thread_id: string;
};
