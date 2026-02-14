// src/app/trip/page.tsx
import {TripClientPage} from "./ClientPage";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function TripPage(props: { searchParams?: Promise<SearchParams> | SearchParams }) {
  const sp = props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;

  const raw = sp?.plan_id;
  const planId = Array.isArray(raw) ? raw[0] : raw;

  return <TripClientPage initialPlanId={planId ?? null} />;
}
