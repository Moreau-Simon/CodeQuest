import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SimilarityJobService } from './similarity.service';

/** US17 — détection asynchrone de similarité, sans sanction automatique. */
@Module({
  imports: [PrismaModule],
  providers: [SimilarityJobService],
  exports: [SimilarityJobService]
})
export class AntiCheatModule {}
