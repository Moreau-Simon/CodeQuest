import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function hostFor(request: Record<string, unknown> = {}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ requestId: 'req-1', ...request })
    })
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter({ error: jest.fn(), warn: jest.fn() } as never);

  it("conserve l'enveloppe { code, message, details } du contrat", () => {
    const { host, status, json } = hostFor();
    filter.catch(
      new HttpException(
        { code: 'CHALLENGE_LOCKED', message: 'Défi verrouillé', details: { level: 3 } },
        403
      ),
      host
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      code: 'CHALLENGE_LOCKED',
      message: 'Défi verrouillé',
      details: { level: 3, requestId: 'req-1' }
    });
  });

  it('normalise une exception métier sans code', () => {
    const { host, json } = hostFor();
    filter.catch(new ForbiddenException('Accès refusé'), host);
    expect(json).toHaveBeenCalledWith({
      code: 'FORBIDDEN',
      message: 'Accès refusé',
      details: { requestId: 'req-1' }
    });
  });

  it('convertit les erreurs de validation en VALIDATION_ERROR', () => {
    const { host, status, json } = hostFor();
    filter.catch(
      new BadRequestException({ message: ['email invalide', 'mot de passe trop court'] }),
      host
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: 'Requête invalide',
      details: { requestId: 'req-1', errors: ['email invalide', 'mot de passe trop court'] }
    });
  });

  it("ne divulgue pas les détails d'une erreur interne", () => {
    const { host, status, json } = hostFor();
    filter.catch(new Error('mot de passe base de données'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'Une erreur interne est survenue',
      details: { requestId: 'req-1' }
    });
  });
});
