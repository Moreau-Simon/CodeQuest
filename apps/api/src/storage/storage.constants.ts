export const STORAGE_CLIENT = Symbol('STORAGE_CLIENT');
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface StorageHealth {
  checkHealth(): Promise<void>;
}
