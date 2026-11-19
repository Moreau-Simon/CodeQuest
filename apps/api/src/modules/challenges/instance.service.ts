import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { env } from '../../config/env';

export type InstanceSubjectType = 'player' | 'team';

/** Instance publique d'un défi de décryptage : jamais la graine ni l'attendu. */
export interface DecryptionInstanceView {
  assetId: string;
  seedFingerprint: string;
  objectKey: string;
  ciphertext: string;
  sha256: string;
  cached: boolean;
}

export interface GenerateInstanceInput {
  challengeId: string;
  challengeVersion: number;
  subjectType: InstanceSubjectType;
  subjectId: string;
  cipher: string;
}

type FetchLike = typeof globalThis.fetch;

/** Jeton d'injection optionnel : permet de remplacer `fetch` dans les tests. */
export const ASSETS_FETCH = Symbol('ASSETS_FETCH');

/**
 * Génération d'instance par graine (T145, FR-040, FR-041).
 *
 * La graine est un HMAC-SHA256 calculé côté API avec la même clé secrète que
 * le service assets : elle est unique au `(défi, version, sujet)` et n'est
 * jamais transmise au client. Le service d'assets produit le chiffré ; l'API
 * vérifie l'empreinte renvoyée pour détecter toute dérive de configuration.
 */
@Injectable()
export class InstanceService {
  private readonly logger = new Logger(InstanceService.name);

  // `FetchLike` est un alias de type fonction : sans @Inject explicite, Nest
  // lit `Function` dans design:paramtypes et ne peut pas résoudre l'instance.
  constructor(
    @Optional()
    @Inject(ASSETS_FETCH)
    private readonly fetchImpl: FetchLike = globalThis.fetch
  ) {}

  deriveSeed(
    challengeId: string,
    subjectType: InstanceSubjectType,
    subjectId: string,
    version: number
  ): Buffer {
    return createHmac('sha256', this.seedKey())
      .update(`${challengeId}|${subjectType}|${subjectId}|${version}`)
      .digest();
  }

  fingerprint(seed: Buffer): string {
    return seed.subarray(0, 8).toString('hex');
  }

  async generate(input: GenerateInstanceInput): Promise<DecryptionInstanceView> {
    const seed = this.deriveSeed(
      input.challengeId,
      input.subjectType,
      input.subjectId,
      input.challengeVersion
    );

    let response: Response;
    try {
      response = await this.fetchImpl(`${env.ASSETS_SERVICE_URL}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: input.challengeId,
          challengeVersion: input.challengeVersion,
          kind: 'decryption_image',
          subject: { type: input.subjectType, id: input.subjectId },
          parameters: { cipher: input.cipher }
        }),
        signal: AbortSignal.timeout(3_000)
      });
    } catch (error) {
      this.logger.warn('Service assets indisponible', error as Error);
      throw new ServiceUnavailableException({
        code: 'ASSETS_UNAVAILABLE',
        message: 'Le service de génération d’assets est indisponible'
      });
    }

    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'ASSETS_UNAVAILABLE',
        message: 'Le service de génération d’assets a refusé la requête'
      });
    }

    const instance = (await response.json()) as DecryptionInstanceView;
    if (instance.seedFingerprint !== this.fingerprint(seed)) {
      // Une divergence signale deux clés HMAC différentes : on ne renvoie
      // surtout pas une instance dont la réponse attendue serait incohérente.
      this.logger.error('Empreinte de graine incohérente avec le service assets');
      throw new ServiceUnavailableException({
        code: 'ASSETS_SEED_MISMATCH',
        message: 'Instance de défi incohérente'
      });
    }

    return {
      assetId: instance.assetId,
      seedFingerprint: instance.seedFingerprint,
      objectKey: instance.objectKey,
      ciphertext: instance.ciphertext,
      sha256: instance.sha256,
      cached: instance.cached
    };
  }

  /** Vérifie une réponse via le service assets, sans jamais renvoyer l'attendu. */
  async verify(input: GenerateInstanceInput, answer: string): Promise<boolean> {
    const response = await this.fetchImpl(`${env.ASSETS_SERVICE_URL}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: input.challengeId,
        challengeVersion: input.challengeVersion,
        kind: 'decryption_image',
        subject: { type: input.subjectType, id: input.subjectId },
        answer: { text: answer }
      }),
      signal: AbortSignal.timeout(3_000)
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { correct?: boolean };
    return result.correct === true;
  }

  private seedKey(): Buffer {
    const raw = env.ASSETS_SEED_KEY;
    return /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'utf8');
  }
}
