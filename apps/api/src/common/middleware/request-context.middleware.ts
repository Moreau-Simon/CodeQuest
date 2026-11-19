import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { uuidv7 } from '../uuid';

export interface RequestContext {
  requestId: string;
  ipPrefix: string | null;
  userId?: string;
}

/** Contexte de requête accessible depuis les services (logs, audit). */
export const requestStore = new AsyncLocalStorage<RequestContext>();

const REQUEST_ID_PATTERN = /^[\w.:-]{1,128}$/;

/**
 * Réduit une adresse IP à un préfixe réseau (/24 en IPv4, /48 en IPv6) avant
 * toute persistance ou journalisation (minimisation RGPD, FR-113).
 */
export function ipPrefixOf(ip: string | undefined | null): string | null {
  if (!ip) return null;

  let address = ip.trim();
  if (!address) return null;
  if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1);
  const zoneIndex = address.indexOf('%');
  if (zoneIndex >= 0) address = address.slice(0, zoneIndex);

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return ipPrefixOf(mapped[1]);

  const version = isIP(address);
  if (version === 4) {
    const octets = address.split('.');
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }
  if (version !== 6) return null;

  const groups = expandIpv6(address);
  if (!groups) return null;
  const prefix = groups.slice(0, 3).map((group) => group.replace(/^0+/, '') || '0');
  return prefix.every((group) => group === '0') ? '::/48' : `${prefix.join(':')}::/48`;
}

function expandIpv6(address: string): string[] | null {
  let value = address.toLowerCase();

  // IPv4 intégrée (ex. ::ffff:203.0.113.42) → deux groupes hexadécimaux.
  const embedded = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (embedded) {
    const octets = embedded[1]!.split('.').map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    value = value.slice(0, embedded.index) + `${high}:${low}`;
  }

  const halves = value.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = halves.length === 2 ? 8 - head.length - tail.length : 0;

  if (halves.length === 2 ? groups < 0 : head.length !== 8) return null;
  if ([...head, ...tail].some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;

  return [...head, ...Array<string>(groups).fill('0'), ...tail];
}

/**
 * Middleware de corrélation : `requestId` (UUIDv7 ou en-tête amont validé),
 * préfixe IP, et contexte asynchrone pour les logs et l'audit (T039).
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : uuidv7();
    const ipPrefix = ipPrefixOf(req.ip ?? req.socket?.remoteAddress);

    req.requestId = requestId;
    req.ipPrefix = ipPrefix;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    requestStore.run({ requestId, ipPrefix, userId: req.user?.id }, () => next());
  }
}
