/*
 * SC-005 — 500 connexions Socket.IO simultanées sans perte d'événement.
 *
 *   AUTH_TOKEN=<access-token> k6 run infra/load/realtime.js
 *
 * Le handshake est volontairement simple : il valide la capacité du gateway
 * à accepter 500 sessions. La réception des événements est vérifiée par les
 * suites E2E/intégration (contrat `websocket-events.md`).
 */
import ws from 'k6/ws';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const WS_URL = `${BASE_URL.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;

export const options = {
  vus: 500,
  duration: '30s',
  thresholds: {
    ws_connecting: ['p(95)<1000'],
    ws_session_duration: ['p(95)>25000']
  }
};

export default function realtime() {
  const response = ws.connect(
    WS_URL,
    { headers: { Authorization: `Bearer ${__ENV.AUTH_TOKEN || ''}` } },
    (socket) => {
      socket.on('open', () => socket.send('40'));
      socket.on('message', () => undefined);
      socket.setTimeout(() => socket.close(), 30000);
      sleep(25);
    }
  );
  check(response, { 'connexion Socket.IO ouverte': (candidate) => candidate && candidate.status === 101 });
}
