import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MorphClient } from '@morphllm/morphsdk';
import type { Environment } from '#config/environment.config.js';
import { parseDiffStats } from '#utils/diff.utils.js';
import { Span } from '#telemetry/tracer.service.js';

export type FileEditRequest = {
  targetFile: string;
  originalContent: string;
  codeEdit: string;
  instructions?: string;
};

export type FileEditSuccess = {
  success: true;
  message: string;
  editedContent: string;
  udiff?: string;
  diffStats?: { linesAdded: number; linesRemoved: number };
};

export type FileEditFailure = {
  success: false;
  message: string;
  error: string;
};

export type FileEditResult = FileEditSuccess | FileEditFailure;

@Injectable()
export class FileEditService {
  private readonly morph: MorphClient;

  public constructor(private readonly configService: ConfigService<Environment, true>) {
    const morphApiKey = this.configService.get<string>('MORPH_API_KEY', { infer: true });

    if (!morphApiKey) {
      throw new Error('MORPH_API_KEY is required for file editing functionality');
    }

    this.morph = new MorphClient({ apiKey: morphApiKey });
  }

  @Span()
  public async applyFileEdit(request: FileEditRequest): Promise<FileEditResult> {
    try {
      const { originalContent, codeEdit, targetFile, instructions } = request;
      const instruction = instructions ?? 'Apply the code edit';

      const result = await this.morph.fastApply.applyEdit({
        originalCode: originalContent,
        codeEdit,
        instruction,
        filepath: targetFile,
      });

      if (!result.success || result.mergedCode === undefined) {
        return {
          success: false,
          message: 'Error applying file edit',
          error: result.error ?? 'Unknown error',
        };
      }

      return {
        success: true,
        message: 'File edit applied successfully',
        editedContent: result.mergedCode,
        udiff: result.udiff,
        diffStats: result.udiff ? parseDiffStats(result.udiff) : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        success: false,
        message: 'Error applying file edit',
        error: errorMessage,
      };
    }
  }
}
