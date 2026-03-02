import { Module } from '@nestjs/common';
import { GeometryAnalysisService } from '#api/analysis/geometry-analysis.service.js';

@Module({
  providers: [GeometryAnalysisService],
  exports: [GeometryAnalysisService],
})
export class AnalysisModule {}
