import { z } from "zod";

import { BADGE_TYPE_LIST } from "../constants";
import { AgeCheckConfigSchema } from "../lib/badges/checks/ageCheck";
import { BottleCheckConfigSchema } from "../lib/badges/checks/bottleCheck";
import { CategoryCheckConfigSchema } from "../lib/badges/checks/categoryCheck";
import { EntityCheckConfigSchema } from "../lib/badges/checks/entityCheck";
import { RegionCheckConfigSchema } from "../lib/badges/checks/regionCheck";

export const BadgeTypeEnum = z.enum(BADGE_TYPE_LIST);

// const BaseSchema = z.object({
//   id: z.number(),
//   name: z.string().trim().min(1, "Required"),
//   maxLevel: z.number().min(1).max(100).default(25),
// });

export const BadgeCheckSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("age"),
    config: AgeCheckConfigSchema,
  }),
  z.object({
    type: z.literal("entity"),
    config: EntityCheckConfigSchema,
  }),
  z.object({
    type: z.literal("bottle"),
    config: BottleCheckConfigSchema,
  }),
  z.object({
    type: z.literal("region"),
    config: RegionCheckConfigSchema,
  }),
  z.object({
    type: z.literal("category"),
    config: CategoryCheckConfigSchema,
  }),
  z.object({
    type: z.literal("everyTasting"),
    config: z.any().default({}), // TODO
  }),
]);

export const BadgeCheckInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("age"),
    config: AgeCheckConfigSchema.partial(),
  }),
  z.object({
    type: z.literal("entity"),
    config: EntityCheckConfigSchema.partial(),
  }),
  z.object({
    type: z.literal("bottle"),
    config: BottleCheckConfigSchema.partial(),
  }),
  z.object({
    type: z.literal("region"),
    config: RegionCheckConfigSchema.partial(),
  }),
  z.object({
    type: z.literal("category"),
    config: CategoryCheckConfigSchema.partial(),
  }),
  z.object({
    type: z.literal("everyTasting"),
    config: z.any().default({}), // TODO
  }),
]);

export const BadgeSchema = z.object({
  id: z.number(),
  name: z.string().trim().min(1, "Required"),
  maxLevel: z.number().min(1).max(100).default(25),
  checks: z
    .array(BadgeCheckSchema)
    .min(1, "At least one check is required.")
    .optional(),
  imageUrl: z.string().nullable().default(null),
});

export const BadgeInputSchema = BadgeSchema.omit({
  id: true,
  imageUrl: true,
}).required({
  checks: true,
});

export const BadgeAwardSchema = z.object({
  id: z.number(),
  xp: z.number(),
  level: z.number(),
  badge: BadgeSchema,
  createdAt: z.string().datetime(),

  prevLevel: z.number().optional(),
});
