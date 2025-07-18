import { Module } from '@nestjs/common';
import { ToolService } from '~/api/tools/tool.service.js';

@Module({
  providers: [ToolService],
  exports: [ToolService],
})
export class ToolModule {}
