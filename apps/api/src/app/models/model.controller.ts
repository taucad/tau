import { Controller, Get } from '@nestjs/common';
import { ModelService } from './model.service';

@Controller('models')
export class ModelController {
  public constructor(private readonly modelService: ModelService) {}

  @Get()
  public async getModels() {
    const models = await this.modelService.getModels();

    return models;
  }
}
