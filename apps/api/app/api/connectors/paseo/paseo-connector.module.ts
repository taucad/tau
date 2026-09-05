import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { PaseoConnectorController } from '#api/connectors/paseo/paseo-connector.controller.js';
import { PaseoConnectorService } from '#api/connectors/paseo/paseo-connector.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PaseoConnectorController],
  providers: [PaseoConnectorService],
  exports: [PaseoConnectorService],
})
export class PaseoConnectorModule {}
