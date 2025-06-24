import { Module } from '@nestjs/common';
import { ToolService } from './tool.service.js';

@Module({
  providers: [ToolService],
  exports: [ToolService],
})
export class ToolModule {}
