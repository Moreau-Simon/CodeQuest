import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { tokenFromLink, type TestApp } from './app';

export interface TestPlayer {
  id: string;
  pseudonym: string;
  agent: TestAgent;
}

export interface TeamMemberView {
  userId: string;
  pseudonym: string;
  role: 'captain' | 'member';
  joinedAt: string;
}

export interface TeamView {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  captainId: string;
  members: TeamMemberView[];
  createdAt: string;
  disbandedAt: string | null;
}

/** Crée un joueur confirmé, authentifié, avec son propre agent HTTP. */
export async function createTestPlayer(
  api: TestApp,
  prisma: PrismaClient,
  pseudonym: string
): Promise<TestPlayer> {
  const email = `${pseudonym}@example.com`;
  const password = 'correct-horse-battery-staple';

  await api.anonymous.post('/api/v1/auth/register').send({ email, pseudonym, password });
  const mail = await api.waitForEmail('confirmation', (message) => message.to === email);
  const token = tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '');
  await api.anonymous.post('/api/v1/auth/verify-email').send({ token });

  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true }
  });
  const server = api.app.getHttpServer() as Parameters<typeof request.agent>[0];
  const agent = request.agent(server);
  const login = await agent.post('/api/v1/auth/login').send({ identifier: email, password });
  expect(login.status).toBe(200);

  return { id: user.id, pseudonym, agent };
}

/** Crée une équipe via l'API et renvoie sa représentation complète. */
export async function createTeam(
  captain: TestAgent,
  name: string,
  tag: string
): Promise<TeamView> {
  const response = await captain.post('/api/v1/teams').send({ name, tag });
  expect(response.status).toBe(201);
  return response.body as TeamView;
}

/** Crée une invitation (lien nu ou nominative) et renvoie son jeton. */
export async function createInvitation(
  captain: TestAgent,
  teamId: string,
  pseudonym?: string
): Promise<string> {
  const response = await captain
    .post(`/api/v1/teams/${teamId}/invitations`)
    .send(pseudonym ? { pseudonym } : {});
  expect(response.status).toBe(201);
  return response.body.token as string;
}
