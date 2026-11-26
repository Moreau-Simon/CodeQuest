import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Button, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import { getShopItems, getWallet, purchaseItem, type ShopItem } from '../../services/economy';
import { useSessionStore, selectIsAuthenticated } from '../../stores/session';

function purchaseError(error: unknown): string {
  if (!(error instanceof ApiError)) return t('shop.error.default');
  switch (error.code) {
    case 'INSUFFICIENT_BITS':
      return t('shop.error.INSUFFICIENT_BITS');
    case 'HINT_LOCKED':
      return t('shop.error.HINT_LOCKED');
    case 'HINT_SOLO_ONLY':
      return t('shop.error.HINT_SOLO_ONLY');
    case 'HINT_DURING_EVENT':
      return t('shop.error.HINT_DURING_EVENT');
    case 'HINT_DURING_BOSS':
      return t('shop.error.HINT_DURING_BOSS');
    case 'HINT_NOT_ALLOWED':
      return t('shop.error.HINT_NOT_ALLOWED');
    default:
      return t('shop.error.default');
  }
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ShopPage(): JSX.Element {
  const authenticated = useSessionStore(selectIsAuthenticated);
  const verified = useSessionStore((state) => state.user?.emailVerified === true);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: ({ signal }) => getWallet(signal),
    enabled: authenticated
  });
  const shopQuery = useQuery({
    queryKey: ['shop'],
    queryFn: ({ signal }) => getShopItems(signal),
    enabled: authenticated
  });

  const purchase = useMutation({
    mutationFn: (item: ShopItem) => purchaseItem(item.id ?? '', newIdempotencyKey()),
    onSuccess: async (result) => {
      setSelected(null);
      setError(null);
      setSuccess(t('shop.success'));
      await queryClient.invalidateQueries({ queryKey: ['wallet'] });
      await queryClient.invalidateQueries({ queryKey: ['shop'] });
      return result;
    },
    onError: (cause: unknown) => {
      setError(purchaseError(cause));
    }
  });

  if (!authenticated) return <section>{t('common.error')}</section>;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('shop.title')}</h1>
          <p className="text-sm text-muted">{t('shop.subtitle')}</p>
        </div>
        <p
          className="text-lg font-semibold"
          aria-label={t('shop.balance', { value: walletQuery.data?.balance ?? 0 })}
        >
          {t('shop.balance', { value: walletQuery.data?.balance ?? 0 })}
        </p>
      </header>

      {!verified && <p className="rounded-lg bg-elevated p-3 text-sm">{t('shop.verifyEmail')}</p>}
      {success && (
        <p role="status" className="rounded-lg bg-success p-3">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger p-3">
          {error}
        </p>
      )}

      {shopQuery.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : shopQuery.data?.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {shopQuery.data.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
            >
              <h2 className="text-lg font-semibold">{item.name}</h2>
              <p className="text-sm text-muted">
                {t('shop.balance', { value: item.priceBits ?? 0 })}
              </p>
              <Button
                type="button"
                disabled={!item.available || !verified}
                onClick={() => setSelected(item)}
              >
                {t('shop.buy')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('shop.empty')}</p>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={t('shop.confirmTitle')}
        description={
          selected
            ? t('shop.confirmBody', { name: selected.name ?? '', price: selected.priceBits ?? 0 })
            : undefined
        }
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSelected(null)}>
              {t('common.close')}
            </Button>
            <Button
              type="button"
              disabled={purchase.isPending}
              onClick={() => selected && purchase.mutate(selected)}
            >
              {t('shop.confirm')}
            </Button>
          </>
        }
      >
        <p>{selected ? t('shop.balance', { value: selected.priceBits ?? 0 }) : ''}</p>
      </Modal>
    </section>
  );
}
