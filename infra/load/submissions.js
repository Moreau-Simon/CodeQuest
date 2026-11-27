/*
 * SC-002/SC-004 — 100 soumissions acceptées par minute.
 *
 *   AUTH_TOKEN=<access-token> CHALLENGE_ID=<uuid> k6 run infra/load/submissions.js
 *
 * Le verdict est asynchrone : la mesure porte sur l'acceptation HTTP (202),
 * pas sur le temps de traitement par le runner (SC-002, < 10 s, suivi côté API).
 */
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const CHALLENGE_ID = __ENV.CHALLENGE_ID || '00000000-0000-7000-8000-000000000000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  scenarios: {
    submissions: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1m',
      duration: '5m',
      preAllocatedVUs: 20,
      maxVUs: 60
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01']
  }
};

export default function submit() {
  const response = http.post(
    `${BASE_URL}/api/v1/challenges/${CHALLENGE_ID}/submissions`,
    JSON.stringify({
      language: 'python',
      code: 'def solution(valeurs):\n    return sorted(valeurs)\n'
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUTH_TOKEN}`,
        'Idempotency-Key': `load-${__VU}-${__ITER}`
      },
      tags: { route: 'submissions' }
    }
  );
  check(response, {
    'soumission acceptée (202)': (candidate) => candidate.status === 202
  });
}
