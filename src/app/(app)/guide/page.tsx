// src/app/guide/page.tsx
import { Suspense } from "react";
import GuideClientPage from "./ClientPage";

export default function GuidePage() {
  return (
    <Suspense>
      <GuideClientPage
        initialPlanId={null}
        initialFocusPlaceId={null}
      />
    </Suspense>
  );
}
