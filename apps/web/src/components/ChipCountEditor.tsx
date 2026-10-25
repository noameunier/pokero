import { Check, Equal } from 'lucide-react';
import type { ChipType } from '../lib/types';
import { formatChips } from '../lib/format';
import { Field, Input } from './ui';

/**
 * Édition manuelle de la cave, jeton par jeton.
 *
 * Chaque type de jeton peut suivre la « quantité commune » (case cochée) ou
 * conserver sa propre quantité. Le passage d'un mode à l'autre ne détruit
 * jamais la quantité spécifique saisie : elle est simplement désactivée.
 */
export function ChipCountEditor({
  chipTypes,
  counts,
  commonEnabled,
  commonCount,
  players,
  onCountChange,
  onToggleCommon,
  onCommonCountChange,
}: {
  chipTypes: ChipType[];
  counts: Record<string, number>;
  commonEnabled: Record<string, boolean>;
  commonCount: number;
  players: number;
  onCountChange: (chipTypeId: string, count: number) => void;
  onToggleCommon: (chipTypeId: string, enabled: boolean) => void;
  onCommonCountChange: (count: number) => void;
}) {
  const commonIds = chipTypes.filter((type) => commonEnabled[type.id]);
  const allCommon = chipTypes.length > 0 && commonIds.length === chipTypes.length;

  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-md)] border border-gold-500/20 bg-gold-500/[0.045] p-3.5">
        <Field
          label="Quantité commune"
          hint="Appliquée à chaque type de jeton coché ci-dessous."
          htmlFor="common-chip-count"
        >
          <div className="flex items-center gap-2">
            <Input
              id="common-chip-count"
              type="number"
              inputMode="numeric"
              min={0}
              value={commonCount}
              onChange={(event) => onCommonCountChange(Math.max(0, Number(event.target.value) || 0))}
              className="w-28"
            />
            <button
              type="button"
              onClick={() => chipTypes.forEach((type) => onToggleCommon(type.id, !allCommon))}
              className="btn-secondary btn-sm"
            >
              <Equal className="size-3.5" aria-hidden />
              {allCommon ? 'Décocher partout' : 'Cocher partout'}
            </button>
          </div>
        </Field>
        <p className="mt-2 text-[11.5px] text-cream-400">
          {commonIds.length} / {chipTypes.length} jetons suivent la quantité commune
          {commonCount > 0 ? ` (${formatChips(commonCount)} par joueur)` : ''}.
        </p>
      </div>

      <ul className="space-y-2">
        {chipTypes.map((type) => {
          const isCommon = Boolean(commonEnabled[type.id]);
          const effective = isCommon ? commonCount : (counts[type.id] ?? 0);
          const needed = effective * Math.max(1, players);
          const available = type.freeQuantity ?? type.quantity;
          const insufficient = needed > available;
          const checkboxId = `common-chip-${type.id}`;

          return (
            <li
              key={type.id}
              className={`rounded-[var(--radius-md)] border p-2.5 transition-colors ${
                isCommon
                  ? 'border-gold-500/25 bg-gold-500/[0.04]'
                  : 'border-white/[0.07] bg-white/[0.018]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="size-5 shrink-0 rounded-full border border-white/25 shadow-[inset_0_0_0_2px_rgb(0_0_0/0.2)]"
                  style={{ backgroundColor: type.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-cream-100">{type.label}</p>
                  <p className="tabular text-[11px] text-cream-400">
                    Valeur {formatChips(type.value)} · dispo {formatChips(available)}
                  </p>
                </div>
                <label className="sr-only" htmlFor={`count-${type.id}`}>
                  Quantité par joueur pour {type.label}
                </label>
                <Input
                  id={`count-${type.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  disabled={isCommon}
                  value={effective}
                  onChange={(event) =>
                    onCountChange(type.id, Math.max(0, Number(event.target.value) || 0))
                  }
                  className="w-[5.5rem] text-right"
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white/[0.05] pt-2">
                <label
                  htmlFor={checkboxId}
                  className="relative flex min-h-11 cursor-pointer select-none items-center gap-2 text-[12px] font-medium text-cream-300"
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={isCommon}
                    onChange={(event) => onToggleCommon(type.id, event.target.checked)}
                    className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none rounded-[var(--radius-sm)] opacity-0"
                  />
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-[6px] border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-400 ${
                      isCommon
                        ? 'border-gold-400 bg-gold-500 text-night-950'
                        : 'border-white/25 bg-night-950/60 text-transparent'
                    }`}
                  >
                    <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  </span>
                  Même nombre de jetons
                  {isCommon ? (
                    <span className="rounded-full border border-gold-500/30 bg-gold-500/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-gold-300">
                      commun
                    </span>
                  ) : null}
                </label>
                <span
                  className={`tabular text-[11px] ${insufficient ? 'font-semibold text-danger-300' : 'text-cream-500'}`}
                >
                  {formatChips(needed)} nécessaire{insufficient ? ' · stock insuffisant' : ''}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
