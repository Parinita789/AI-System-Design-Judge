import { Controller, Get, Param } from '@nestjs/common';
import { RubricLoaderService } from '../services/rubric-loader.service';
import { Phase } from '../../phase-tagger/models/phase.types';

@Controller('rubrics')
export class RubricsController {
  constructor(private readonly rubricLoader: RubricLoaderService) {}

  @Get(':version/:phase')
  get(@Param('version') version: string, @Param('phase') phase: Phase) {
    return this.rubricLoader.load(version, phase);
  }
}
