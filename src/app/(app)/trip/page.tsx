// src/app/trip/page.tsx
import { Suspense } from "react";
import { TripClientPage } from "./ClientPage";

export default function TripPage() {
  return (
    <Suspense>
      <TripClientPage initialPlanId={null} />
    </Suspense>
  );
}
