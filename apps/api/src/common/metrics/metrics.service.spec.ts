import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('expose les métriques exigées par T028', async () => {
    const metrics = new MetricsService();
    const text = await metrics.render();

    expect(metrics.registry.getSingleMetric('http_request_duration_seconds')).toBeDefined();
    expect(metrics.registry.getSingleMetric('queue_depth')).toBeDefined();
    expect(metrics.registry.getSingleMetric('realtime_connections')).toBeDefined();
    expect(metrics.registry.getSingleMetric('submission_verdict_seconds')).toBeDefined();
    expect(text).toContain('http_request_duration_seconds');
  });

  it('enregistre une durée de requête avec des labels bornés', async () => {
    const metrics = new MetricsService();
    metrics.observeHttp('GET', '/api/v1/challenges/{id}', 200, 0.042);

    const text = await metrics.render();
    expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*method="GET"/);
    expect(text).toMatch(/route="\/api\/v1\/challenges\/{id}"/);
  });

  it('enregistre la profondeur de file et les connexions temps réel', async () => {
    const metrics = new MetricsService();
    metrics.setQueueDepth('submissions', 12);
    metrics.setRealtimeConnections(7);
    metrics.observeVerdict('passed', 1.25);

    const text = await metrics.render();
    expect(text).toMatch(/queue_depth\{[^}]*queue="submissions"\} 12/);
    expect(text).toMatch(/realtime_connections 7/);
    expect(text).toMatch(/submission_verdict_seconds_count\{[^}]*verdict="passed"\} 1/);
  });
});
