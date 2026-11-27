import type { Page, Route } from '@playwright/test';

export const USER_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01';
export const TEAM_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b02';
export const CHALLENGE_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b03';
export const LESSON_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b10';
export const EVENT_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b11';

const profile = {
  id: USER_ID,
  pseudonym: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  level: 1,
  xp: 0,
  avatarUrl: null,
  preferredLanguage: 'python',
  preferences: { sound: { master: true, music: true, effects: true, voice: true } },
  badges: []
};

const lessonSummary = {
  id: LESSON_ID,
  theme: 'Bases',
  title: 'Variables et types',
  order: 1,
  estimatedMinutes: 5,
  status: 'not_started',
  positioningTestAvailable: false,
  applicationChallenge: null,
  progress: { status: 'not_started', quizScore: null, completedAt: null }
};

const challengeSummary = {
  id: CHALLENGE_ID,
  title: 'Trier une liste',
  theme: 'Algorithmique',
  type: 'sorting',
  difficulty: 2,
  status: 'available',
  bestScore: null,
  missingPrerequisites: []
};

const challengeDetail = {
  ...challengeSummary,
  statement: 'Triez la liste fournie.',
  languages: ['python'],
  basePoints: 200,
  perfMax: 80,
  currentVersion: 1,
  hints: [],
  missingPrerequisites: []
};

const event = {
  id: EVENT_ID,
  title: 'La grande chasse',
  timezone: 'Europe/Paris',
  startsAt: '2031-06-03T09:00:00.000Z',
  endsAt: '2031-06-03T18:00:00.000Z',
  status: 'open',
  type: 'standard',
  maxAttempts: 1,
  challengeIds: [CHALLENGE_ID],
  joined: true,
  attemptConsumed: false,
  serverNow: '2031-06-03T10:00:00.000Z'
};

