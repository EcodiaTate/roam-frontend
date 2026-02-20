import type { Metadata } from "next";
import PrivacyContent from "./PrivacyContent";

export const metadata: Metadata = {
  title: "Privacy Policy — Roam",
  description:
    "How Roam collects, uses, stores, and protects your personal information under the Australian Privacy Act 1988.",
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
