import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layers3, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { formatChips } from '../lib/format';
import type { ChipCase } from '../lib/types';
import { Badge, Card, EmptyState, Spinner } from '../components/ui';

export function ChipCasesPage() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['chip-cases'],
    queryFn: () => api.get<{ chipCases: ChipCase[] }>('/api/chip-cases'),
  });

  if (query.isLoading) return <Spinner />;
  const chipCases = query.data?.chipCases ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-500/80">
            {t('chipCase.title')}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-cream-50">{t('chipCase.title')}</h1>
          <p className="mt-1.5 text-sm text-cream-300/70">{t('chipCase.subtitle')}</p>
        </div>
        <Link to="/mallettes/nouvelle" className="btn-primary">
          <Plus className="size-4" />
          {t('chipCase.new')}
        </Link>
      </header>

      {chipCases.length === 0 ? (
        <EmptyState
          icon={<Layers3 className="size-10" />}
          title={t('chipCase.empty')}
          description="Déclarez vos valeurs de jetons et vos quantités : Pokero calcule ensuite les caves au jeton près et suit le stock réservé."
          action={
            <Link to="/mallettes/nouvelle" className="btn-primary">
              <Plus className="size-4" />
              {t('chipCase.new')}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {chipCases.map((chipCase) => {
            const totalValue = chipCase.chipTypes.reduce(
              (total, type) => total + type.value * type.quantity,
              0,
            );
            const totalChips = chipCase.chipTypes.reduce((total, type) => total + type.quantity, 0);
            return (
              <Card key={chipCase.id} className="transition hover:border-gold-500/30">
                <Link to={`/mallettes/${chipCase.id}`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-cream-50">{chipCase.name}</h2>
                      {chipCase.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-cream-300/60">
                          {chipCase.description}
                        </p>
                      ) : null}
                    </div>
                    {chipCase.archived ? <Badge>Archivée</Badge> : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {chipCase.chipTypes.map((type) => (
                      <span
                        key={type.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/5 py-1 pl-1.5 pr-2.5 text-xs text-cream-200 ring-1 ring-white/10"
                      >
                        <span
                          className="size-5 rounded-full ring-1 ring-white/25"
                          style={{ backgroundColor: type.color }}
                        />
                        <span className="tabular">{formatChips(type.value)}</span>
                        <span className="text-cream-300/50">×{formatChips(type.quantity)}</span>
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center">
                    <div>
                      <div className="text-sm font-semibold text-cream-50">{chipCase.chipTypes.length}</div>
                      <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Valeurs</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-cream-50">{formatChips(totalChips)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Jetons</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-cream-50">{formatChips(totalValue)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Valeur</div>
                    </div>
                  </div>

                  {chipCase.tournamentsCount > 0 ? (
                    <p className="mt-3 text-xs text-cream-300/50">
                      {t('chipCase.inUse', { count: chipCase.tournamentsCount })}
                    </p>
                  ) : null}
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
