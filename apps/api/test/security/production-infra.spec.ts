import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

/** T252–T259, T261 [US17] : configuration d'exploitation et de sécurité. */
const ROOT = resolve(__dirname, '../../../..');

function read(relativePath: string): string {
  expect(existsSync(resolve(ROOT, relativePath))).toBe(true);
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function yaml(relativePath: string): Record<string, unknown> {
  return parse(read(relativePath)) as Record<string, unknown>;
}

describe('Infrastructure de production (T252–T259 / US17)', () => {
  it('durcit tous les conteneurs de production (T253 / FR-118)', () => {
    const compose = yaml('infra/docker-compose.prod.yml');
    const services = compose.services as Record<string, Record<string, unknown>>;

    for (const name of ['api', 'web', 'runner', 'assets', 'postgres', 'redis']) {
      const service = services[name];
      expect({ name, service }).toEqual({ name, service: expect.any(Object) });
      expect({ name, readOnly: service?.read_only }).toEqual({ name, readOnly: true });
      expect({ name, capDrop: service?.cap_drop }).toEqual({
        name,
        capDrop: expect.arrayContaining(['ALL'])
      });
      expect({ name, healthcheck: service?.healthcheck }).toEqual({
        name,
        healthcheck: expect.any(Object)
      });
      expect(service?.restart).toBe('unless-stopped');
    }

    const webBuild = services.web?.build as { args?: Record<string, string> } | undefined;
    expect(webBuild?.args?.NGINX_CONF).toBe('infra/nginx/web.prod.conf');
    const postgresEnv = services.postgres?.environment as Record<string, unknown> | undefined;
    expect(postgresEnv).toEqual(
      expect.objectContaining({ POSTGRES_PASSWORD_FILE: '/run/secrets/postgres_password' })
    );
    // L'image postgres officielle ne prend pas en charge POSTGRES_USER_FILE.
    expect(Object.keys(postgresEnv ?? {})).not.toContain('POSTGRES_USER_FILE');

    expect(services.web?.user).toBe('nginx:nginx');
    expect(services.api?.user).toBe('api:api');
    expect(services.api?.environment).toEqual(
      expect.objectContaining({ SESSION_SECRET_FILE: '/run/secrets/session_secret' })
    );
    expect(compose.secrets).toBeDefined();
    expect(compose.networks).toHaveProperty('frontend');
    expect(compose.networks).toHaveProperty('backend');
    expect(compose.networks).toHaveProperty('metrics');
  });

  it('exécute Gitleaks en CI et valide la configuration au démarrage (T254 / FR-111)', () => {
    const workflow = read('.github/workflows/security.yml');
    expect(workflow).toContain('gitleaks');
    expect(workflow).toContain('gitleaks/gitleaks-action');

    const apiEnv = read('apps/api/src/config/env.ts');
    expect(apiEnv).toContain('assertProductionEnvironment');
    expect(read('services/runner/src/config.ts')).toContain('NODE_ENV');

    // Le service assets doit échouer sur une clé de dev en production.
    const assetsConfig = read('services/assets/app/config.py');
    expect(assetsConfig).toContain('ASSETS_SEED_KEY');
    expect(assetsConfig).toContain('ValueError');
  });

  it('scrape l’API, les files et les services avec des dashboards (T257 / FR-116)', () => {
    const prometheus = yaml('infra/prometheus/prometheus.yml');
    const scrapeConfigs = (prometheus.scrape_configs as Array<{ job_name: string }>).map(
      ({ job_name }) => job_name
    );
    expect(scrapeConfigs).toEqual(
      expect.arrayContaining(['api', 'runner', 'postgres', 'redis', 'backup-verify'])
    );

    const dashboard = JSON.parse(read('infra/grafana/codequest-dashboard.json')) as {
      title: string;
      panels: Array<{ title: string; targets: Array<{ expr: string }> }>;
    };
    expect(dashboard.title).toContain('CodeQuest');
    const expressions = dashboard.panels.flatMap((panel) =>
      panel.targets.map((target) => target.expr)
    );
    expect(expressions.join(' ')).toContain('http_request_duration_seconds');
    expect(expressions.join(' ')).toContain('queue_depth');
    expect(expressions.join(' ')).toContain('realtime_connections');
  });

  it('alerte sur une file bloquée, le taux 5xx et un échec de sauvegarde (T258 / SC-013)', () => {
    const alerts = yaml('infra/prometheus/alerts.yml');
    const groups = alerts.groups as Array<{ rules: Array<{ alert: string; expr: string; for: string }> }>;
    const rules = groups.flatMap((group) => group.rules);
    const byName = new Map(rules.map((rule) => [rule.alert, rule]));

    expect(byName.get('QueueBlocked')?.for).toBe('2m');
    expect(byName.get('HighServerErrorRate')?.expr).toContain('5m');
    expect(byName.get('BackupFailed')?.expr).toMatch(/backup|restore/i);
    expect(read('apps/api/src/ops/verify-integrity.ts')).toContain('PUSHGATEWAY_URL');
  });

  it('prévoit la sauvegarde quotidienne et la vérification de restauration (T259 / SC-014)', () => {
    const workflow = read('.github/workflows/backup-verify.yml');
    expect(workflow).toContain('schedule');
    expect(workflow).toContain('ops:verify-integrity');

    const backup = read('infra/backup/backup.sh');
    const restore = read('infra/backup/restore.sh');
    expect(backup).toContain('pg_dump');
    expect(restore).toContain('pg_restore');
    expect(restore).toContain('verify-integrity');
  });

  it('documente des commandes S12–S14 réellement disponibles (T261)', () => {
    const quickstart = read('specs/001-codequest-platform/quickstart.md');
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

    for (const section of ['S12', 'S13', 'S14']) {
      expect(quickstart).toContain(section);
    }
    for (const script of ['test:a11y', 'test:browsers', 'security:zap', 'ops:backup', 'ops:restore', 'ops:verify-integrity']) {
      expect(Object.keys(scripts)).toContain(script);
    }
  });
});
