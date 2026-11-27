/** Transport Web Push injectable (T244 / FR-104). */

export const PUSH_TRANSPORT = Symbol('PUSH_TRANSPORT');

export interface PushKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: PushKeys;
}

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushTransport {
  send(subscription: PushSubscriptionRecord, message: PushMessage): Promise<void>;
}
