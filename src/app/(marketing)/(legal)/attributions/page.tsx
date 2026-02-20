  import type { Metadata } from "next";
import AttributionsContent from "./AttributionsContent";

export const metadata: Metadata = {
  title: "Open Source Attributions — Roam",
  description:
    "Open-source software used in Roam and their respective licences.",
};

export default function AttributionsPage() {
  return <AttributionsContent />;
}
