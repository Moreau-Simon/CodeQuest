import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsentService, type PrivacyPrisma } from './consent.service';
import { PrivacyController } from './privacy.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PrivacyController],
  providers: [
    {
      provide: ConsentService,
      useFactory: (prisma: PrismaService) => new ConsentService(prisma as unknown as PrivacyPrisma),
      inject: [PrismaService]
    }
  ],
  exports: [ConsentService]
})
export class PrivacyModule {}
