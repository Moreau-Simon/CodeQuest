/*
 * SC-003/SC-004 — navigation anonyme et catalogue sous charge.
 *
 *   k6 run infra/load/browse.js
 *   BASE_URL=http://127.0.0.1:8080 k6 run infra/load/browse.js
 *
 * La cible est le reverse proxy nginx (port 8080 en local, comme pour ZAP).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 1000 },
    { duration: '1m', target: 0 }
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01']
  }
};

const ROUTES = ['/', '/challenges', '/lore', '/events', '/leaderboards', '/api/v1/challenges'];

export default function browse() {
  for (const route of ROUTES) {
    const response = http.get(`${BASE_URL}${route}`, { tags: { route } });
    check(response, {
      'réponse 2xx': (candidate) => candidate.status >= 200 && candidate.status < 300
    });
  }
  sleep(1);
}
