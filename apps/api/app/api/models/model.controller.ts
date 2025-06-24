import { Controller, Get } from '@nestjs/common';
import type { Model } from '~/api/models/model.schema.js';
import { ModelService } from '~/api/models/model.service.js';

@Controller('models')
export class ModelController {
  public constructor(private readonly modelService: ModelService) {}

  @Get()
  public async getModels(): Promise<Model[]> {
    const models = await this.modelService.getModels();

    return models;
  }
}
