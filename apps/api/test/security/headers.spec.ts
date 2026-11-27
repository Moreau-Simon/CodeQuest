import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cookieSecurityOptions } from '../../src/modules/auth/session.cookies';
import { buildSecurityHeaders } from '../../src/common/security/headers';

/** T249 [P] [US17] (FR-108, FR-112) : en-têtes stricts et cookies sécurisés. */
const ROOT = resolve(__dirname, '../../../..');

function nginxConfig(name = 'web.conf'): string {
  return readFileSync(resolve(ROOT, 'infra/nginx', name), 'utf8');
}

describe('En-têtes de sécurité (T249 / FR-108, FR-112)', () => {
  it('active HSTS sur un an avec sous-domaines en production uniquement', () => {
    const production = buildSecurityHeaders('production');
    const development = buildSecurityHeaders('development');

    expect(production.hsts).toEqual({ maxAge: 31_536_000, includeSubDomains: true, preload: true });
    expect(development.hsts).toBe(false);
  });

  it('applique une CSP stricte sans inline en production', () => {
    const directives = buildSecurityHeaders('production').contentSecurityPolicy?.directives;

    expect(directives?.defaultSrc).toEqual(["'self'"]);
    expect(directives?.scriptSrc).toEqual(["'self'"]);
    expect(directives?.objectSrc).toEqual(["'none'"]);
    expect(directives?.frameAncestors).toEqual(["'none'"]);
    expect(directives?.scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('refuse le framing et le MIME sniffing et restreint les origines', () => {
    const headers = buildSecurityHeaders('production');

    expect(headers.frameguard).toEqual({ action: 'deny' });
    expect(headers.noSniff).toBe(true);
    expect(headers.referrerPolicy).toEqual({ policy: 'no-referrer' });
    expect(headers.crossOriginResourcePolicy).toEqual({ policy: 'same-site' });
    expect(headers.crossOriginEmbedderPolicy).toBe(false);
  });

  it('pose des cookies HTTP-only, Secure en production et limités au même site', () => {
    expect(cookieSecurityOptions({ secure: true, domain: undefined })).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      domain: undefined
    });
    expect(cookieSecurityOptions({ secure: false, domain: 'localhost' }).domain).toBeUndefined();
    expect(cookieSecurityOptions({ secure: true, domain: 'codequest.fr' }).domain).toBe(
      'codequest.fr'
    );
  });

  it('redirige le HTTP vers HTTPS et durcit nginx en production (TLS 1.2+, HSTS, CSP)', () => {
    const config = nginxConfig('web.prod.conf');

    expect(config).toMatch(/listen\s+80;/);
    expect(config).toMatch(/return\s+301\s+https:\/\/\$host\$request_uri;/);
    expect(config).toMatch(/ssl_protocols\s+TLSv1\.2\s+TLSv1\.3;/);
    expect(config).toMatch(/Strict-Transport-Security[^;]+max-age=31536000/);
    expect(config).toMatch(/Content-Security-Policy/);
    expect(config).toMatch(/X-Content-Type-Options\s+"nosniff"/);
  });

  it('conserve nginx en HTTP sur 8080 pour le développement et les E2E', () => {
    expect(nginxConfig()).toMatch(/listen\s+8080;/);
    expect(nginxConfig()).not.toMatch(/ssl_protocols/);
  });
});
