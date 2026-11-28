import { ForbiddenException, Inject, Injectable, forwardRef, type OnModuleDestroy } from '@nestjs/common';
import * as Y from 'yjs';
import { uuidv7 } from '../common/uuid';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { documentRoom } from './realtime.constants';
import { RealtimeGateway } from './realtime.gateway';

export interface Cursor {
  line: number;
  ch: number;
}

export interface AwarenessClient {
  userId: string;
  cursor: Cursor;
}

export interface ApplyUpdateResult {
  ok: true;
  version: number;
  /** État complet encodé en base64 (Yjs accepte un état comme un delta). */
  update: string;
}

export interface DocumentSnapshot {
  state: string;
  version: number;
}

export interface AwarenessView {
  docId: string;
  clients: AwarenessClient[];
}

function documentKey(teamId: string, challengeId: string): string {
  return `${teamId}:${challengeId}`;
}

/**
 * Provider Yjs serveur (T160, FR-057) : un `Y.Doc` par équipe et par défi,
 * convergence des updates binaires, awareness éphémère (jamais persistée) et
 * persistance périodique du état encodé dans PostgreSQL.
 *
 * La table `collaborative_documents` est la source de vérité ; Redis sert
 * uniquement au transport temps réel via l'adaptateur Socket.IO. Le flush
 * remplace le blob d'état : c'est la compaction (aucun journal de deltas).
 */
