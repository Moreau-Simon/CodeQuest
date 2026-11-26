import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClockModule } from './common/clock.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HttpMetricsInterceptor } from './common/metrics/http-metrics.interceptor';
import { MetricsModule } from './common/metrics/metrics.module';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { RateLimitService } from './common/rate-limit/rate-limit.service';
import { MailModule } from './mail/mail.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthenticationGuard } from './modules/auth/authentication.guard';
import { AuthModule } from './modules/auth/auth.module';
import { BossesModule } from './modules/bosses/bosses.module';
import { ChallengesModule } from './modules/challenges/challenges.module';
import { ContentModule } from './modules/content/content.module';
import { EconomyModule } from './modules/economy/economy.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { LeaderboardsModule } from './modules/leaderboards/leaderboards.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { RbacGuard } from './modules/rbac/rbac.guard';
import { RbacModule } from './modules/rbac/rbac.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { TeamsModule } from './modules/teams/teams.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ClockModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    QueueModule,
    MetricsModule,
    MailModule,
    AuditModule,
    RbacModule,
    AuthModule,
    UsersModule,
    ChallengesModule,
    EventsModule,
    EconomyModule,
    BossesModule,
    SubmissionsModule,
    ContentModule,
    LeaderboardsModule,
    TeamsModule,
    LessonsModule,
    HealthModule,
    RealtimeModule,
    AdminModule
  ],
  providers: [
    RateLimitService,
    { provide: APP_FILTER, useValue: new HttpExceptionFilter() },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    // L'authentification doit précéder le RBAC : elle attache `request.user`.
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }
  ]
})
export class AppModule {}
