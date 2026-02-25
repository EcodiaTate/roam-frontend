import { redirect } from "next/navigation";

export default function RootPage() {
  // Route to marketing landing page
  redirect("/(marketing)");
}
