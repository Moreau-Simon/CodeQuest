import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { contractValidator } from '../helpers/contract';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedTheme } from '../helpers/leaderboard';

/**
 * T119 [P] [US5] Tests de contrat `/challenges` et `/challenges/{id}` conformes à `contracts/openapi.yaml`.
 * - Catalogue filtré avec pagination et statuts
 * - Détail d'un défi disponible
 * - Refus 403 motivé si défi verrouillé (prérequis non satisfaits)
 * - Code 404 si défi inexistant
 */
describe('contrat /challenges/* (T119)', () => {
  const validator = contractValidator();
  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;

  let themeSlug: string;
  let availableChallengeId: string;
  let lockedChallengeId: string;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    const theme = await seedTheme(prisma, 'contrat-catalogue');
    themeSlug = theme.slug;

    // Défi 1 : disponible sans prérequis
    const ch1 = await seedChallenge(prisma, theme.id, 'Défi Libre');
    availableChallengeId = ch1.id;

    // Défi 2 : verrouillé car exige niveau 5
    const ch2 = await seedChallenge(prisma, theme.id, 'Défi Verrouillé');
    lockedChallengeId = ch2.id;
    await prisma.challengePrerequisite.create({
      data: {
        id: uuidv7(),
        challengeId: lockedChallengeId,
        requiredLevel: 5
      }
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  function expectContract(
    operation: { method: 'get'; path: string },
    status: number,
    body: unknown
  ): void {
    const result = validator.validateResponse(operation, status, body);
    if (!result.valid) throw new Error(result.errors.join('\n'));
  }

  describe('GET /api/v1/challenges', () => {
    it('renvoie la liste paginée des défis conformes au schéma', async () => {
      const response = await api.anonymous.get('/api/v1/challenges');
      expect(response.status).toBe(200);
      expectContract({ method: 'get', path: '/challenges' }, 200, response.body);

      const items = response.body.items as Array<{
        id: string;
        status: string;
        missingPrerequisites?: string[];
        difficulty: number;
      }>;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThanOrEqual(2);

      const item1 = items.find((i) => i.id === availableChallengeId);
      expect(item1).toBeDefined();
      expect(item1?.status).toBe('available');

      const item2 = items.find((i) => i.id === lockedChallengeId);
      expect(item2).toBeDefined();
      expect(item2?.status).toBe('locked');
      expect(item2?.missingPrerequisites).toBeDefined();
      expect(item2?.missingPrerequisites?.length).toBeGreaterThan(0);
    });

    it('permet de filtrer par thématique et difficulté', async () => {
      const response = await api.anonymous
        .get('/api/v1/challenges')
        .query({ theme: themeSlug, difficulty: 2 });

      expect(response.status).toBe(200);
      expectContract({ method: 'get', path: '/challenges' }, 200, response.body);
      const items = response.body.items as Array<{ difficulty: number }>;
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.every((i) => i.difficulty === 2)).toBe(true);
    });

    it('permet de filtrer par statut (ex: locked)', async () => {
      const response = await api.anonymous.get('/api/v1/challenges').query({ status: 'locked' });

      expect(response.status).toBe(200);
      expectContract({ method: 'get', path: '/challenges' }, 200, response.body);
      const items = response.body.items as Array<{ status: string }>;
      expect(items.every((i) => i.status === 'locked')).toBe(true);
    });
  });

  describe('GET /api/v1/challenges/{challengeId}', () => {
    it('renvoie le détail complet d’un défi disponible (200)', async () => {
      const response = await api.anonymous.get(`/api/v1/challenges/${availableChallengeId}`);
      expect(response.status).toBe(200);
      expectContract({ method: 'get', path: '/challenges/{challengeId}' }, 200, response.body);

      expect(response.body.id).toBe(availableChallengeId);
      expect(response.body.status).toBe('available');
      expect(response.body.statement).toBeDefined();
      expect(response.body.languages).toBeDefined();
      expect(response.body.missingPrerequisites).toEqual([]);
    });

    it('renvoie 403 Forbidden avec motif précis si le défi est verrouillé', async () => {
      const response = await api.anonymous.get(`/api/v1/challenges/${lockedChallengeId}`);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CHALLENGE_LOCKED');
      expect(response.body.missingPrerequisites).toBeDefined();
      expect(response.body.missingPrerequisites.length).toBeGreaterThan(0);
    });

    it('renvoie 404 si le défi n’existe pas', async () => {
      const missingId = uuidv7();
      const response = await api.anonymous.get(`/api/v1/challenges/${missingId}`);
      expect(response.status).toBe(404);
    });
  });
});
