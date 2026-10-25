import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Layers3, Plus, WalletCards } from 'lucide-react';
import { api } from '../lib/api';
import { formatChips, useApiErrorMessage } from '../lib/format';
import type { ChipCase } from '../lib/types';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui';

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 text-center sm:text-left">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-cream-400">
        {label}
      </div>
      <div className="tabular mt-0.5 text-lg font-bold text-cream-50">{value}</div>
    </div>
  );
}

export function ChipCasesPage() {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const [showArchived, setShowArchived] = useState(false);
  const query = useQuery({
    queryKey: ['chip-cases'],
    queryFn: () => api.get<{ chipCases: ChipCase[] }>('/api/chip-cases'),
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) {
    return (
      <ErrorState
        description={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const chipCases = query.data?.chipCases ?? [];
  const archivedCount = chipCases.filter((chipCase) => chipCase.archived).length;
  const visible = showArchived ? chipCases : chipCases.filter((chipCase) => !chipCase.archived);

  const totalChips = chipCases.reduce(
    (total, chipCase) =>
      total + chipCase.chipTypes.reduce((sum, type) => sum + type.quantity, 0),
    0,
  );
  const totalValue = chipCases.reduce(
    (total, chipCase) =>
      total +
      chipCase.chipTypes.reduce((sum, type) => sum + type.value * type.quantity, 0),
    0,
  );
  const totalFree = chipCases.reduce(
    (total, chipCase) =>
      total +
      chipCase.chipTypes.reduce(
        (sum, type) => sum + (type.freeQuantity ?? type.quantity),
        0,
      ),
    0,
  );
  const reserved = Math.max(0, totalChips - totalFree);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('chipCase.title')}
        title={t('chipCase.title')}
        description={t('chipCase.subtitle')}
        actions={
          <Link to="/mallettes/nouvelle" className="btn-primary">
            <Plus className="size-4" aria-hidden />
            {t('chipCase.new')}
          </Link>
        }
      />

      {chipCases.length === 0 ? (
        <EmptyState
          icon={<Layers3 className="size-6" aria-hidden />}
          title={t('chipCase.empty')}
          description="Déclarez vos valeurs de jetons et vos quantités : Pokero calcule ensuite les caves au jeton près et suit le stock réservé."
          action={
            <Link to="/mallettes/nouvelle" className="btn-primary">
              <Plus className="size-4" aria-hidden />
              {t('chipCase.new')}
            </Link>
          }
        />
      ) : (
        <>
          <div className="card grid grid-cols-2 divide-x divide-white/[0.06] overflow-hidden p-0 sm:grid-cols-4">
            <StatBlock label="Mallettes" value={String(chipCases.length)} />
            <StatBlock label="Jetons physiques" value={formatChips(totalChips)} />
            <StatBlock label="Valeur totale" value={formatChips(totalValue)} />
            <StatBlock
              label={reserved > 0 ? 'Réservés' : 'Stock libre'}
              value={formatChips(reserved > 0 ? reserved : totalFree)}
            />
          </div>

          {archivedCount > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-cream-400">
                {showArchived ? 'Toutes les mallettes' : 'Mallettes actives'}
              </p>
              <button
                type="button"
                onClick={() => setShowArchived((value) => !value)}
                className="text-xs font-semibold text-gold-400 hover:text-gold-300"
              >
                {showArchived ? 'Masquer les archives' : `Voir les archives (${archivedCount})`}
              </button>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((chipCase) => {
              const totalValueForCase = chipCase.chipTypes.reduce(
                (total, type) => total + type.value * type.quantity,
                0,
              );
              const totalChipsForCase = chipCase.chipTypes.reduce(
                (total, type) => total + type.quantity,
                0,
              );
              const freeChips = chipCase.chipTypes.reduce(
                (total, type) => total + (type.freeQuantity ?? type.quantity),
                0,
              );
              const reservedForCase = Math.max(0, totalChipsForCase - freeChips);
              const usedRatio =
                totalChipsForCase > 0 ? Math.min(1, reservedForCase / totalChipsForCase) : 0;

              return (
                <Link
                  key={chipCase.id}
                  to={`/mallettes/${chipCase.id}`}
                  className={`card group block p-5 transition-colors hover:border-gold-500/25 ${
                    chipCase.archived ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-display text-2xl text-cream-50">
                          {chipCase.name}
                        </h2>
                        {chipCase.archived ? <Badge>Archivée</Badge> : null}
                      </div>
                      {chipCase.description ? (
                        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-cream-400">
                          {chipCase.description}
                        </p>
                      ) : null}
                    </div>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.07] bg-white/[0.025] text-cream-400 transition-colors group-hover:border-gold-500/25 group-hover:text-gold-400">
                      <ArrowUpRight className="size-4" aria-hidden />
                    </span>
                  </div>

                  <div className="mt-4 flex h-9 items-center pl-1.5">
                    {chipCase.chipTypes.slice(0, 9).map((type, index) => (
                      <span
                        key={type.id}
                        title={`${type.label} · ${formatChips(type.value)}`}
                        className="chip-swatch -ml-2 size-9 first:ml-0"
                        style={{ backgroundColor: type.color, zIndex: 20 - index }}
                      />
                    ))}
                    {chipCase.chipTypes.length > 9 ? (
                      <span className="-ml-2 grid size-8 place-items-center rounded-full border border-white/10 bg-night-700 text-[9px] font-bold text-cream-300">
                        +{chipCase.chipTypes.length - 9}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {chipCase.chipTypes.slice(0, 6).map((type) => (
                      <span
                        key={type.id}
                        className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.025] py-0.5 pl-1 pr-2 text-[10.5px] text-cream-300"
                      >
                        <span
                          className="size-3.5 rounded-full border border-white/20"
                          style={{ backgroundColor: type.color }}
                          aria-hidden
                        />
                        <span className="tabular font-semibold">{formatChips(type.value)}</span>
                        <span className="tabular text-cream-500">×{formatChips(type.quantity)}</span>
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 border-t border-white/[0.06] pt-3">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-cream-400">
                        <strong className="tabular font-semibold text-cream-100">
                          {formatChips(freeChips)}
                        </strong>{' '}
                        jetons libres
                      </span>
                      <span className="tabular text-cream-500">
                        {formatChips(totalValueForCase)}
                      </span>
                    </div>
                    {reservedForCase > 0 ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                          <span
                            className="block h-full rounded-full bg-warning-400"
                            style={{ width: `${usedRatio * 100}%` }}
                          />
                        </span>
                        <span className="text-[10px] tabular text-warning-300">
                          {formatChips(reservedForCase)} réservés
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {chipCase.tournamentsCount > 0 ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-cream-500">
                      <WalletCards className="size-3" aria-hidden />
                      {t('chipCase.inUse', { count: chipCase.tournamentsCount })}
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-white/[0.08] px-4 py-10 text-center text-sm text-cream-400">
              Aucune mallette active.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
