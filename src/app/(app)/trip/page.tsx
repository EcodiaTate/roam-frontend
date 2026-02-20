// src/app/trip/page.tsx
import { TripClientPage } from "./ClientPage";

export const dynamic = "force-static";

export default function TripPage() {
  // Static export friendly: no access to searchParams here.
  return <TripClientPage initialPlanId={null} />;
}