function teamView(id = TEAM_ID, name = 'Byte Me', tag = 'BYTE') {
  return {
    id,
    name,
    tag,
    description: 'Équipe de test E2E',
    logoKey: null,
    captainId: USER_ID,
    members: [{ userId: USER_ID, pseudonym: 'ada', role: 'captain', joinedAt: event.startsAt }],
    createdAt: event.startsAt,
    disbandedAt: null
  };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function envelope(code: string, message: string): Record<string, unknown> {
  return { code, message };
}

/**
 * Stub réseau stateful des parcours critiques (T274–T277). Aucun backend ni
 * navigateur distant n'est nécessaire : les mutations de l'interface sont
 * validées par les réponses et par l'état ensuite restitué au client.
 *
 * Les règles métier réelles (unicité de l'essai, réauthentification, accès
 * par jeton) restent couvertes par les suites d'intégration API.
 */
export async function installJourneyStub(page: Page): Promise<void> {
  const state = {
    sessionDeleted: false,
    lessonCompleted: false,
    quizPassed: false,
    eventAttemptConsumed: false,
    teams: [teamView()],
    officialSubmission: null as Record<string, unknown> | null
  };

  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, '');
    const method = request.method();

    if (path === '/me') {
      if (method === 'DELETE') {
        state.sessionDeleted = true;
        state.teams = [];
        return json(route, 204, {});
      }
      if (state.sessionDeleted) {
        return json(route, 401, envelope('UNAUTHENTICATED', 'Session invalide'));
      }
      return json(route, 200, profile);
    }
    if (path === '/me/export') {
      return json(route, 200, {
        profile,
        scores: [
          {
            challengeId: CHALLENGE_ID,
            score: 420,
            displayName: state.sessionDeleted ? 'Joueur anonyme' : profile.pseudonym
          }
        ]
      });
    }
    if (path === '/auth/register') return json(route, 201, {});
    if (path === '/auth/verify-email') return json(route, 204, {});
    if (path === '/auth/login') return json(route, 200, {});
    if (path === '/auth/logout') return json(route, 204, {});
    if (path === '/auth/forgot-password') return json(route, 204, {});
    if (path === '/auth/reset-password') return json(route, 204, {});

    if (path === '/lessons') {
      return json(route, 200, [
        {
          ...lessonSummary,
          status: state.lessonCompleted ? 'completed' : 'not_started',
          progress: state.lessonCompleted
            ? { status: 'completed', quizScore: 100, completedAt: event.startsAt }
            : lessonSummary.progress
        }
      ]);
    }
    if (path === `/lessons/${LESSON_ID}`) {
      return json(route, 200, {
        ...lessonSummary,
        contentMd: '# Variables\n\nChoisissez la bonne réponse.',
        status: state.lessonCompleted ? 'completed' : 'not_started',
        progress: state.lessonCompleted
          ? { status: 'completed', quizScore: 100, completedAt: event.startsAt }
          : { status: 'not_started', quizScore: null, completedAt: null },
        quiz: {
          passScore: 100,
          questions: [
            {
              id: 'q1',
              prompt: 'Quel mot-clé déclare une variable en Python ?',
              choices: ['const', 'var', 'aucun de ces mots-clés']
            }
          ]
        }
      });
    }
    if (/^\/lessons\/[^/]+\/(start|quiz|complete|positioning)$/.test(path)) {
      if (path.endsWith('/quiz')) {
        state.quizPassed = true;
        return json(route, 200, { score: 100, correct: 1, total: 1, passed: true });
      }
      if (path.endsWith('/complete')) {
        state.lessonCompleted = true;
        return json(route, 200, {
          lessonId: LESSON_ID,
          status: 'completed',
          quizScore: 100,
          completedAt: event.startsAt,
          xp: 100,
          level: 2,
          applicationChallenge: { id: CHALLENGE_ID, title: challengeDetail.title }
        });
      }
      return json(route, 200, { status: 'in_progress', quizScore: null, completedAt: null });
    }

    if (path === '/challenges') {
      return json(route, 200, { items: [challengeSummary], nextCursor: null });
    }
    if (path === `/challenges/${CHALLENGE_ID}`) return json(route, 200, challengeDetail);
    if (/^\/challenges\/[^/]+\/submissions$/.test(path) && method === 'POST') {
      return json(route, 201, {
        id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b04',
        challengeId: CHALLENGE_ID,
        status: 'pending',
        createdAt: event.startsAt
      });
    }
    if (/^\/submissions\/[^/]+$/.test(path)) {
      return json(route, 200, {
        id: path.split('/').pop(),
        challengeId: CHALLENGE_ID,
        status: 'passed',
        score: 420,
        testsPassed: 10,
        testsTotal: 10,
        cpuTimeMedianMs: 12,
        verdictReason: null,
        createdAt: event.startsAt
      });
    }

    if (path.startsWith('/leaderboards/players')) {
      return json(route, 200, {
        scope: 'global',
        scopeId: '',
        period: 'all',
        subjectType: 'player',
        items: [
          {
            rank: 1,
            subjectId: USER_ID,
            displayName: state.sessionDeleted ? 'Joueur anonyme' : profile.pseudonym,
            score: 420,
            achievedAt: event.startsAt
          }
        ],
        nextCursor: null,
        self: {
          rank: 1,
          subjectId: USER_ID,
          displayName: state.sessionDeleted ? 'Joueur anonyme' : profile.pseudonym,
          score: 420,
          achievedAt: event.startsAt
        }
      });
    }
    if (path.startsWith('/leaderboards/teams')) {
      return json(route, 200, {
        scope: 'global',
        scopeId: '',
        period: 'all',
        subjectType: 'team',
        items: [
          {
            rank: 1,
            subjectId: TEAM_ID,
            displayName: state.teams[0]?.name ?? 'Byte Me',
            score: 1260,
            achievedAt: event.startsAt
          }
        ],
        nextCursor: null,
        self: null
      });
    }

    if (path === '/events') {
      return json(route, 200, [{ ...event, attemptConsumed: state.eventAttemptConsumed }]);
    }
    if (path === `/events/${EVENT_ID}/join`) {
      return json(route, 200, { eventId: EVENT_ID, userId: USER_ID, joinedAt: event.startsAt });
    }
    if (path === `/events/${EVENT_ID}/start`) {
      if (state.eventAttemptConsumed) {
        return json(
          route,
          409,
          envelope('ATTEMPT_ALREADY_CONSUMED', 'Votre unique essai est déjà consommé.')
        );
      }
      state.eventAttemptConsumed = true;
      return json(route, 201, {
        id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b05',
        eventId: EVENT_ID,
        startedAt: event.startsAt
      });
    }

    if (path === '/teams') {
      if (method === 'POST') {
        const body = (await request.postDataJSON()) as { name?: string; tag?: string };
        const created = teamView('018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b06', body.name, body.tag);
        state.teams = [...state.teams, created];
        return json(route, 201, created);
      }
      return json(route, 200, state.teams);
    }
    const teamMatch = /^\/teams\/([^/]+)(\/.*)?$/.exec(path);
    if (teamMatch) {
      const teamId = teamMatch[1]!;
      const suffix = teamMatch[2] ?? '';
      if (suffix === '/contributions') {
        return json(route, 200, [
          {
            teamId,
            userId: USER_ID,
            keptLines: 12,
            successes: 3,
            assistance: 0,
            coefficient: 1,
            score: 420
          }
        ]);
      }
      if (suffix === '/invitations') {
        const token = 'jeton-invitation-e2e';
        return json(route, 201, {
          token,
          inviteUrl: `/teams/join?teamId=${encodeURIComponent(teamId)}&token=${encodeURIComponent(token)}`,
          teamId,
          expiresAt: event.startsAt
        });
      }
      if (suffix === '/members' && method === 'POST') {
        const team = state.teams.find((candidate) => candidate.id === teamId) ?? teamView(teamId);
        return json(route, 200, team);
      }
      if (suffix === '/official-submission') {
        const body = (await request.postDataJSON()) as {
          challengeId?: string;
          submissionId?: string;
        };
        state.officialSubmission = {
          id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b07',
          teamId,
          challengeId: body.challengeId ?? CHALLENGE_ID,
          submissionId: body.submissionId ?? '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b04',
          designatedBy: USER_ID,
          designatedAt: event.startsAt
        };
        return json(route, 200, state.officialSubmission);
      }
      if (suffix === '') {
        const team = state.teams.find((candidate) => candidate.id === teamId);
        return team
          ? json(route, 200, team)
          : json(route, 404, envelope('TEAM_NOT_FOUND', 'Équipe introuvable'));
      }
    }

    if (/\/(lore|bosses|channels|notifications)(\/|$)/.test(path)) {
      return json(route, 200, []);
    }
    return method === 'GET' ? json(route, 200, {}) : json(route, 201, {});
  });
}
