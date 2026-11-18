import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountDeletionService } from './account-deletion.service';
import { MeController } from './me.controller';
import { AccountPurgeJob } from './purge.job';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [MeController],
  providers: [UsersService, AccountDeletionService, AccountPurgeJob],
  exports: [UsersService, AccountDeletionService, AccountPurgeJob]
})
export class UsersModule {}
