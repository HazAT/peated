"use client";

import BottleTable from "@peated/web/components/bottleTable";
import EmptyActivity from "@peated/web/components/emptyActivity";
import useApiQueryParams from "@peated/web/hooks/useApiQueryParams";
import { trpc } from "@peated/web/lib/trpc/client";

const DEFAULT_SORT = "-tastings";

export default function BottleList() {
  const queryParams = useApiQueryParams({
    numericFields: [
      "cursor",
      "limit",
      "age",
      "entity",
      "distiller",
      "bottler",
      "entity",
    ],
    overrides: {
      limit: 100,
    },
  });

  const [bottleList] = trpc.bottleList.useSuspenseQuery(queryParams);

  return (
    <>
      {bottleList.results.length > 0 ? (
        <BottleTable
          bottleList={bottleList.results}
          rel={bottleList.rel}
          defaultSort={DEFAULT_SORT}
        />
      ) : (
        <EmptyActivity>
          {"Looks like there's nothing in the database yet. Weird."}
        </EmptyActivity>
      )}
    </>
  );
}
