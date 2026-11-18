import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Métriques Prometheus de l'API (T028) :
 * latence HTTP, profondeur de files, connexions temps réel, durée des verdicts.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Durée des requêtes HTTP en secondes',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry]
  });

  private readonly queueDepth = new Gauge({
    name: 'queue_depth',
    help: 'Nombre de jobs en attente par file',
    labelNames: ['queue'] as const,
    registers: [this.registry]
  });

  private readonly realtimeConnections = new Gauge({
    name: 'realtime_connections',
    help: 'Nombre de sockets temps réel ouverts',
    registers: [this.registry]
  });

  private readonly submissionVerdictDuration = new Histogram({
    name: 'submission_verdict_seconds',
    help: 'Temps entre le dépôt et le verdict d’une soumission',
    labelNames: ['verdict'] as const,
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [this.registry]
  });

  private readonly rateLimitHits = new Counter({
    name: 'rate_limit_hits_total',
    help: 'Nombre de requêtes refusées par la limitation de débit',
    labelNames: ['scope'] as const,
    registers: [this.registry]
  });

  observeHttp(method: string, route: string, status: number, seconds: number): void {
    this.httpRequestDuration.observe(
      { method, route, status: String(status) },
      Number.isFinite(seconds) ? Math.max(0, seconds) : 0
    );
  }

  setQueueDepth(queue: string, depth: number): void {
    this.queueDepth.set({ queue }, depth);
  }

  setRealtimeConnections(count: number): void {
    this.realtimeConnections.set(count);
  }

  observeVerdict(verdict: string, seconds: number): void {
    this.submissionVerdictDuration.observe({ verdict }, Math.max(0, seconds));
  }

  countRateLimitHit(scope: string): void {
    this.rateLimitHits.inc({ scope });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
