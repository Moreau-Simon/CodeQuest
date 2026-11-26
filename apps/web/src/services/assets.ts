import { api } from './api-client';

export type AssetKind = 'steganography' | 'qr_code';
export type AssetSubjectType = 'player' | 'team';

export interface AssetQrStyle {
  fragments?: number;
  rotationDeg?: number;
  noiseLevel?: number;
  overlay?: boolean;
}

export interface AssetSubject {
  type: AssetSubjectType;
  id: string;
}

export interface GenerateAssetInput {
  challengeId: string;
  challengeVersion: number;
  kind: AssetKind;
  subject: AssetSubject;
  payload?: string;
  qrStyle?: AssetQrStyle;
}

/** Vue publique d'un asset : jamais la graine, ni le message attendu. */
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

export interface AssetVerification {
  correct: boolean;
  partial: { matchedFragments: number; totalFragments: number };
  reason: string | null;
  elapsedMs: number;
}

export function generateAsset(input: GenerateAssetInput): Promise<AssetView> {
  return api.post<AssetView>('/assets/generate', input);
}

export function verifyAsset(
  input: GenerateAssetInput,
  answer: { text?: string; assetId?: string }
): Promise<AssetVerification> {
  return api.post<AssetVerification>('/assets/verify', { ...input, answer });
}
