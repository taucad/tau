import { Module } from '@nestjs/common';
import { FileEditController } from '~/api/file-edit/file-edit.controller.js';
import { FileEditService } from '~/api/file-edit/file-edit.service.js';

@Module({
  imports: [],
  controllers: [FileEditController],
  providers: [FileEditService],
  exports: [FileEditService],
})
export class FileEditModule {}
