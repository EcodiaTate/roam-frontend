// src/app/plans/page.tsx
// Plans are now managed via the drawer within /trip.
// This route redirects permanently so old links/bookmarks still work.
import { redirect } from "next/navigation";

export default function PlansPage() {
  redirect("/trip");
}
