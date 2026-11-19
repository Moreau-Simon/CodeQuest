import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('erreur simulée', {
    code,
    clientVersion: 'test',
    meta
  });
}

describe('PrismaService', () => {
  const service = new PrismaService();

  afterAll(async () => {
    await service.$disconnect();
  });

  it('reconnaît une violation de contrainte unique (P2002)', () => {
    const error = prismaError('P2002', { target: ['email'] });
    expect(service.isUniqueConstraintError(error)).toBe(true);
    expect(service.uniqueConstraintTarget(error)).toEqual(['email']);
  });

  it('ne confond pas les autres erreurs Prisma avec P2002', () => {
    const error = prismaError('P2025');
    expect(service.isUniqueConstraintError(error)).toBe(false);
    expect(service.uniqueConstraintTarget(error)).toEqual([]);
  });

  it('ignore les erreurs non Prisma', () => {
    expect(service.isUniqueConstraintError(new Error('boom'))).toBe(false);
    expect(service.isUniqueConstraintError(null)).toBe(false);
  });
});
