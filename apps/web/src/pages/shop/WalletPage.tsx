import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { getWallet } from '../../services/economy';

/** Historique signé du registre append-only (FR-076, SC-021). */
export function WalletPage(): JSX.Element {
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: ({ signal }) => getWallet(signal) });

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold">{t('wallet.title')}</h1>
        <p className="text-sm text-muted">{t('wallet.subtitle')}</p>
        <p className="mt-2 text-2xl font-semibold">
          {t('wallet.balance', { value: wallet.data?.balance ?? 0 })}
        </p>
      </header>

      {wallet.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : wallet.data?.recentTransactions?.length ? (
        <ul className="flex flex-col gap-2">
          {wallet.data.recentTransactions.map((transaction) => (
            <li
              key={transaction.id ?? transaction.createdAt}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3"
            >
              <div>
                <p className="font-semibold">
                  {t('wallet.amount', { value: transaction.amount ?? 0 })}
                </p>
                <p className="text-sm text-muted">{transaction.reason ?? ''}</p>
              </div>
              <time dateTime={transaction.createdAt} className="text-sm text-muted">
                {transaction.createdAt
                  ? new Date(transaction.createdAt).toLocaleString('fr-FR')
                  : t('wallet.unknownDate')}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('wallet.empty')}</p>
      )}
    </section>
  );
}
