import { Controller, Get, Param, Query } from '@nestjs/common';
import { RubricLoaderService } from '../services/rubric-loader.service';
import { Phase } from '../../phase-tagger/types/phase.types';
import { Mode, Seniority } from '../types/rubric.types';

@Controller('rubrics')
export class RubricsController {
  constructor(private readonly rubricLoader: RubricLoaderService) {}

  @Get(':version/:phase')
  get(
    @Param('version') version: string,
    @Param('phase') phase: Phase,
    @Query('mode') mode?: Mode,
    @Query('seniority') seniority?: Seniority,
  ) {
    return this.rubricLoader.load(version, phase, mode, seniority);
  }
}
