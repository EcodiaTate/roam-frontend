// src/app/explore/page.tsx
import ExploreClientPage from "./ClientPage";

export default async function ExplorePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const raw = sp.plan_id;
  const planId = Array.isArray(raw) ? raw[0] : raw;
  return <ExploreClientPage initialPlanId={planId ?? null} />;
}
