import { Body, Controller, Post } from '@nestjs/common';
import { FileEditService } from '~/chat/file-edit.service.js';
import type { FileEditRequest, FileEditResult } from '~/chat/file-edit.service.js';

@Controller('file-edit')
export class FileEditController {
  public constructor(private readonly fileEditService: FileEditService) {}

  @Post('apply')
  public async applyEdit(@Body() body: FileEditRequest): Promise<FileEditResult> {
    return this.fileEditService.applyFileEdit(body);
  }
}
