import { eq, inArray, sql } from "drizzle-orm";
import type { RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { TastingInputSchema, TastingSchema } from "@peated/shared/schemas";

import { XP_PER_LEVEL } from "@peated/shared/constants";
import { db } from "../db";
import type {
  Entity,
  NewTasting,
  Tasting} from "../db/schema";
import {
  badgeAwards,
  bottleTags,
  bottles,
  bottlesToDistillers,
  entities,
  tastings,
} from "../db/schema";
import { checkBadges } from "../lib/badges";
import { isDistantFuture, isDistantPast } from "../lib/dates";
import { serialize } from "../lib/serializers";
import { TastingSerializer } from "../lib/serializers/tasting";
import { requireAuth } from "../middleware/auth";

export default {
  method: "POST",
  url: "/tastings",
  schema: {
    body: zodToJsonSchema(TastingInputSchema),
    response: {
      201: zodToJsonSchema(TastingSchema),
    },
  },
  preHandler: [requireAuth],
  handler: async (req, res) => {
    const body = req.body;

    const [bottle] = await db
      .select()
      .from(bottles)
      .where(eq(bottles.id, body.bottle));
    if (!bottle) {
      return res.status(400).send({ error: "Could not identify bottle" });
    }

    const data: NewTasting = {
      bottleId: bottle.id,
      notes: body.notes || null,
      rating: body.rating || null,
      tags: body.tags
        ? Array.from(new Set(body.tags.map((t) => t.toLowerCase())))
        : [],
      createdById: req.user.id,
    };
    if (body.createdAt) {
      data.createdAt = new Date(body.createdAt);
      if (isDistantFuture(data.createdAt, 60 * 5)) {
        return res.status(400).send({ error: "createdAt too far in future" });
      }
      if (isDistantPast(data.createdAt, 60 * 60 * 24 * 7)) {
        return res.status(400).send({ error: "createdAt too far in past" });
      }
    }

    const tasting = await db.transaction(async (tx) => {
      let tasting: Tasting | undefined;
      try {
        [tasting] = await tx.insert(tastings).values(data).returning();
      } catch (err: any) {
        if (err?.code === "23505" && err?.constraint === "tasting_unq") {
          res.status(409).send({ error: "Tasting already exists" });
          return;
        }
        throw err;
      }
      if (!tasting) return;

      await tx
        .update(bottles)
        .set({ totalTastings: sql`${bottles.totalTastings} + 1` })
        .where(eq(bottles.id, bottle.id));

      const distillerIds = (
        await tx
          .select({ id: bottlesToDistillers.distillerId })
          .from(bottlesToDistillers)
          .where(eq(bottlesToDistillers.bottleId, bottle.id))
      ).map((d) => d.id);

      await tx
        .update(entities)
        .set({ totalTastings: sql`${entities.totalTastings} + 1` })
        .where(
          inArray(
            entities.id,
            Array.from(new Set([bottle.brandId, ...distillerIds])),
          ),
        );

      for (const tag of tasting.tags) {
        await tx
          .insert(bottleTags)
          .values({
            bottleId: bottle.id,
            tag,
            count: 1,
          })
          .onConflictDoUpdate({
            target: [bottleTags.bottleId, bottleTags.tag],
            set: {
              count: sql<number>`${bottleTags.count} + 1`,
            },
          });
      }

      const badgeList = await checkBadges({
        ...tasting,
        bottle: {
          ...bottle,
          brand: (await tx.query.entities.findFirst({
            where: (entities, { eq }) => eq(entities.id, bottle.brandId),
          })) as Entity,
          distillers: await tx.query.entities.findMany({
            where: (entities) => inArray(entities.id, distillerIds),
          }),
        },
      });

      for (const badge of badgeList) {
        await tx
          .insert(badgeAwards)
          .values({
            badgeId: badge.id,
            userId: tasting.createdById,
            xp: 1,
            level: 1,
          })
          .onConflictDoUpdate({
            target: [badgeAwards.badgeId, badgeAwards.userId],
            set: {
              xp: sql`${badgeAwards.xp} + 1`,
              level: sql`(${badgeAwards.xp} + 1) / ${XP_PER_LEVEL} + 1`,
            },
          });
      }

      return tasting;
    });

    if (!tasting) {
      return res.status(500).send({ error: "Unable to create tasting" });
    }
    res.status(201).send(await serialize(TastingSerializer, tasting, req.user));
  },
} as RouteOptions<
  Server,
  IncomingMessage,
  ServerResponse,
  {
    Body: z.infer<typeof TastingInputSchema>;
  }
>;
