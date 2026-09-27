import { Global, Module } from '@nestjs/common';
import { DevWebSocketService } from '#api/websocket/dev-websocket.service.js';

/**
 * WebSocket module providing shared WebSocket infrastructure.
 *
 * In dev mode, provides DevWebSocketService, which runs on port+1 and routes
 * raw WebSocket connections to the path and prefix handlers registered with it.
 */
@Global()
@Module({
  providers: [DevWebSocketService],
  exports: [DevWebSocketService],
})
export class WebSocketModule {}
