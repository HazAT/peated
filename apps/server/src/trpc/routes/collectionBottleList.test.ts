import { db } from "@peated/server/db";
import { collectionBottles } from "@peated/server/db/schema";
import { getDefaultCollection } from "@peated/server/lib/db";
import waitError from "@peated/server/lib/test/waitError";
import { createCaller } from "@peated/server/trpc/router";

test("cannot list private without friend", async ({ defaults, fixtures }) => {
  const otherUser = await fixtures.User({ private: true });

  const caller = createCaller({ user: defaults.user });
  const err = await waitError(
    caller.collectionBottleList({
      user: otherUser.id,
      collection: "default",
    }),
  );
  expect(err).toMatchInlineSnapshot(`[TRPCError: User's profile is private.]`);
});

test("can list private with friend", async ({ defaults, fixtures }) => {
  const otherUser = await fixtures.User({ private: true });
  await fixtures.Follow({
    fromUserId: defaults.user.id,
    toUserId: otherUser.id,
    status: "following",
  });

  const caller = createCaller({ user: defaults.user });
  const { results } = await caller.collectionBottleList({
    user: otherUser.id,
    collection: "default",
  });

  expect(results.length).toEqual(0);
});

test("can list public without friend", async ({ defaults, fixtures }) => {
  const otherUser = await fixtures.User({ private: false });

  const caller = createCaller({ user: defaults.user });
  const { results } = await caller.collectionBottleList({
    user: otherUser.id,
    collection: "default",
  });

  expect(results.length).toEqual(0);
});

test("can list own bottles with me parameter", async ({
  defaults,
  fixtures,
}) => {
  // Create some bottles and add them to the default collection
  const bottle1 = await fixtures.Bottle();
  const bottle2 = await fixtures.Bottle();
  const edition = await fixtures.BottleEdition({ bottleId: bottle2.id });

  // Get the default collection
  const defaultCollection = await getDefaultCollection(db, defaults.user.id);
  if (!defaultCollection) {
    throw new Error("Default collection not found");
  }

  // Add bottles to collection
  await db.insert(collectionBottles).values([
    {
      collectionId: defaultCollection.id,
      bottleId: bottle1.id,
      editionId: null,
    },
    {
      collectionId: defaultCollection.id,
      bottleId: bottle2.id,
      editionId: edition.id,
    },
  ]);

  const caller = createCaller({ user: defaults.user });
  const { results } = await caller.collectionBottleList({
    user: "me",
    collection: "default",
  });

  expect(results.length).toEqual(2);

  // Sort and verify bottle IDs
  const bottleIds = results.map((r) => r.bottle.id).sort();
  expect(bottleIds).toEqual([bottle1.id, bottle2.id].sort());

  // Verify both bottles are present with correct data
  const bottle1Result = results.find((r) => r.bottle.id === bottle1.id);
  const bottle2Result = results.find((r) => r.bottle.id === bottle2.id);

  expect(bottle1Result).toBeDefined();
  expect(bottle2Result).toBeDefined();
  expect(bottle1Result?.bottle.name).toBe(bottle1.name);
  expect(bottle2Result?.bottle.name).toBe(bottle2.name);
});
