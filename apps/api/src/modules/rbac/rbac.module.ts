import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RbacGuard } from './rbac.guard';
import { RoleService } from './role.service';

@Module({
  imports: [AuditModule],
  providers: [RbacGuard, RoleService],
  exports: [RbacGuard, RoleService]
})
export class RbacModule {}
