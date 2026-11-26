import { Module } from '@nestjs/common';
import { LoreController } from './lore.controller';
import { LoreService } from './lore.service';

/** US12 — lore narratif, déblocage par niveau et état de lecture. */
@Module({
  controllers: [LoreController],
  providers: [LoreService],
  exports: [LoreService]
})
export class ContentModule {}
