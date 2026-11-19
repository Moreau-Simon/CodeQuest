import { Controller, Get, Module, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../rbac/rbac.constants';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness : ne touche aucune dépendance externe. */
  @Public()
  @Get()
  live(): { status: 'ok'; timestamp: string } {
    return this.health.liveness();
  }

  /** Alias utilisé par les healthchecks Docker/CI. */
  @Public()
  @Get('live')
  liveAlias(): { status: 'ok'; timestamp: string } {
    return this.health.liveness();
  }

  /** Readiness : PostgreSQL, Redis et MinIO doivent répondre. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const report = await this.health.readiness();
    if (report.status !== 'ready') {
      response.status(503);
    }
    return report;
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
