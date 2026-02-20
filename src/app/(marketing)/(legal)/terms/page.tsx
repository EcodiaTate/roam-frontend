import type { Metadata } from "next";
import TermsContent from "./TermsContent";

export const metadata: Metadata = {
  title: "Terms and Conditions — Roam",
  description:
    "Terms of use for the Roam navigation application, including Australian Consumer Law compliance, liability limitations, and acceptable use.",
};

export default function TermsPage() {
  return <TermsContent />;
}
