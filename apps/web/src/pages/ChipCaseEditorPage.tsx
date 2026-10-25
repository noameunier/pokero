import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Archive, ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { formatChips, useApiErrorMessage } from '../lib/format';
import type { BuyInPlan, ChipCase } from '../lib/types';
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner } from '../components/ui';
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/mallettes" className="btn-ghost btn-sm p-2" aria-label={t('common.back')}>
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-cream-50 sm:text-3xl">
              {isNew ? t('chipCase.new') : t('chipCase.edit')}
            </h1>
            <p className="text-sm text-cream-300/60">{t('chipCase.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => archiveMutation.mutate()}
              loading={archiveMutation.isPending}
            >
              <Archive className="size-4" />
              {archived ? 'Désarchiver' : 'Archiver'}
            </Button>
          ) : null}
          <Button onClick={onSubmit} loading={saveMutation.isPending} size="sm">
            <Save className="size-4" />
            {t('common.save')}
          </Button>
        </div>
      </header>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-cream-50">Informations</h2>
            <div className="space-y-4">
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
              <Field label={`${t('chipCase.description')} (${t('common.optional')})`} htmlFor="case-description">
                <Input
                  id="case-description"
                  maxLength={500}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-cream-50">Jetons</h2>
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
                <Plus className="size-4" />
                {t('chipCase.addChipType')}
              </Button>
            </div>

            <div className="space-y-2">
              <div className="hidden grid-cols-[2rem_1.2fr_5.5rem_1fr_1fr_2.5rem] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-cream-300/50 sm:grid">
                <span />
                <span>{t('chipCase.chipLabel')}</span>
                <span>{t('chipCase.color')}</span>
                <span>{t('chipCase.value')}</span>
                <span>{t('chipCase.quantity')}</span>
                <span />
              </div>
              {rows.map((row, index) => (
                <div
                  key={row.id ?? index}
                  className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-2 sm:grid-cols-[2rem_1.2fr_5.5rem_1fr_1fr_2.5rem]"
                >
                  <input
                    type="color"
                    aria-label={`${t('chipCase.color')} ${row.label}`}
                    value={row.color}
                    onChange={(event) => updateRow(index, { color: event.target.value })}
                    className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-white/30"
                  />
                  <Input
                    aria-label={t('chipCase.chipLabel')}
                    value={row.label}
                    maxLength={40}
                    onChange={(event) => updateRow(index, { label: event.target.value })}
                  />
                  <div className="hidden items-center gap-2 sm:flex">
                    <input
                      type="color"
                      aria-label={t('chipCase.color')}
                      value={row.color}
                      onChange={(event) => updateRow(index, { color: event.target.value })}
                      className="size-9 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5"
                    />
                  </div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-label={t('chipCase.value')}
                    min={1}
                    value={row.value}
                    onChange={(event) => updateRow(index, { value: event.target.value })}
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-label={t('chipCase.quantity')}
                    min={0}
                    value={row.quantity}
                    onChange={(event) => updateRow(index, { quantity: event.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={t('common.delete')}
                    onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    className="grid size-8 place-items-center rounded-lg text-cream-300/50 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/10 pt-4 text-sm">
              <span className="text-cream-300/60">
                {formatChips(totals.chips)} jetons · {formatChips(totals.value)} de valeur totale
              </span>
            </div>

            {formError ? <p className="field-error mt-3">{formError}</p> : null}
          </Card>
        </div>

        <div className="space-y-6">
          {!isNew ? (
            <Card>
              <h2 className="text-lg font-semibold text-cream-50">Stock libre</h2>
              <p className="mt-1 text-xs text-cream-300/60">
                Quantités physiques moins les réservations des tournois en cours.
              </p>
              <div className="mt-4 space-y-2">
                {(detailQuery.data?.chipCase.chipTypes ?? []).map((type) => (
                  <div key={type.id} className="flex items-center gap-3 text-sm">
                    <span
                      className="size-5 shrink-0 rounded-full ring-1 ring-white/25"
                      style={{ backgroundColor: type.color }}
                    />
                    <span className="flex-1 truncate text-cream-200">{type.label}</span>
                    <span className="tabular text-cream-300/70">
                      {formatChips(type.freeQuantity ?? 0)} / {formatChips(type.quantity)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAdjusting(rows.find((row) => row.id === type.id) ?? null);
                        setAdjustDelta('0');
                      }}
                    >
                      {t('chipCase.adjust')}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {!isNew ? (
            <Card>
              <h2 className="text-lg font-semibold text-cream-50">Aperçu de cave</h2>
              <p className="mt-1 text-xs text-cream-300/60">
                Vérifiez la répartition avant de créer un tournoi.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Field label={t('tournament.playersExpected')}>
                  <Input
                    type="number"
                    min={2}
                    max={200}
                    value={previewPlayers}
                    onChange={(event) => setPreviewPlayers(event.target.value)}
                  />
                </Field>
                <Field label={t('tournament.buyIn')}>
                  <Input
                    type="number"
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
                Calculer
              </Button>

              {previewMutation.data ? (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className={previewMutation.data.plan.exact ? 'text-emerald-300' : 'text-amber-300'}>
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
                      <div key={count.chipTypeId} className="flex items-center gap-2 text-sm">
                        <span
                          className="size-4 rounded-full ring-1 ring-white/25"
                          style={{ backgroundColor: count.color }}
                        />
                        <span className="flex-1 text-cream-200">{count.label}</span>
                        <span className="tabular text-cream-300/70">×{count.perPlayer}</span>
                      </div>
                    ))}
                  <p className="pt-1 text-xs text-cream-300/60">
                    {t('tournament.chipsPerPlayer', {
                      count: previewMutation.data.plan.perPlayerChipCount,
                    })}
                  </p>
                </div>
              ) : null}
            </Card>
          ) : null}

          {!isNew ? (
            <Card>
              <h2 className="text-lg font-semibold text-cream-50">Derniers ajustements</h2>
              <div className="mt-3 space-y-2">
                {(adjustmentsQuery.data?.adjustments ?? []).slice(0, 8).map((adjustment) => {
                  const chipType = detailQuery.data?.chipCase.chipTypes.find(
                    (type) => type.id === adjustment.chipTypeId,
                  );
                  return (
                    <div key={adjustment.id} className="flex items-center gap-2 text-xs">
                      <span className="text-cream-200">{chipType?.label ?? 'Jeton'}</span>
                      <span
                        className={`tabular font-semibold ${
                          adjustment.delta > 0 ? 'text-emerald-300' : 'text-red-300'
                        }`}
                      >
                        {adjustment.delta > 0 ? '+' : ''}
                        {adjustment.delta}
                      </span>
                      <span className="text-cream-300/40">({adjustment.reason})</span>
                    </div>
                  );
                })}
                {(adjustmentsQuery.data?.adjustments ?? []).length === 0 ? (
                  <p className="text-xs text-cream-300/50">Aucun ajustement.</p>
                ) : null}
              </div>
            </Card>
          ) : null}

          {!isNew ? (
            <Card className="border-red-500/20">
              <h2 className="text-lg font-semibold text-cream-50">Zone sensible</h2>
              <p className="mt-1 text-xs text-cream-300/60">
                Une mallette liée à un tournoi ne peut pas être supprimée. Archivez-la à la place.
              </p>
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="mt-3"
                loading={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm('Supprimer définitivement cette mallette ?')) {
                    deleteMutation.mutate();
                  }
                }}
              >
                <Trash2 className="size-4" />
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
          <Field
            label="Variation"
            hint="Positif pour ajouter des jetons, négatif pour en retirer."
          >
            <Input
              type="number"
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
    </div>
  );
}
