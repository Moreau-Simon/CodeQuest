import { contractValidator, loadOpenApi } from './helpers/contract';

describe('validateur de contrat OpenAPI (T042)', () => {
  const validator = contractValidator();

  it('charge le contrat de la plateforme', () => {
    const document = loadOpenApi();
    expect(document.openapi).toBe('3.0.3');
    expect(validator.paths.length).toBeGreaterThanOrEqual(42);
    expect(validator.paths).toEqual(
      expect.arrayContaining(['/auth/register', '/me', '/challenges'])
    );
  });

  it('accepte un profil conforme', () => {
    const result = validator.validateResponse({ method: 'get', path: '/me' }, 200, {
      id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01',
      pseudonym: 'ada',
      email: 'ada@example.com',
      emailVerified: true,
      level: 3,
      xp: 250,
      avatarUrl: null,
      preferredLanguage: 'python',
      preferences: {},
      badges: ['first-blood']
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('refuse un profil non conforme (e-mail invalide, langue inconnue)', () => {
    const result = validator.validateResponse({ method: 'get', path: '/me' }, 200, {
      id: 'pas-un-uuid',
      email: 'nope',
      preferredLanguage: 'ruby'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/format|enum/);
  });

  it("accepte l'enveloppe d'erreur normalisée", () => {
    const result = validator.validateResponse({ method: 'post', path: '/auth/register' }, 401, {
      code: 'UNAUTHORIZED',
      message: 'Authentification requise'
    });
    expect(result.valid).toBe(true);
  });

  it('refuse une erreur sans code (enveloppe { code, message, details })', () => {
    const result = validator.validateResponse({ method: 'post', path: '/auth/register' }, 400, {
      message: 'Requête invalide'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/code/);
  });

  it('valide les corps de requête déclarés', () => {
    expect(
      validator.validateRequestBody(
        { method: 'post', path: '/auth/register' },
        { email: 'ada@example.com', pseudonym: 'ada', password: 'mot-de-passe-solide' }
      ).valid
    ).toBe(true);

    const invalid = validator.validateRequestBody(
      { method: 'post', path: '/auth/register' },
      { email: 'pas-un-email', pseudonym: 'a', password: 'court' }
    );
    expect(invalid.valid).toBe(false);
  });

  it('accepte une réponse sans corps (204)', () => {
    expect(
      validator.validateResponse({ method: 'delete', path: '/me/sessions' }, 204, undefined)
    ).toEqual({ valid: true, errors: [] });
  });
});
