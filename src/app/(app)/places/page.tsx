import { Suspense } from "react";
import { PlacesClientPage } from "./ClientPage";

export default function PlacesPage() {
  return (
    <Suspense>
      <PlacesClientPage />
    </Suspense>
  );
}
