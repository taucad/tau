import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MorphClient } from '@morphllm/morphsdk';
import type { Environment } from '#config/environment.config.js';

export type FileEditRequest = {
  targetFile: string;
  originalContent: string;
  codeEdit: string;
  instructions?: string;
};

export type FileEditResult = {
  success: boolean;
  message: string;
  error?: string;
  editedContent?: string;
  udiff?: string;
};

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

  public async applyFileEdit(request: FileEditRequest): Promise<FileEditResult> {
    try {
      const { originalContent, codeEdit, targetFile, instructions } = request;

      const result = await this.morph.fastApply.applyEdit({
        originalCode: originalContent,
        codeEdit,
        instructions: instructions ?? 'Apply the code edit',
        filepath: targetFile,
      });

      if (!result.success) {
        return {
          success: false,
          message: 'Error applying file edit',
          error: result.error,
        };
      }

      return {
        success: true,
        message: 'File edit applied successfully',
        editedContent: result.mergedCode,
        udiff: result.udiff,
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
