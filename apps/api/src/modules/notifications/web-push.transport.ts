import { Injectable } from '@nestjs/common';
import webpush from 'web-push';
import { env } from '../../config/env';
import type { PushMessage, PushSubscriptionRecord, PushTransport } from './push.transport';

/**
 * Transport Web Push réel (T244). Sans clés VAPID configurées, les appels sont
 * silencieusement ignorés : le développement et les tests restent autonomes.
 */
@Injectable()
export class WebPushTransport implements PushTransport {
  async send(subscription: PushSubscriptionRecord, message: PushMessage): Promise<void> {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;

    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(message)
    );
  }
}
