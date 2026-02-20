import type { Metadata } from "next";
import ContactContent from "./ContactContent";

export const metadata: Metadata = {
  title: "Contact — Roam",
  description:
    "Get in touch with the Roam team for support, feedback, privacy requests, or general enquiries.",
};

export default function ContactPage() {
  return <ContactContent />;
}
