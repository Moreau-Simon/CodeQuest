import { ConsentService } from './consent.service';

/** T256 [US17] (FR-115) : consentement, export et effacement RGPD. */
function fakePrisma() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: ' joueur@example.fr ',
        pseudonym: 'Joueur',
        passwordHash: 'hash-prive',
        status: 'active',
        preferences: { locale: 'fr' },
        level: 4,
        xp: 120,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null
      }),
      update: jest.fn().mockResolvedValue({ id: 'user-1' })
    },
    consent: {
      upsert: jest.fn().mockResolvedValue({ id: 'consent-1' }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ purpose: 'analytics', granted: true, recordedAt: new Date() }])
    },
    session: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    passwordResetToken: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    pushSubscription: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    notification: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    submission: { findMany: jest.fn().mockResolvedValue([{ id: 'submission-1', score: 12 }]) },
    wallet: { findUnique: jest.fn().mockResolvedValue({ balance: 30 }) },
    transaction: { findMany: jest.fn().mockResolvedValue([{ amount: 30, reason: 'PURCHASE' }]) }
  };
}

describe('Consentement et RGPD (T256 / FR-115)', () => {
  it('enregistre un consentement explicite et daté', async () => {
    const prisma = fakePrisma();
    const service = new ConsentService(prisma);

    await service.recordConsent('user-1', 'analytics', true, 'profile');

    expect(prisma.consent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_purpose: { userId: 'user-1', purpose: 'analytics' } },
        create: expect.objectContaining({ granted: true })
      })
    );
  });

  it('exporte les données personnelles sans secrets ni jetons', async () => {
    const service = new ConsentService(fakePrisma());

    const exported = await service.exportData('user-1');
    const serialized = JSON.stringify(exported);

    expect(exported.profile).toEqual(
      expect.objectContaining({ pseudonym: 'Joueur', level: 4, xp: 120 })
    );
    expect(exported.consents).toHaveLength(1);
    expect(exported.submissions).toHaveLength(1);
    expect(serialized).not.toContain('hash-prive');
    expect(serialized).not.toContain('refreshTokenHash');
  });

  it('rectifie le profil sans toucher aux données de jeu', async () => {
    const prisma = fakePrisma();
    const service = new ConsentService(prisma);

    await service.rectify('user-1', { pseudonym: 'NouveauPseudo' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pseudonym: 'NouveauPseudo' }
    });
  });

  it('anonymise le compte et supprime les données personnelles en conservant les scores', async () => {
    const prisma = fakePrisma();
    const service = new ConsentService(prisma);

    await service.erase('user-1');

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        pseudonym: expect.stringContaining('anonyme-'),
        email: expect.stringMatching(/@example\.invalid$/),
        status: 'deleted',
        deletedAt: expect.any(Date)
      })
    );
    expect(data.passwordHash).not.toBe('hash-prive');
    expect(prisma.session.deleteMany).toHaveBeenCalled();
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalled();
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalled();
    expect(prisma.notification.deleteMany).toHaveBeenCalled();
    expect(prisma.submission.findMany).not.toHaveBeenCalled();
  });
});
