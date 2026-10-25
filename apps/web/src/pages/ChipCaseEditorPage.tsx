import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Archive, ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { formatChips, useApiErrorMessage } from '../lib/format';
import type { BuyInPlan, ChipCase } from '../lib/types';
import { Badge, Button, Card, ConfirmDialog, Field, Input, Modal, Select, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

interface ChipRow {
  id?: string;
  label: string;
  color: string;
  value: string;
  quantity: string;
}

const DEFAULT_ROWS: ChipRow[] = [
  { label: 'Blanc', color: '#F5F1E6', value: '25', quantity: '500' },
  { label: 'Rouge', color: '#C0392B', value: '100', quantity: '400' },
  { label: 'Vert', color: '#1E8449', value: '500', quantity: '200' },
  { label: 'Noir', color: '#111827', value: '1000', quantity: '150' },
  { label: 'Violet', color: '#7D3C98', value: '5000', quantity: '50' },
];

export function ChipCaseEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useToast();
  const errorMessage = useApiErrorMessage();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<ChipRow[]>(DEFAULT_ROWS);
  const [archived, setArchived] = useState(false);
  const [initialized, setInitialized] = useState(isNew);
  const [formError, setFormError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<ChipRow | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('0');
  const [adjustReason, setAdjustReason] = useState('Inventaire');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['chip-case', id],
    queryFn: () => api.get<{ chipCase: ChipCase }>(`/api/chip-cases/${id}`),
    enabled: Boolean(id),
  });

  const adjustmentsQuery = useQuery({
    queryKey: ['chip-case-adjustments', id],
    queryFn: () =>
      api.get<{
        adjustments: Array<{
          id: string;
          chipTypeId: string;
          delta: number;
          before: number;
          after: number;
          reason: string;
          createdAt: string;
        }>;
      }>(`/api/chip-cases/${id}/adjustments`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!detailQuery.data || initialized) return;
    const chipCase = detailQuery.data.chipCase;
    setName(chipCase.name);
    setDescription(chipCase.description ?? '');
    setArchived(chipCase.archived);
    setRows(
      chipCase.chipTypes.map((type) => ({
        id: type.id,
        label: type.label,
        color: type.color,
        value: String(type.value),
        quantity: String(type.quantity),
      })),
    );
    setInitialized(true);
  }, [detailQuery.data, initialized]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const chipTypes = rows.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        label: row.label.trim(),
        color: row.color,
        value: Number.parseInt(row.value, 10),
        quantity: Number.parseInt(row.quantity, 10),
      }));
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        chipTypes,
      };
      if (isNew) {
        return api.post<{ chipCase: ChipCase }>('/api/chip-cases', payload);
      }
      return api.patch<{ chipCase: ChipCase }>(`/api/chip-cases/${id}`, {
        ...payload,
        archived,
      });
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['chip-cases'] });
      void queryClient.invalidateQueries({ queryKey: ['chip-case', data.chipCase.id] });
      success(isNew ? 'Mallette créée.' : 'Mallette enregistrée.');
      if (isNew) navigate(`/mallettes/${data.chipCase.id}`, { replace: true });
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.patch(`/api/chip-cases/${id}`, { archived: !archived }),
    onSuccess: () => {
      setArchived((value) => !value);
      void queryClient.invalidateQueries({ queryKey: ['chip-cases'] });
      void queryClient.invalidateQueries({ queryKey: ['chip-case', id] });
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/chip-cases/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chip-cases'] });
      success('Mallette supprimée.');
      navigate('/mallettes');
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  const adjustMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/chip-cases/${id}/adjustments`, {
        chipTypeId: adjusting?.id,
        delta: Number.parseInt(adjustDelta, 10),
        reason: adjustReason.trim(),
      }),
    onSuccess: () => {
      setAdjusting(null);
      setAdjustDelta('0');
      void queryClient.invalidateQueries({ queryKey: ['chip-case', id] });
      void queryClient.invalidateQueries({ queryKey: ['chip-case-adjustments', id] });
      success('Stock ajusté.');
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  const [previewPlayers, setPreviewPlayers] = useState('8');
  const [previewBuyIn, setPreviewBuyIn] = useState('10000');
  const previewMutation = useMutation({
    mutationFn: () =>
      api.post<{ plan: BuyInPlan }>(`/api/chip-cases/${id}/buyin/preview`, {
        players: Number.parseInt(previewPlayers, 10),
        targetBuyIn: Number.parseInt(previewBuyIn, 10),
        startingStack: Number.parseInt(previewBuyIn, 10),
        mode: 'AUTO',
        counts: {},
        commonEnabled: {},
        commonCount: 0,
        maxChipsPerPlayer: 60,
      }),
  });

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const value = Number.parseInt(row.value, 10) || 0;
        const quantity = Number.parseInt(row.quantity, 10) || 0;
        return {
          chips: acc.chips + quantity,
          value: acc.value + value * quantity,
        };
      },
      { chips: 0, value: 0 },
    );
  }, [rows]);

  if (detailQuery.isLoading && !isNew) return <Spinner />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (rows.length === 0) {
      setFormError('Ajoutez au moins un type de jeton.');
      return;
    }
    const values = new Set<string>();
    for (const row of rows) {
      const value = Number.parseInt(row.value, 10);
      const quantity = Number.parseInt(row.quantity, 10);
      if (!row.label.trim()) {
        setFormError('Chaque jeton doit avoir un libellé.');
        return;
      }
      if (!Number.isFinite(value) || value <= 0) {
        setFormError('Chaque jeton doit avoir une valeur positive.');
        return;
      }
      if (!Number.isFinite(quantity) || quantity < 0) {
        setFormError('Les quantités doivent être positives.');
        return;
      }
      if (values.has(String(value))) {
        setFormError(t('chipCase.uniqueValues'));
        return;
      }
      values.add(String(value));
    }
    saveMutation.mutate();
  };

  const updateRow = (index: number, patch: Partial<ChipRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link to="/mallettes" className="btn-ghost btn-icon -ml-1" aria-label={t('common.back')}>
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[1.7rem] leading-tight text-cream-50 sm:text-[2rem]">
              {isNew ? t('chipCase.new') : t('chipCase.edit')}
            </h1>
            <p className="text-[11.5px] text-cream-400">{t('chipCase.subtitle')}</p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {!isNew ? (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => archiveMutation.mutate()}
              loading={archiveMutation.isPending}
            >
              <Archive className="size-3.5" aria-hidden />
              {archived ? 'Désarchiver' : 'Archiver'}
            </Button>
          ) : null}
          <Button onClick={onSubmit} loading={saveMutation.isPending} size="sm" className="flex-1 sm:flex-none">
            <Save className="size-3.5" aria-hidden />
            {t('common.save')}
          </Button>
        </div>
      </header>

      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl text-cream-50">Identité</h2>
            <div className="mt-4 space-y-4">
              <Field label={t('chipCase.name')} htmlFor="case-name">
                <Input
                  id="case-name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Mallette du club"
                />
              </Field>
              <Field
                label={`${t('chipCase.description')} (${t('common.optional')})`}
                htmlFor="case-description"
                hint="Un repère utile quand plusieurs mallettes cohabitent."
              >
                <Input
                  id="case-description"
                  maxLength={500}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Jetons du club, soirées du vendredi"
                />
              </Field>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-xl text-cream-50">Jetons</h2>
                <p className="mt-0.5 text-[11.5px] text-cream-400">
                  {rows.length} valeur{rows.length > 1 ? 's' : ''} · chaque valeur doit être unique
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    { label: 'Nouveau', color: '#3B82F6', value: '', quantity: '0' },
                  ])
                }
              >
                <Plus className="size-3.5" aria-hidden />
                {t('chipCase.addChipType')}
              </Button>
            </div>

            <div className="mt-4 hidden grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_6.5rem_7rem_2.5rem] gap-2 px-1 pb-1 text-[9.5px] font-bold uppercase tracking-[0.13em] text-cream-400 sm:grid">
              <span />
              <span>Libellé</span>
              <span>Couleur</span>
              <span>Valeur</span>
              <span>Quantité</span>
              <span />
            </div>

            <div className="space-y-2">
              {rows.map((row, index) => (
                <div
                  key={row.id ?? index}
                  className="rounded-[var(--radius-md)] border border-white/[0.07] bg-white/[0.018] p-2.5 sm:grid sm:grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_6.5rem_7rem_2.5rem] sm:items-center sm:gap-2"
                >
                  <div className="flex items-center gap-2 sm:contents">
                    <label
                      className="relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-white/20 sm:size-8"
                      style={{ backgroundColor: row.color }}
                      title={t('chipCase.color')}
                    >
                      <input
                        type="color"
                        aria-label={`${t('chipCase.color')} ${row.label}`}
                        value={row.color}
                        onChange={(event) => updateRow(index, { color: event.target.value })}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                      />
                      <span className="pointer-events-none size-2 rounded-full bg-white/60 mix-blend-overlay" />
                    </label>

                    <Input
                      aria-label={t('chipCase.chipLabel')}
                      value={row.label}
                      maxLength={40}
                      onChange={(event) => updateRow(index, { label: event.target.value })}
                      className="min-w-0 flex-1"
                    />

                    <button
                      type="button"
                      aria-label={`Supprimer ${row.label}`}
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                      className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] text-cream-400 transition hover:bg-danger-500/10 hover:text-danger-300 sm:col-start-6 sm:row-start-1"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 sm:contents sm:mt-0">
                    <label
                      className="hidden min-w-0 sm:col-start-4 sm:row-start-1 sm:block"
                      htmlFor={`chip-color-${index}`}
                    >
                      <span className="label sm:hidden">{t('chipCase.color')}</span>
                      <input
                        id={`chip-color-${index}`}
                        type="color"
                        aria-label={`${t('chipCase.color')} ${row.label}`}
                        value={row.color}
                        onChange={(event) => updateRow(index, { color: event.target.value })}
                        className="h-11 w-full cursor-pointer rounded-[var(--radius-md)] border border-white/[0.12] bg-night-950/70 p-1"
                      />
                    </label>
                    <label className="block min-w-0 sm:col-start-4 sm:row-start-1">
                      <span className="label sm:hidden">{t('chipCase.value')}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        aria-label={t('chipCase.value')}
                        min={1}
                        value={row.value}
                        onChange={(event) => updateRow(index, { value: event.target.value })}
                        className="min-w-0"
                      />
                    </label>
                    <label className="block min-w-0 sm:col-start-5 sm:row-start-1">
                      <span className="label sm:hidden">{t('chipCase.quantity')}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        aria-label={t('chipCase.quantity')}
                        min={0}
                        value={row.quantity}
                        onChange={(event) => updateRow(index, { quantity: event.target.value })}
                        className="min-w-0"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-4">
              <div className="rounded-[var(--radius-sm)] bg-white/[0.025] px-3 py-2">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-cream-400">
                  Jetons physiques
                </div>
                <div className="tabular mt-0.5 text-lg font-bold text-cream-50">
                  {formatChips(totals.chips)}
                </div>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-white/[0.025] px-3 py-2">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-cream-400">
                  Valeur totale
                </div>
                <div className="tabular mt-0.5 text-lg font-bold text-cream-50">
                  {formatChips(totals.value)}
                </div>
              </div>
            </div>

            {formError ? (
              <p className="field-error mt-3" role="alert">
                {formError}
              </p>
            ) : null}
          </Card>
        </div>

        <div className="space-y-5">
          {!isNew ? (
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl text-cream-50">Stock libre</h2>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream-500">
                  Physique − réservé
                </span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-cream-400">
                Les réservations des tournois en cours sont déduites automatiquement.
              </p>
              <div className="mt-4 space-y-3">
                {(detailQuery.data?.chipCase.chipTypes ?? []).map((type) => {
                  const free = type.freeQuantity ?? type.quantity;
                  const ratio = type.quantity > 0 ? Math.min(1, free / type.quantity) : 0;
                  return (
                    <div key={type.id}>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="size-4 shrink-0 rounded-full border border-white/20"
                          style={{ backgroundColor: type.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-cream-200">
                          {type.label}
                        </span>
                        <span className="tabular text-[11.5px] text-cream-400">
                          <strong className="font-semibold text-cream-100">{formatChips(free)}</strong>{' '}
                          / {formatChips(type.quantity)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="px-2"
                          onClick={() => {
                            setAdjusting(rows.find((row) => row.id === type.id) ?? null);
                            setAdjustDelta('0');
                          }}
                        >
                          {t('chipCase.adjust')}
                        </Button>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 pl-6">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <span
                            className={`block h-full rounded-full ${
                              ratio < 0.25 ? 'bg-warning-400' : 'bg-success-500'
                            }`}
                            style={{ width: `${ratio * 100}%` }}
                          />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (
            <Card className="p-4 sm:p-5">
              <h2 className="font-display text-xl text-cream-50">Bien démarrer</h2>
              <ul className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-cream-300">
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />
                  Déclarez les valeurs réellement présentes dans votre mallette.
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />
                  Indiquez le stock physique exact : il sert au calcul des caves et des réservations.
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />
                  Vous pourrez archiver la mallette plus tard sans perdre son historique.
                </li>
              </ul>
            </Card>
          )}

          {!isNew ? (
            <Card className="p-4 sm:p-5">
              <h2 className="font-display text-xl text-cream-50">Aperçu de cave</h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-cream-400">
                Vérifiez la répartition avant de créer un tournoi.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Field label={t('tournament.playersExpected')}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={2}
                    max={200}
                    value={previewPlayers}
                    onChange={(event) => setPreviewPlayers(event.target.value)}
                  />
                </Field>
                <Field label={t('tournament.buyIn')}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={100}
                    value={previewBuyIn}
                    onChange={(event) => setPreviewBuyIn(event.target.value)}
                  />
                </Field>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                loading={previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
              >
                Calculer la répartition
              </Button>

              {previewMutation.data ? (
                <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span
                      className={
                        previewMutation.data.plan.exact ? 'text-success-300' : 'text-warning-300'
                      }
                    >
                      {previewMutation.data.plan.exact
                        ? t('tournament.exactDistribution')
                        : t('tournament.approximateDistribution', {
                            difference: formatChips(previewMutation.data.plan.difference),
                          })}
                    </span>
                    <Badge tone="neutral">{previewMutation.data.plan.algorithm}</Badge>
                  </div>
                  {previewMutation.data.plan.counts
                    .filter((count) => count.perPlayer > 0)
                    .map((count) => (
                      <div key={count.chipTypeId} className="flex items-center gap-2 text-[13px]">
                        <span
                          className="size-3.5 rounded-full border border-white/20"
                          style={{ backgroundColor: count.color }}
                          aria-hidden
                        />
                        <span className="flex-1 text-cream-200">{count.label}</span>
                        <span className="tabular text-cream-400">×{count.perPlayer}</span>
                      </div>
                    ))}
                  <p className="pt-1 text-[11px] text-cream-400">
                    {t('tournament.chipsPerPlayer', {
                      count: previewMutation.data.plan.perPlayerChipCount,
                    })}
                  </p>
                </div>
              ) : null}
            </Card>
          ) : null}

          {!isNew ? (
            <Card className="p-4 sm:p-5">
              <h2 className="font-display text-xl text-cream-50">Derniers ajustements</h2>
              <div className="mt-3 space-y-2">
                {(adjustmentsQuery.data?.adjustments ?? []).slice(0, 8).map((adjustment) => {
                  const chipType = detailQuery.data?.chipCase.chipTypes.find(
                    (type) => type.id === adjustment.chipTypeId,
                  );
                  return (
                    <div
                      key={adjustment.id}
                      className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-white/[0.02] px-2.5 py-1.5 text-[11.5px]"
                    >
                      <span className="min-w-0 flex-1 truncate text-cream-300">
                        {chipType?.label ?? 'Jeton'}
                      </span>
                      <span
                        className={`tabular font-bold ${
                          adjustment.delta > 0 ? 'text-success-300' : 'text-danger-300'
                        }`}
                      >
                        {adjustment.delta > 0 ? '+' : ''}
                        {adjustment.delta}
                      </span>
                      <span className="max-w-[45%] truncate text-cream-500">
                        {adjustment.reason}
                      </span>
                    </div>
                  );
                })}
                {(adjustmentsQuery.data?.adjustments ?? []).length === 0 ? (
                  <p className="text-[11.5px] text-cream-500">Aucun ajustement.</p>
                ) : null}
              </div>
            </Card>
          ) : null}

          {!isNew ? (
            <Card className="border-danger-500/20 p-4 sm:p-5">
              <h2 className="font-display text-xl text-cream-50">Zone sensible</h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-cream-400">
                Une mallette liée à un tournoi ne peut pas être supprimée. Archivez-la à la place.
              </p>
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="mt-3"
                loading={deleteMutation.isPending}
                onClick={() =>
                  setConfirmDelete(true)
                }
              >
                <Trash2 className="size-3.5" aria-hidden />
                {t('common.delete')}
              </Button>
            </Card>
          ) : null}
        </div>
      </form>

      <Modal
        open={adjusting !== null}
        onClose={() => setAdjusting(null)}
        title={`Ajuster ${adjusting?.label ?? ''}`}
        description="Positif pour ajouter des jetons, négatif pour en retirer."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjusting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={adjustMutation.isPending}
              disabled={!adjusting || Number.parseInt(adjustDelta, 10) === 0}
              onClick={() => adjustMutation.mutate()}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Variation">
            <Input
              type="number"
              inputMode="numeric"
              value={adjustDelta}
              onChange={(event) => setAdjustDelta(event.target.value)}
            />
          </Field>
          <Field label={t('chipCase.adjustmentReason')}>
            <Select value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)}>
              <option>Inventaire</option>
              <option>Achat de jetons</option>
              <option>Perte / casse</option>
              <option>Retour d’un tournoi</option>
              <option>Correction</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer définitivement cette mallette ?"
        description="Les jetons et l’historique d’inventaire associés seront supprimés. Cette action est irréversible."
        confirmLabel="Supprimer"
        loading={deleteMutation.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          deleteMutation.mutate();
        }}
      />
    </div>
  );
}
