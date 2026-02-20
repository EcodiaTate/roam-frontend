"use client";

import s from "../legal.module.css";

interface Attribution {
  name: string;
  url: string;
  licence: string;
  description: string;
}

const ATTRIBUTIONS: Attribution[] = [
  {
    name: "OpenStreetMap",
    url: "https://www.openstreetmap.org/copyright",
    licence: "ODbL 1.0",
    description:
      "Map data used for basemaps, routing, and place information. © OpenStreetMap contributors.",
  },
  {
    name: "OSRM (Open Source Routing Machine)",
    url: "https://github.com/Project-OSRM/osrm-backend",
    licence: "BSD 2-Clause",
    description:
      "Routing engine used to generate turn-by-turn navigation routes.",
  },
  {
    name: "MapLibre GL JS",
    url: "https://github.com/maplibre/maplibre-gl-js",
    licence: "BSD 3-Clause",
    description: "Open-source map rendering library for interactive maps.",
  },
  {
    name: "PMTiles",
    url: "https://github.com/protomaps/PMTiles",
    licence: "BSD 3-Clause",
    description:
      "Single-file tile archive format enabling offline map tile storage.",
  },
  {
    name: "Protomaps Basemaps",
    url: "https://protomaps.com",
    licence: "BSD 3-Clause / CC BY 4.0",
    description: "Basemap style and tile generation for OpenStreetMap data.",
  },
  {
    name: "Next.js",
    url: "https://github.com/vercel/next.js",
    licence: "MIT",
    description: "React framework used for the application frontend.",
  },
  {
    name: "Capacitor",
    url: "https://github.com/ionic-team/capacitor",
    licence: "MIT",
    description:
      "Cross-platform native runtime enabling iOS and Android deployment.",
  },
  {
    name: "React",
    url: "https://github.com/facebook/react",
    licence: "MIT",
    description: "UI component library.",
  },
  {
    name: "Supabase",
    url: "https://github.com/supabase/supabase",
    licence: "Apache 2.0",
    description:
      "Authentication and real-time database used for account management and plan syncing.",
  },
  {
    name: "PostGIS",
    url: "https://postgis.net",
    licence: "GPL 2.0",
    description:
      "Spatial database extension for PostgreSQL, used for corridor extraction and spatial queries.",
  },
  {
    name: "PostgreSQL",
    url: "https://www.postgresql.org",
    licence: "PostgreSQL Licence",
    description: "Relational database used for backend data storage.",
  },
  {
    name: "Polyline",
    url: "https://github.com/mapbox/polyline",
    licence: "BSD 3-Clause",
    description: "Polyline encoding/decoding for route geometry.",
  },
  {
    name: "Bureau of Meteorology (BOM)",
    url: "http://www.bom.gov.au",
    licence: "Creative Commons BY 3.0 AU",
    description:
      "Weather warnings and hazard data. © Commonwealth of Australia, Bureau of Meteorology.",
  },
  {
    name: "Australian State Traffic & Hazard Feeds",
    url: "https://www.data.gov.au",
    licence: "Creative Commons BY 4.0",
    description:
      "Traffic event, road closure, and hazard data from QLD TMR, TfNSW, VicRoads, DIT SA, Main Roads WA, and NT Government. © respective state and territory governments.",
  },
  {
    name: "SRTM Elevation Data",
    url: "https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm-1",
    licence: "Public Domain",
    description:
      "Shuttle Radar Topography Mission elevation data used for elevation profiles and fuel calculations. Courtesy of NASA / USGS.",
  },
];

export default function AttributionsContent() {
  return (
    <>
      <h1 className={s.pageTitle}>Open Source Attributions</h1>
      <p className={s.effectiveDate}>
        Roam is built on the shoulders of open-source communities
      </p>

      <section className={s.section}>
        <p className={s.text}>
          Roam uses the following open-source software, open data, and public
          data sources. We are grateful to the developers, contributors, and
          organisations that make these resources available.
        </p>
        <p className={s.text}>
          If you believe we have inadvertently omitted an attribution or
          incorrectly stated a licence, please{" "}
          <a href="/contact" className={s.link}>
            contact us
          </a>{" "}
          and we will correct it promptly.
        </p>
      </section>

      <hr className={s.divider} />

      {ATTRIBUTIONS.map((attr, i) => (
        <section key={attr.name} className={s.section}>
          <h2 className={s.sectionTitle}>{attr.name}</h2>
          <p className={s.text}>{attr.description}</p>
          <p className={s.text}>
            <strong>Licence:</strong> {attr.licence}
            {" · "}
            <a
              href={attr.url}
              className={s.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Project website ↗
            </a>
          </p>
          {i < ATTRIBUTIONS.length - 1 && <hr className={s.divider} />}
        </section>
      ))}

      <hr className={s.divider} />

      <section className={s.section}>
        <h2 className={s.sectionTitle}>Additional Notice</h2>
        <p className={s.text}>
          This list covers the primary open-source components and data sources.
          Roam also uses numerous smaller libraries and dependencies, each
          governed by their respective open-source licences (primarily MIT,
          BSD, and Apache 2.0). A complete list of dependencies and their
          licences is available in the application&apos;s source repository.
        </p>
        <div className={s.highlight}>
          <p>
            If you are an open-source maintainer and believe Roam is using your
            work in a way that does not comply with your licence terms, please{" "}
            <a href="/contact" className={s.link}>
              contact us immediately
            </a>
            . We take licence compliance seriously and will address any
            concerns promptly.
          </p>
        </div>
      </section>
    </>
  );
}
