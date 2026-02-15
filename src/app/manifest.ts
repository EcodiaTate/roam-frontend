import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Roam",
    short_name: "Roam",
    description: "Offline-first navigation that never betrays you.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    orientation: "portrait",
    scope: "/",
    lang: "en-AU",
   
  };
}
