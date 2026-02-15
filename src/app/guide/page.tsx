// src/app/guide/page.tsx
import GuideClientPage from "./ClientPage";

type SearchParams = Record<string, string | string[] | undefined>;

export default function GuidePage(props: { searchParams?: SearchParams }) {
  const sp = props.searchParams ?? {};

  const rawPlan = sp.plan_id;
  const planId = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;

  const rawFocus = sp.focus_place_id;
  const focusPlaceId = Array.isArray(rawFocus) ? rawFocus[0] : rawFocus;

  return (
    <GuideClientPage
      initialPlanId={planId ?? null}
      initialFocusPlaceId={focusPlaceId ?? null}
    />
  );
}
