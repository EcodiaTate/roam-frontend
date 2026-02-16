// src/app/guide/page.tsx
import GuideClientPage from "./ClientPage";

export const dynamic = "force-static";

export default function GuidePage() {
  return (
    <GuideClientPage
      initialPlanId={null}
      initialFocusPlaceId={null}
    />
  );
}