@Injectable()
export class YjsProvider implements OnModuleDestroy {
  private readonly documents = new Map<string, Y.Doc>();
  private readonly versions = new Map<string, number>();
  private readonly dirty = new Set<string>();
  private readonly awareness = new Map<string, Map<string, AwarenessClient>>();
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly gateway: RealtimeGateway
  ) {
    this.timer = setInterval(() => {
      void this.flushAll();
    }, env.YJS_FLUSH_INTERVAL_MS);
    // Ne retient pas le processus (Jest, tests d'intégration, CLI).
    this.timer.unref();
  }

  /** Applique un update binaire (base64) et diffuse l'état résultant à la room. */
  async applyUpdate(
    teamId: string,
    challengeId: string,
    userId: string,
    updateBase64: string
  ): Promise<ApplyUpdateResult> {
    await this.assertMember(teamId, userId);

    const bytes = Buffer.from(updateBase64, 'base64');
    if (bytes.length > env.YJS_MAX_DOC_BYTES) {
      throw new ForbiddenException({
        code: 'DOC_TOO_LARGE',
        message: 'La mise à jour dépasse la taille maximale du document'
      });
    }

    const key = documentKey(teamId, challengeId);
    const current = this.documents.get(key);

    // Valide d'abord sur un candidat : un update trop volumineux ne doit
    // jamais corrompre l'état en mémoire (Yjs ne permet pas de désappliquer).
    const candidate = new Y.Doc();
    if (current) {
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(current));
    }
    Y.applyUpdate(candidate, new Uint8Array(bytes));
    if (Y.encodeStateAsUpdate(candidate).byteLength > env.YJS_MAX_DOC_BYTES) {
      throw new ForbiddenException({
        code: 'DOC_TOO_LARGE',
        message: 'Le document dépasse la taille maximale autorisée'
      });
    }

    // L'update est valide : il doit être appliqué au document *conservé*, pas
    // seulement au candidat, sinon les updates suivants repartiraient d'un état
    // périmé et la convergence échouerait après le deuxième client.
    const doc = this.getOrCreate(key);
    Y.applyUpdate(doc, new Uint8Array(bytes));
    const state = Y.encodeStateAsUpdate(doc);
    const version = (this.versions.get(key) ?? 0) + 1;
    this.versions.set(key, version);
    this.dirty.add(key);

    const encoded = Buffer.from(state).toString('base64');
    this.gateway.emitToRoom(documentRoom(teamId, challengeId), 'doc.update', {
      docId: key,
      update: encoded,
      origin: userId
    });

    return { ok: true, version, update: encoded };
  }

  /**
   * Snapshot courant (mémoire, puis base). `state` est encodé en base64 pour
   * respecter le contrat WebSocket (les deltas sont transportés en base64).
   */
  async snapshot(teamId: string, challengeId: string): Promise<DocumentSnapshot | null> {
    const key = documentKey(teamId, challengeId);
    const memory = this.documents.get(key);
    if (memory) {
      return {
        state: Buffer.from(Y.encodeStateAsUpdate(memory)).toString('base64'),
        version: this.versions.get(key) ?? 0
      };
    }

    const row = await this.prisma.collaborativeDocument.findUnique({
      where: { teamId_challengeId: { teamId, challengeId } },
      select: { state: true, version: true }
    });
    if (!row) return null;
    return { state: Buffer.from(row.state).toString('base64'), version: row.version };
  }

  /** Persiste tous les documents modifiés ; retourne leur nombre. */
  async flushAll(): Promise<number> {
    const keys = [...this.dirty];
    if (keys.length === 0) return 0;

    let flushed = 0;
    for (const key of keys) {
      const doc = this.documents.get(key);
      if (!doc) {
        this.dirty.delete(key);
        continue;
      }
      const [teamId, challengeId] = key.split(':');
      if (!teamId || !challengeId) {
        this.dirty.delete(key);
        continue;
      }
      const state = Buffer.from(Y.encodeStateAsUpdate(doc));
      const version = this.versions.get(key) ?? 0;
      await this.prisma.collaborativeDocument.upsert({
        where: { teamId_challengeId: { teamId, challengeId } },
        create: { id: uuidv7(), teamId, challengeId, state, version },
        update: { state, version }
      });
      this.dirty.delete(key);
      flushed += 1;
    }
    return flushed;
  }

  /** Met à jour la présence (curseur) et la diffuse sans jamais la persister. */
  setAwareness(
    teamId: string,
    challengeId: string,
    userId: string,
    cursor: Cursor
  ): AwarenessView {
    const key = documentKey(teamId, challengeId);
    let clients = this.awareness.get(key);
    if (!clients) {
      clients = new Map();
      this.awareness.set(key, clients);
    }
    clients.set(userId, { userId, cursor });

    const view = { docId: key, clients: [...clients.values()] };
    this.gateway.emitToRoom(documentRoom(teamId, challengeId), 'doc.awareness', view);
    return view;
  }

  /** Retire la présence d'un utilisateur (déconnexion). */
  clearAwareness(teamId: string, challengeId: string, userId: string): AwarenessView {
    const key = documentKey(teamId, challengeId);
    const clients = this.awareness.get(key);
    clients?.delete(userId);
    const view = { docId: key, clients: [...(clients?.values() ?? [])] };
    this.gateway.emitToRoom(documentRoom(teamId, challengeId), 'doc.awareness', view);
    return view;
  }

  /** Contrôle d'appartenance utilisé par les handlers Socket.IO du gateway. */
  async assertMembership(teamId: string, _challengeId: string, userId: string): Promise<void> {
    await this.assertMember(teamId, userId);
  }

  /** Flush avant que Prisma et Redis ne soient fermés. */
  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.flushAll();
  }

  private getOrCreate(key: string): Y.Doc {
    let doc = this.documents.get(key);
    if (!doc) {
      doc = new Y.Doc();
      this.documents.set(key, doc);
    }
    return doc;
  }

  private async assertMember(teamId: string, userId: string): Promise<void> {
    const member = await this.prisma.teamMember.findFirst({
      where: { teamId, userId, leftAt: null },
      select: { id: true }
    });
    if (!member) {
      throw new ForbiddenException({
        code: 'NOT_TEAM_MEMBER',
        message: 'Le joueur n’est plus membre de cette équipe'
      });
    }
  }
}
