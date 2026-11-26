import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
import { env } from '../../config/env';
import { ASSETS_FETCH, InstanceService, type InstanceSubjectType } from './instance.service';

export type AssetKind = 'steganography' | 'qr_code';

export interface AssetQrStyle {
  fragments?: number;
  rotationDeg?: number;
  noiseLevel?: number;
  overlay?: boolean;
}

export interface GenerateAssetInput {
  challengeId: string;
  challengeVersion: number;
  kind: AssetKind;
  subjectType: InstanceSubjectType;
  subjectId: string;
  payload?: string;
  qrStyle?: AssetQrStyle;
}

export interface AssetView {
  assetId: string;
  seedFingerprint: string;
  objectKey: string;
  url: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  generatedAt: string;
  cached: boolean;
}

export interface AssetVerificationView {
  correct: boolean;
  partial: { matchedFragments: number; totalFragments: number };
  reason: string | null;
  elapsedMs: number;
}

type FetchLike = typeof globalThis.fetch;

const MAX_SIGNED_URLS = 500;
const SIGNED_URL_TTL_MS = 900_000;

/**
 * Relais authentifié vers le service d'assets (T214, FR-041/FR-043).
 *
 * L'API calcule l'empreinte de graine pour détecter une dérive de clé, puis
 * remplace l'URL signée MinIO par une URL courte : la graine et l'URL interne ne
 * sont jamais exposées au navigateur.
 */
@Injectable()
export class AssetProxyService {
  private readonly logger = new Logger(AssetProxyService.name);
  private readonly signedUrls = new Map<string, { url: string; expiresAt: number }>();

  constructor(
    private readonly instances: InstanceService,
    @Optional()
    @Inject(ASSETS_FETCH)
    private readonly fetchImpl: FetchLike = globalThis.fetch
  ) {}

  async generate(input: GenerateAssetInput): Promise<AssetView> {
    const seed = this.instances.deriveSeed(
      input.challengeId,
      input.subjectType,
      input.subjectId,
      input.challengeVersion
    );
    const expectedFingerprint = this.instances.fingerprint(seed);

    let response: Response;
    try {
      response = await this.fetchImpl(`${env.ASSETS_SERVICE_URL}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: input.challengeId,
          challengeVersion: input.challengeVersion,
          kind: input.kind,
          subject: { type: input.subjectType, id: input.subjectId },
          parameters: {
            payload: input.payload ?? '',
            ...(input.kind === 'qr_code' ? { qrStyle: input.qrStyle ?? {} } : {})
          }
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

    if (!response.ok) await this.throwAssetError(response);
    const asset = (await response.json()) as Omit<AssetView, 'url'> & { url: string };
    if (asset.seedFingerprint !== expectedFingerprint) {
      this.logger.error('Empreinte de graine incohérente avec le service assets');
      throw new ServiceUnavailableException({
        code: 'ASSETS_SEED_MISMATCH',
        message: 'Asset incohérent'
      });
    }

    this.signedUrls.set(asset.assetId, {
      url: asset.url,
      expiresAt: Date.now() + SIGNED_URL_TTL_MS
    });
    if (this.signedUrls.size > MAX_SIGNED_URLS) {
      const oldest = this.signedUrls.keys().next().value;
      if (oldest) this.signedUrls.delete(oldest);
    }

    return {
      assetId: asset.assetId,
      seedFingerprint: asset.seedFingerprint,
      objectKey: asset.objectKey,
      url: `/api/v1/assets/${asset.assetId}/content`,
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
      generatedAt: asset.generatedAt,
      cached: asset.cached
    };
  }

  async verify(
    input: GenerateAssetInput,
    answer: { text?: string; assetId?: string }
  ): Promise<AssetVerificationView> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${env.ASSETS_SERVICE_URL}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: input.challengeId,
          challengeVersion: input.challengeVersion,
          kind: input.kind,
          subject: { type: input.subjectType, id: input.subjectId },
          answer
        }),
        signal: AbortSignal.timeout(3_000)
      });
    } catch (error) {
      this.logger.warn('Service assets indisponible', error as Error);
      throw new ServiceUnavailableException({
        code: 'ASSETS_UNAVAILABLE',
        message: 'Le service de vérification d’assets est indisponible'
      });
    }

    if (!response.ok) await this.throwAssetError(response);
    return (await response.json()) as AssetVerificationView;
  }

  signedUrl(assetId: string): string {
    const entry = this.signedUrls.get(assetId);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.signedUrls.delete(assetId);
      throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Asset inconnu' });
    }
    return entry.url;
  }

  private async throwAssetError(response: Response): Promise<never> {
    const status = response.status;
    if (status === 429) {
      const body = (await response.json().catch(() => ({}))) as { retryAfterMs?: number };
      throw new HttpException(
        {
          code: 'ASSET_RATE_LIMITED',
          message: 'Trop de vérifications',
          details: { retryAfterMs: body.retryAfterMs }
        },
        429
      );
    }
    if (status === 400 || status === 404) {
      throw new BadRequestException({
        code: 'ASSET_INVALID_REQUEST',
        message: 'Requête asset invalide'
      });
    }
    if (status === 409) {
      throw new ConflictException({ code: 'ASSET_CONFLICT', message: 'Conflit d’asset' });
    }
    if (status === 422) {
      throw new UnprocessableEntityException({
        code: 'ASSET_PAYLOAD_TOO_LARGE',
        message: 'Payload impossible à encoder'
      });
    }
    throw new ServiceUnavailableException({
      code: 'ASSETS_UNAVAILABLE',
      message: 'Le service d’assets est indisponible'
    });
  }
}
