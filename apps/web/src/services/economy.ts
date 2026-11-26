import type { components } from './api-types';
import { api } from './api-client';

export type ShopItem = components['schemas']['ShopItem'];
export type Wallet = components['schemas']['Wallet'];
export type PurchaseResult = components['schemas']['PurchaseResult'];

/** US11 (FR-072 à FR-077) : portefeuille, boutique et indices. */
export function getWallet(signal?: AbortSignal): Promise<Wallet> {
  return api.get<Wallet>('/me/wallet', { signal });
}

export function getShopItems(signal?: AbortSignal): Promise<ShopItem[]> {
  return api.get<ShopItem[]>('/shop', { signal });
}

export function purchaseItem(
  itemId: string,
  idempotencyKey: string,
  input: { teamId?: string } = {},
  signal?: AbortSignal
): Promise<PurchaseResult> {
  return api.post<PurchaseResult>(`/shop/${encodeURIComponent(itemId)}/purchase`, input, {
    idempotencyKey,
    signal
  });
}

export function equipCosmetic(itemId: string): Promise<{ itemId: string; equipped: boolean }> {
  return api.post(`/me/inventory/${encodeURIComponent(itemId)}/equip`, {});
}
