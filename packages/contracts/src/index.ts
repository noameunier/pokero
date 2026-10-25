import { z } from 'zod';

export const idSchema = z.string().min(1).max(64);

export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères.')
  .max(200)
  .refine((value) => value.trim().length > 0, 'Le mot de passe ne peut pas être vide.');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Le pseudo doit contenir au moins 2 caractères.')
  .max(40, 'Le pseudo ne peut pas dépasser 40 caractères.');

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue (#RRGGBB).');

export const positiveIntSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().nonnegative();

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200),
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  locale: z.enum(['fr', 'en']).optional(),
  publicProfile: z.boolean().optional(),
  publicResults: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(200),
  confirmation: z.literal('SUPPRIMER'),
});

export const chipTypeInputSchema = z.object({
  id: idSchema.optional(),
  label: z.string().trim().min(1).max(40),
  color: hexColorSchema,
  value: positiveIntSchema.max(1_000_000_000),
  quantity: nonNegativeIntSchema.max(1_000_000_000),
  position: z.number().int().min(0).max(64).optional(),
});

export const chipCaseInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  chipTypes: z.array(chipTypeInputSchema).min(1).max(20),
});

export const chipCaseUpdateSchema = chipCaseInputSchema.partial().extend({
  archived: z.boolean().optional(),
});

export const inventoryAdjustmentSchema = z.object({
  chipTypeId: idSchema,
  delta: z.number().int().min(-1_000_000_000).max(1_000_000_000).refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(300),
});

export const blindLevelInputSchema = z
  .object({
    kind: z.enum(['PLAY', 'BREAK']),
    smallBlind: positiveIntSchema.nullable(),
    bigBlind: positiveIntSchema.nullable(),
    ante: nonNegativeIntSchema.nullable(),
    durationMinutes: z.number().int().min(1).max(600),
  })
  .refine(
    (level) =>
      level.kind === 'BREAK'
        ? level.smallBlind === null && level.bigBlind === null
        : level.smallBlind !== null && level.bigBlind !== null && level.bigBlind >= level.smallBlind * 2,
    { message: 'Blindes incohérentes pour ce niveau.' },
  );

export const blindConfigSchema = z.object({
  autoGenerate: z.boolean().default(true),
  targetDurationMinutes: z.number().int().min(10).max(1440).default(180),
  levelDurationMinutes: z.number().int().min(1).max(120).default(20),
  breakDurationMinutes: z.number().int().min(0).max(120).default(15),
  breakEveryLevels: z.number().int().min(0).max(20).default(4),
  startingSmallBlind: positiveIntSchema.optional(),
  startingBigBlind: positiveIntSchema.optional(),
  roundUnit: positiveIntSchema.default(25),
  anteFromLevel: z.number().int().min(1).max(100).default(5),
  antePercentOfBigBlind: z.number().min(0).max(1).default(0.125),
  growthFactor: z.number().min(1).max(2).optional(),
  levels: z.array(blindLevelInputSchema).max(100).optional(),
});

export const buyInConfigSchema = z.object({
  players: z.number().int().min(2).max(200),
  targetBuyIn: positiveIntSchema,
  startingStack: positiveIntSchema,
  mode: z.enum(['AUTO', 'MANUAL']).default('AUTO'),
  counts: z.record(z.string(), nonNegativeIntSchema).default({}),
  commonEnabled: z.record(z.string(), z.boolean()).default({}),
  commonCount: nonNegativeIntSchema.default(0),
  reserveByType: z.record(z.string(), nonNegativeIntSchema).optional(),
  maxChipsPerPlayer: z.number().int().min(5).max(200).default(60),
});

export const rebuyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  unlimited: z.boolean().default(true),
  maxPerPlayer: z.number().int().min(0).max(50).nullable().default(null),
  value: positiveIntSchema.nullable().default(null),
  untilLevel: z.number().int().min(1).max(100).nullable().default(6),
});

export const addOnConfigSchema = z.object({
  enabled: z.boolean().default(false),
  value: positiveIntSchema.nullable().default(null),
  atLevel: z.number().int().min(1).max(100).nullable().default(null),
  limitPerPlayer: z.number().int().min(1).max(10).default(1),
});

