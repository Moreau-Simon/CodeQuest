import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { ShopItem, TransactionReason } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { HintPolicy } from './hint.policy';
import { idempotencyKeyFor } from './ledger.math';
import { LedgerService, toView, type TransactionView } from './ledger.service';

export interface ShopItemView {
  id: string;
  sku: string;
  name: string;
  kind: ShopItem['kind'];
  priceBits: number;
  available: boolean;
  metadata: Record<string, unknown>;
}

export interface PurchaseView {
  itemId: string;
  sku: string;
  priceBits: number;
  balance: number;
  quantity: number;
}

export interface PurchaseInput {
  readonly teamId?: string;
}

const PURCHASE_REASONS: Record<ShopItem['kind'], TransactionReason> = {
  hint: 'hint_purchase',
  potion: 'potion_purchase',
  avatar: 'cosmetic_purchase',
  title: 'cosmetic_purchase',
  editor_theme: 'cosmetic_purchase',
  early_access: 'cosmetic_purchase'
};

/** Catalogue, achat idempotent et inventaire (T192, FR-074/FR-076). */
@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ledger: LedgerService,
    private readonly hints: HintPolicy
  ) {}

  async list(): Promise<ShopItemView[]> {
    const items = await this.prisma.shopItem.findMany({
      where: { isActive: true },
      orderBy: { sku: 'asc' }
    });
    const now = this.clock.now();
    return items.map((item) => ({ ...this.toView(item), available: this.isAvailable(item, now) }));
  }

  async purchase(
    itemId: string,
    user: AuthenticatedUser,
    idempotencyKey: string | undefined,
    input: PurchaseInput
  ): Promise<PurchaseView> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'L’en-tête Idempotency-Key est obligatoire'
      });
    }
    const item = await this.prisma.shopItem.findUnique({ where: { id: itemId } });
    if (!item || !this.isAvailable(item, this.clock.now())) {
      throw new NotFoundException({
        code: 'SHOP_ITEM_UNAVAILABLE',
        message: 'Objet indisponible dans la boutique'
      });
    }

    const key = idempotencyKeyFor('purchase', idempotencyKey);
    const replay = await this.prisma.transaction.findUnique({ where: { idempotencyKey: key } });
    if (replay) {
      const inventory = await this.prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: user.id, shopItemId: item.id } },
        select: { quantity: true }
      });
      return this.toPurchaseView(item, toView(replay), inventory?.quantity ?? 0);
    }

    let hintId: string | undefined;
    if (item.kind === 'hint') {
      const metadata = item.metadata as Record<string, unknown>;
      if (typeof metadata.hintId !== 'string') {
        throw new ConflictException({
          code: 'SHOP_ITEM_MISCONFIGURED',
          message: 'L’indice associé à cet objet est introuvable'
        });
      }
      hintId = metadata.hintId;
      await this.hints.assertAllowed(user, hintId, input.teamId);
    }

    const transaction = await this.ledger.debit({
      userId: user.id,
      amount: item.priceBits,
      reason: PURCHASE_REASONS[item.kind],
      idempotencyKey,
      referenceType: 'shop_item',
      referenceId: item.id,
      createdBy: user.id
    });

    const inventory = await this.prisma.inventory.upsert({
      where: { userId_shopItemId: { userId: user.id, shopItemId: item.id } },
      create: {
        id: uuidv7(),
        userId: user.id,
        shopItemId: item.id,
        quantity: 1,
        equipped: false
      },
      update: { quantity: { increment: 1 } },
      select: { quantity: true }
    });

    if (hintId) {
      const created = await this.prisma.hintPurchase.createMany({
        data: [
          {
            id: uuidv7(),
            userId: user.id,
            challengeId: (
              await this.prisma.challengeHint.findUniqueOrThrow({
                where: { id: hintId },
                select: { challengeId: true }
              })
            ).challengeId,
            hintId,
            transactionId: transaction.id
          }
        ],
        skipDuplicates: true
      });
      if (created.count === 0) {
        // Concurrence : un autre achat du même indice vient de gagner.
        throw new ConflictException({
          code: 'HINT_ALREADY_PURCHASED',
          message: 'Cet indice a déjà été acheté'
        });
      }
    }

    return this.toPurchaseView(item, transaction, inventory.quantity);
  }

  /** Équipe un objet cosmétique : aucun score ni performance n'est modifié. */
  async equip(itemId: string, userId: string): Promise<{ itemId: string; equipped: boolean }> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { userId_shopItemId: { userId, shopItemId: itemId } },
      select: { id: true, shopItem: { select: { kind: true } } }
    });
    if (!inventory || inventory.shopItem.kind === 'hint') {
      throw new NotFoundException({
        code: 'INVENTORY_ITEM_NOT_FOUND',
        message: 'Objet possédé introuvable'
      });
    }

    await this.prisma.$transaction([
      this.prisma.inventory.updateMany({
        where: { userId, shopItem: { kind: inventory.shopItem.kind } },
        data: { equipped: false }
      }),
      this.prisma.inventory.update({ where: { id: inventory.id }, data: { equipped: true } })
    ]);
    return { itemId, equipped: true };
  }

  private toView(item: ShopItem): ShopItemView {
    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      kind: item.kind,
      priceBits: item.priceBits,
      available: item.isActive,
      metadata:
        item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {}
    };
  }

  private isAvailable(item: ShopItem, now: Date): boolean {
    return (
      item.isActive &&
      (!item.availableFrom || item.availableFrom <= now) &&
      (!item.availableUntil || item.availableUntil >= now)
    );
  }

  private toPurchaseView(
    item: ShopItem,
    transaction: TransactionView,
    quantity: number
  ): PurchaseView {
    return {
      itemId: item.id,
      sku: item.sku,
      priceBits: item.priceBits,
      balance: transaction.balanceAfter,
      quantity
    };
  }
}
