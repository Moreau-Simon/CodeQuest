import { createTestApp, tokenFromLink, type TestApp } from '../helpers/app';
import { expectValidResponse } from '../helpers/contract';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { uuidv7 } from '../../src/common/uuid';
import type { InstanceService } from '../../src/modules/challenges/instance.service';

/**
 * T207 [P] [US13] Atelier inverse (FR-043) : Alice cache un message, Bob le
 * retrouve via le relais authentifié. Le service d'assets est simulé au niveau
 * `fetch` : le contrat Python est couvert par ses propres tests pytest.
 */
describe('atelier inverse — stéganographie (T207)', () => {
  const password = 'correct-horse-battery-staple';
  const message = 'MESSAGE-CACHE-PAR-ALICE';
  const challengeId = uuidv7();
  const stored = new Map<string, string>();

  let infra: TestInfrastructure;
  let api: TestApp;
  let instance: InstanceService;
  let aliceId: string;
  let assetId: string;
  let generatedAsset: Record<string, unknown>;

  const assetsFetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      challengeId: string;
      challengeVersion: number;
      kind: string;
      subject: { type: 'player'; id: string };
      parameters?: { payload?: string };
      answer?: { assetId?: string; text?: string };
    };
    const seed = instance.deriveSeed(
      body.challengeId,
      'player',
      body.subject.id,
      body.challengeVersion
    );
    const fingerprint = seed.subarray(0, 8).toString('hex');

    if (_url.endsWith('/generate')) {
      const assetId = `asset-${body.subject.id}`;
      stored.set(assetId, body.parameters?.payload ?? '');
      return new Response(
        JSON.stringify({
          assetId,
          seedFingerprint: fingerprint,
          objectKey: `assets/steganography/${body.challengeId}/${fingerprint}.png`,
          url: `https://minio.internal/assets/${assetId}?X-Amz-Expires=900`,
          sha256: 'sha256',
          width: 800,
          height: 600,
          bytes: 1024,
          generatedAt: '2030-01-01T00:00:00Z',
          cached: false
        }),
        { status: 200 }
      );
    }

    const expected = stored.get(body.answer?.assetId ?? '');
    const correct = expected === body.answer?.text;
    return new Response(
      JSON.stringify({
        correct,
        partial: { matchedFragments: correct ? 1 : 0, totalFragments: 1 },
        reason: correct ? null : 'payload_mismatch',
        elapsedMs: 1
      }),
      { status: 200 }
    );
  }) as unknown as typeof fetch;

  async function registerAndLogin(email: string, pseudonym: string): Promise<string> {
    await api.anonymous.post('/api/v1/auth/register').send({ email, pseudonym, password });
    const mail = await api.waitForEmail('confirmation', (candidate) => candidate.to === email);
    const token = tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '');
    await api.anonymous.post('/api/v1/auth/verify-email').send({ token });
    await api.agent.post('/api/v1/auth/login').send({ identifier: email, password });
    const me = await api.agent.get('/api/v1/me');
    return me.body.id as string;
  }

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra, { assetsFetch });
    const { InstanceService } = await import('../../src/modules/challenges/instance.service');
    instance = new InstanceService();
    aliceId = await registerAndLogin('inverse.alice@example.com', 'alice-inverse');
    const generated = await api.agent.post('/api/v1/assets/generate').send({
      challengeId,
      challengeVersion: 1,
      kind: 'steganography',
      subject: { type: 'player', id: aliceId },
      payload: message
    });
    assetId = generated.body.assetId as string;
    generatedAsset = generated.body as Record<string, unknown>;
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    await infra?.stop();
  });

  it('permet à Alice de cacher un message sans exposer la graine ni le payload', () => {
    expect(generatedAsset).toMatchObject({
      seedFingerprint: expect.any(String),
      objectKey: expect.stringContaining('assets/steganography/'),
      cached: false
    });
    expect(generatedAsset.url).toBe(`/api/v1/assets/${assetId}/content`);
    const body = JSON.stringify(generatedAsset);
    expect(body).not.toContain(message);
    expect(body).not.toContain('test-assets-seed-key');
    expect(body).not.toMatch(/[0-9a-f]{32,}/i);
    expectValidResponse({ method: 'post', path: '/assets/generate' }, 201, generatedAsset);
  });

  it('donne à Bob une URL courte qui redirige vers l’asset signé', async () => {
    await registerAndLogin('inverse.bob@example.com', 'bob-inverse');
    const redirect = await api.agent.get(`/api/v1/assets/${assetId}/content`);

    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toContain('X-Amz-Expires=900');
    expect(redirect.headers.location).not.toContain('test-assets-seed-key');
  });

  it('permet à Bob de retrouver le message d’Alice et refuse une mauvaise réponse', async () => {
    const good = await api.agent.post('/api/v1/assets/verify').send({
      challengeId,
      challengeVersion: 1,
      kind: 'steganography',
      subject: { type: 'player', id: aliceId },
      answer: { assetId, text: message }
    });
    const bad = await api.agent.post('/api/v1/assets/verify').send({
      challengeId,
      challengeVersion: 1,
      kind: 'steganography',
      subject: { type: 'player', id: aliceId },
      answer: { assetId, text: 'mauvais message' }
    });

    expect(good.status).toBe(200);
    expect(good.body.correct).toBe(true);
    expectValidResponse({ method: 'post', path: '/assets/verify' }, 200, good.body);
    expect(bad.status).toBe(200);
    expect(bad.body.correct).toBe(false);
    expect(bad.body.reason).toBe('payload_mismatch');
    expect(JSON.stringify(bad.body)).not.toContain(message);
  });
});
