-- US11 — économie non convertible, registre immuable et boutique (FR-072 à FR-077).

CREATE TYPE "transaction_reason" AS ENUM ('challenge_reward', 'record_bonus', 'event_reward', 'boss_reward', 'badge', 'achievement', 'streak', 'hint_purchase', 'potion_purchase', 'cosmetic_purchase', 'admin_adjustment', 'refund');
CREATE TYPE "shop_item_kind" AS ENUM ('hint', 'potion', 'avatar', 'title', 'editor_theme', 'early_access');

CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallets_user_id_key" UNIQUE ("user_id"),
    CONSTRAINT "wallets_balance_check" CHECK ("balance" >= 0)
);

CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "transaction_reason" NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transactions_idempotency_key_key" UNIQUE ("idempotency_key"),
    CONSTRAINT "transactions_balance_after_check" CHECK ("balance_after" >= 0)
);

CREATE TABLE "shop_items" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "shop_item_kind" NOT NULL,
    "price_bits" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "available_from" TIMESTAMPTZ(6),
    "available_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shop_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shop_items_sku_key" UNIQUE ("sku"),
    CONSTRAINT "shop_items_price_bits_check" CHECK ("price_bits" >= 0)
);

CREATE TABLE "inventory" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "shop_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "acquired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_user_id_shop_item_id_key" UNIQUE ("user_id", "shop_item_id"),
    CONSTRAINT "inventory_quantity_check" CHECK ("quantity" >= 0)
);

CREATE TABLE "challenge_hints" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "price_bits" INTEGER NOT NULL,
    CONSTRAINT "challenge_hints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "challenge_hints_challenge_id_order_key" UNIQUE ("challenge_id", "order"),
    CONSTRAINT "challenge_hints_price_bits_check" CHECK ("price_bits" >= 0)
);

CREATE TABLE "hint_purchases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "hint_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "purchased_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hint_purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hint_purchases_user_id_hint_id_key" UNIQUE ("user_id", "hint_id")
);

CREATE TABLE "badges" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "badges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "badges_key_key" UNIQUE ("key")
);

CREATE TABLE "user_badges" (
    "user_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "awarded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("user_id", "badge_id")
);

CREATE INDEX "transactions_wallet_id_created_at_idx" ON "transactions"("wallet_id", "created_at");
CREATE INDEX "shop_items_kind_is_active_idx" ON "shop_items"("kind", "is_active");
CREATE INDEX "inventory_user_id_idx" ON "inventory"("user_id");
CREATE INDEX "challenge_hints_challenge_id_order_idx" ON "challenge_hints"("challenge_id", "order");
CREATE INDEX "hint_purchases_user_id_challenge_id_idx" ON "hint_purchases"("user_id", "challenge_id");
CREATE INDEX "user_badges_badge_id_idx" ON "user_badges"("badge_id");

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_fkey"
    FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_shop_item_id_fkey"
    FOREIGN KEY ("shop_item_id") REFERENCES "shop_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "challenge_hints" ADD CONSTRAINT "challenge_hints_challenge_id_fkey"
    FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hint_purchases" ADD CONSTRAINT "hint_purchases_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hint_purchases" ADD CONSTRAINT "hint_purchases_challenge_id_fkey"
    FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hint_purchases" ADD CONSTRAINT "hint_purchases_hint_id_fkey"
    FOREIGN KEY ("hint_id") REFERENCES "challenge_hints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hint_purchases" ADD CONSTRAINT "hint_purchases_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_fkey"
    FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FR-073 : le registre est inaltérable, y compris pour un administrateur SQL.
CREATE OR REPLACE FUNCTION "transactions_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transactions est append-only : % interdit', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transactions_no_update"
  BEFORE UPDATE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION "transactions_append_only"();

CREATE TRIGGER "transactions_no_delete"
  BEFORE DELETE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION "transactions_append_only"();
