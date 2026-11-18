import { Controller, Get, Global, Module, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../modules/rbac/rbac.constants';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  async scrape(@Res() response: Response): Promise<void> {
    response.type(this.metrics.contentType).send(await this.metrics.render());
  }
}

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService]
})
export class MetricsModule {}
