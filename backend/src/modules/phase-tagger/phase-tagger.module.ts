import { Module } from '@nestjs/common';
import { PhaseTaggerService } from './services/phase-tagger.service';

@Module({
  providers: [PhaseTaggerService],
  exports: [PhaseTaggerService],
})
export class PhaseTaggerModule {}
