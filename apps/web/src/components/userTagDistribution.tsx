"use client";

import { trpc } from "@peated/web/lib/trpc/client";
import type { ComponentProps } from "react";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { logError } from "../lib/log";
import DistributionChart, {
  DistributionChartError,
  DistributionChartLegend,
  DistributionChartSkeleton,
} from "./distributionChart";

function UserTagDistributionElement({ userId }: { userId: number }) {
  const [data] = trpc.userTagList.useSuspenseQuery({
    user: userId,
  });

  const { results, totalCount } = data;

  return (
    <DistributionChart
      items={results.map((t) => ({
        name: t.tag,
        count: t.count,
        tag: t.tag,
      }))}
      legend="Frequent Flavors"
      totalCount={totalCount}
      href={(item) => `/bottles?tag=${encodeURIComponent(item.name)}`}
    />
  );
}

export default function UserTagDistribution(
  props: ComponentProps<typeof UserTagDistributionElement>,
) {
  return (
    <div>
      <DistributionChartLegend>Top Flavors</DistributionChartLegend>
      <ErrorBoundary fallback={<DistributionChartError />} onError={logError}>
        <Suspense fallback={<DistributionChartSkeleton />}>
          <UserTagDistributionElement {...props} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
