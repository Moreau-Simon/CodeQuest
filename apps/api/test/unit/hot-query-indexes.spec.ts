import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T262 [P] — écrit avant l'implémentation (constitution IV).
 *
 * SC-003/SC-004 : les requêtes chaudes (catalogue trié, classement par
 * période, agrégation d'événement, liste admin) doivent être servies par des
 * index explicites, présents à la fois dans le schéma et dans une migration.
 */
const ROOT = join(__dirname, '..', '..');
const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const migrationsDir = join(ROOT, 'prisma', 'migrations');
const migrations = readdirSync(migrationsDir)
  .filter((name) => name !== 'migration_lock.toml')
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'))
  .join('\n');

function modelBlock(name: string): string {
  const match = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!match) throw new Error(`Modèle ${name} introuvable`);
  return match[1]!;
}

const EXPECTED: Array<{ model: string; index: string; sql: RegExp }> = [
  {
    model: 'Challenge',
    index: '@@index([status, difficulty, title, id])',
    sql: /CREATE INDEX [\s\S]*? ON "challenges" \("status", "difficulty", "title", "id"\)/i
  },
  {
    model: 'BestScore',
    index: '@@index([subjectType, achievedAt])',
    sql: /CREATE INDEX [\s\S]*? ON "best_scores" \("subject_type", "achieved_at"\)/i
  },
  {
    model: 'Submission',
    index: '@@index([eventId, teamId, challengeId, score(sort: Desc), createdAt(sort: Asc)])',
    sql: /CREATE INDEX [\s\S]*? ON "submissions" \("event_id", "team_id", "challenge_id", "score" DESC, "created_at" ASC\)/i
  },
  {
    model: 'User',
    index: '@@index([createdAt(sort: Desc)])',
    sql: /CREATE INDEX [\s\S]*? ON "users" \("created_at" DESC\)/i
  }
];

describe('Index des requêtes chaudes (T262)', () => {
  it.each(EXPECTED)('déclare $model.$index dans le schéma et la migration', ({ model, index, sql }) => {
    expect(modelBlock(model)).toContain(index);
    expect(migrations).toMatch(sql);
  });

  it('garde les index existants de meilleur score et de soumission', () => {
    expect(modelBlock('BestScore')).toContain('@@unique([challengeId, subjectType, subjectId])');
    expect(modelBlock('Submission')).toContain(
      '@@index([challengeId, score(sort: Desc), createdAt(sort: Asc)])'
    );
  });
});