export const alertsConfigSchema = z.object({
  soundBeforeLevel: z.boolean().default(true),
  soundAtLevel: z.boolean().default(true),
  vibration: z.boolean().default(true),
  volume: z.number().min(0).max(1).default(0.8),
});

export const presetConfigSchema = z.object({
  defaultChipCaseId: idSchema.nullable().optional(),
  buyIn: buyInConfigSchema,
  blinds: blindConfigSchema,
  rebuy: rebuyConfigSchema,
  addOn: addOnConfigSchema,
  alerts: alertsConfigSchema,
  display: z
    .object({
      showRanking: z.boolean().default(true),
      showPlayers: z.boolean().default(true),
    })
    .default({ showRanking: true, showPlayers: true }),
});

export const presetInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  config: presetConfigSchema,
});

export const tournamentCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  chipCaseId: idSchema,
  presetId: idSchema.nullable().optional(),
  buyIn: buyInConfigSchema,
  blinds: blindConfigSchema,
  rebuy: rebuyConfigSchema.optional(),
  addOn: addOnConfigSchema.optional(),
  alerts: alertsConfigSchema.optional(),
  display: z
    .object({
      showRanking: z.boolean().default(false),
      showPlayers: z.boolean().default(true),
    })
    .optional(),
  pin: z
    .string()
    .regex(/^\d{4,8}$/, 'Le PIN doit contenir 4 à 8 chiffres.')
    .nullable()
    .optional(),
  publicRanking: z.boolean().default(false),
});

export const participantInputSchema = z.object({
  displayName: displayNameSchema,
  userId: idSchema.nullable().optional(),
});

export const participantUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
});

export const rebuyInputSchema = z.object({
  participantId: idSchema,
  value: positiveIntSchema.optional(),
  counts: z.record(z.string(), nonNegativeIntSchema).optional(),
});

export const addOnInputSchema = rebuyInputSchema.extend({
  counts: z.record(z.string(), nonNegativeIntSchema).optional(),
});

export const eliminateInputSchema = z.object({
  participantId: idSchema,
  /** Séquence manuelle pour ordonner des éliminations simultanées. */
  sequence: z.number().int().min(1).optional(),
});

export const clockCommandSchema = z.object({
  action: z.enum([
    'START',
    'PAUSE',
    'RESUME',
    'NEXT',
    'PREVIOUS',
    'ADD_TIME',
    'SET_REMAINING',
    'COMPLETE',
    'CANCEL',
    'RECOVER',
  ]),
  seconds: z.number().int().min(-86_400).max(86_400).optional(),
  recoveryMode: z.enum(['CONTINUE_ELAPSED', 'LAST_CHECKPOINT', 'LAST_CHECKPOINT_PAUSED']).optional(),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(80),
  pinUnlockToken: z.string().min(20).max(200).optional(),
});

export const pinUnlockSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
});

export const claimRequestSchema = z.object({
  participantId: idSchema,
});

export const claimDecisionSchema = z.object({
  approve: z.boolean(),
});

export const spectatorTokenSchema = z.object({
  token: z.string().min(20).max(200),
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChipCaseInput = z.infer<typeof chipCaseInputSchema>;
export type ChipTypeInput = z.infer<typeof chipTypeInputSchema>;
export type PresetInput = z.infer<typeof presetInputSchema>;
export type PresetConfig = z.infer<typeof presetConfigSchema>;
export type TournamentCreateInput = z.infer<typeof tournamentCreateSchema>;
export type ClockCommandInput = z.infer<typeof clockCommandSchema>;
export type BuyInConfig = z.infer<typeof buyInConfigSchema>;
export type BlindConfig = z.infer<typeof blindConfigSchema>;
export type RebuyConfig = z.infer<typeof rebuyConfigSchema>;
export type AddOnConfig = z.infer<typeof addOnConfigSchema>;
export type AlertsConfig = z.infer<typeof alertsConfigSchema>;
export type DisplayConfig = z.infer<typeof presetConfigSchema>['display'];
