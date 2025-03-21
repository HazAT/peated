import waitError from "@peated/server/lib/test/waitError";
import { createCaller } from "../router";

test("lists reviews", async ({ fixtures }) => {
  const site = await fixtures.ExternalSite();
  await fixtures.Review({ externalSiteId: site.id });
  await fixtures.Review({ externalSiteId: site.id });

  const caller = createCaller({
    user: await fixtures.User({ mod: true }),
  });
  const { results } = await caller.reviewList();

  expect(results.length).toBe(2);
});

test("lists reviews without mod", async ({ defaults, fixtures }) => {
  const caller = createCaller({ user: defaults.user });
  const err = await waitError(caller.reviewList());
  expect(err).toMatchInlineSnapshot(`[TRPCError: BAD_REQUEST]`);
});

test("lists reviews by site", async ({ fixtures }) => {
  const astorwine = await fixtures.ExternalSite({ type: "astorwines" });
  const totalwine = await fixtures.ExternalSite({ type: "totalwine" });

  const review = await fixtures.Review({ externalSiteId: astorwine.id });
  await fixtures.Review({ externalSiteId: totalwine.id });

  const caller = createCaller({
    user: await fixtures.User({ mod: true }),
  });
  const { results } = await caller.reviewList({
    site: astorwine.type,
  });

  expect(results.length).toBe(1);
  expect(results[0].id).toEqual(review.id);
});

test("lists reviews by site without mod", async ({ defaults, fixtures }) => {
  const site = await fixtures.ExternalSite();

  const caller = createCaller({ user: defaults.user });
  const err = await waitError(
    caller.reviewList({
      site: site.type,
    }),
  );
  expect(err).toMatchInlineSnapshot(`[TRPCError: BAD_REQUEST]`);
});
