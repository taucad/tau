import { Controller, Get } from '@nestjs/common';
import type { Model } from '~/api/models/model.schema.js';
import { ModelService } from '~/api/models/model.service.js';

@Controller({ path: 'models', version: '1' })
export class ModelController {
  public constructor(private readonly modelService: ModelService) {}

  @Get()
  public async getModels(): Promise<Model[]> {
    const models = await this.modelService.getModels();

    return models;
  }
}
