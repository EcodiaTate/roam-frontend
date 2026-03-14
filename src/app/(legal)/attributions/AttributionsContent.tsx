"use client";

import s from "../legal.module.css";
import LegalNav from "../LegalNav";

interface Attribution {
  name: string;
  url: string;
  licence: string;
  description: string;
}

interface AttributionGroup {
  title: string;
  entries: Attribution[];
}

const ATTRIBUTION_GROUPS: AttributionGroup[] = [
  {
    title: "Mapping & Navigation",
    entries: [
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
        description:
          "Open-source map rendering library for interactive maps.",
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
        description:
          "Basemap style and tile generation for OpenStreetMap data.",
      },
      {
        name: "Mapbox Geocoding API",
        url: "https://www.mapbox.com",
        licence: "Proprietary (Mapbox ToS)",
        description:
          "Forward geocoding for place name search and location lookup. © Mapbox.",
      },
      {
        name: "Overpass API",
        url: "https://overpass-api.de",
        licence: "ODbL 1.0 (data), AGPL 3.0 (software)",
        description:
          "Query interface for OpenStreetMap data, used to retrieve points of interest along routes.",
      },
      {
        name: "Polyline",
        url: "https://github.com/mapbox/polyline",
        licence: "BSD 3-Clause",
        description: "Polyline encoding/decoding for route geometry.",
      },
      {
        name: "What3Words",
        url: "https://what3words.com",
        licence: "Proprietary (What3Words ToS)",
        description:
          "Three-word location addressing system for precise, easy-to-share location references.",
      },
    ],
  },
  {
    title: "Elevation & Terrain",
    entries: [
      {
        name: "SRTM Elevation Data",
        url: "https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm-1",
        licence: "Public Domain",
        description:
          "Shuttle Radar Topography Mission elevation data used for elevation profiles and fuel calculations. Courtesy of NASA / USGS.",
      },
      {
        name: "Open-Elevation API",
        url: "https://open-elevation.com",
        licence: "LGPL 2.1 (software), Public Domain (data)",
        description:
          "Open-source elevation lookup service used to fetch elevation samples along routes.",
      },
    ],
  },
  {
    title: "Australian Government Data",
    entries: [
      {
        name: "Bureau of Meteorology (BOM)",
        url: "http://www.bom.gov.au",
        licence: "Creative Commons BY 3.0 AU",
        description:
          "Weather warnings and hazard data for all Australian states and territories. © Commonwealth of Australia, Bureau of Meteorology.",
      },
      {
        name: "Digital Earth Australia — Geoscience Australia",
        url: "https://hotspots.dea.ga.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Real-time satellite-detected fire hotspot data (MODIS, HIMAWARI-9, VIIRS, AQUA) for bushfire awareness across Australia. © Commonwealth of Australia, Geoscience Australia.",
      },
      {
        name: "Queensland Department of Transport and Main Roads",
        url: "https://www.qld.gov.au/transport",
        licence: "Creative Commons BY 4.0",
        description:
          "Real-time traffic events, incidents, roadworks, and closures for Queensland via the QLD Traffic API. © Queensland Government.",
      },
      {
        name: "Queensland Government — Disaster & Emergency Alerts",
        url: "https://www.disaster.qld.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Storm, flood, cyclone warnings and emergency alerts in CAP-AU format. © Queensland Government.",
      },
      {
        name: "Transport for NSW",
        url: "https://opendata.transport.nsw.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Live traffic hazard feeds including incidents, fires, floods, roadworks, and alpine conditions for New South Wales. © NSW Government.",
      },
      {
        name: "NSW Rural Fire Service",
        url: "https://www.rfs.nsw.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Major fire incident data for New South Wales. © NSW Rural Fire Service.",
      },
      {
        name: "VicRoads — Department of Transport and Planning",
        url: "https://data-exchange.vicroads.vic.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Planned and unplanned traffic disruptions and emergency road closures for Victoria. © Victorian Government.",
      },
      {
        name: "Emergency Victoria",
        url: "https://www.emergency.vic.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Emergency incident data including fires, floods, and other hazards for Victoria. © Victorian Government.",
      },
      {
        name: "South Australia — Department for Infrastructure and Transport",
        url: "https://data.sa.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Road event data for South Australia. © Government of South Australia.",
      },
      {
        name: "South Australia Country Fire Service",
        url: "https://www.cfs.sa.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Current fire and emergency incident data for South Australia. © SA Country Fire Service.",
      },
      {
        name: "Main Roads Western Australia",
        url: "https://www.mainroads.wa.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Road incident data via ArcGIS services for Western Australia. © Government of Western Australia.",
      },
      {
        name: "WA Department of Fire and Emergency Services (DFES)",
        url: "https://www.dfes.wa.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Emergency incident and warning data for Western Australia. © Government of Western Australia.",
      },
      {
        name: "Northern Territory Government",
        url: "https://roadreport.nt.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Road obstructions and outback road condition data for the Northern Territory. © Northern Territory Government.",
      },
      {
        name: "Tasmania — TheList (DPIPWE)",
        url: "https://www.thelist.tas.gov.au",
        licence: "Creative Commons BY 4.0",
        description:
          "Emergency management incident data for Tasmania via ArcGIS services. © Tasmanian Government.",
      },
    ],
  },
  {
    title: "AI & Search Services",
    entries: [
      {
        name: "DeepSeek",
        url: "https://www.deepseek.com",
        licence: "Proprietary (DeepSeek ToS)",
        description:
          "Large language model API powering the Roam Guide for trip planning suggestions, local knowledge, and route recommendations.",
      },
      {
        name: "Tavily",
        url: "https://tavily.com",
        licence: "Proprietary (Tavily ToS)",
        description:
          "Web search API providing the Roam Guide with up-to-date information on road conditions, local events, and regional knowledge.",
      },
      {
        name: "Google Custom Search",
        url: "https://programmablesearchengine.google.com",
        licence: "Proprietary (Google ToS)",
        description:
          "Web search fallback providing supplementary search results for the Roam Guide. © Google.",
      },
    ],
  },
  {
    title: "Payments & Billing",
    entries: [
      {
        name: "Stripe",
        url: "https://stripe.com",
        licence: "Proprietary (Stripe ToS)",
        description:
          "Payment processing for Roam Untethered web purchases.",
      },
      {
        name: "RevenueCat",
        url: "https://www.revenuecat.com",
        licence: "Proprietary (RevenueCat ToS)",
        description:
          "Cross-platform in-app purchase management for iOS and Android, handling billing and entitlement syncing.",
      },
    ],
  },
  {
    title: "Infrastructure & Backend",
    entries: [
      {
        name: "Supabase",
        url: "https://github.com/supabase/supabase",
        licence: "Apache 2.0",
        description:
          "Authentication, real-time database, and object storage used for account management, plan syncing, and tile hosting.",
      },
      {
        name: "PostgreSQL",
        url: "https://www.postgresql.org",
        licence: "PostgreSQL Licence",
        description: "Relational database used for backend data storage.",
      },
      {
        name: "PostGIS",
        url: "https://postgis.net",
        licence: "GPL 2.0",
        description:
          "Spatial database extension for PostgreSQL, used for corridor extraction and spatial queries.",
      },
    ],
  },
  {
    title: "Application Frameworks & Libraries",
    entries: [
      {
        name: "Next.js",
        url: "https://github.com/vercel/next.js",
        licence: "MIT",
        description: "React framework used for the application frontend.",
      },
      {
        name: "React",
        url: "https://github.com/facebook/react",
        licence: "MIT",
        description: "UI component library.",
      },
      {
        name: "Capacitor",
        url: "https://github.com/ionic-team/capacitor",
        licence: "MIT",
        description:
          "Cross-platform native runtime enabling iOS and Android deployment.",
      },
    ],
  },
];

export default function AttributionsContent() {
  return (
    <>
      <LegalNav activePath="/attributions" />
      <div className="rl-legal-content">
      <h1 className={s.pageTitle}>Open Source Attributions</h1>
      <p className={s.effectiveDate}>
        Roam is built on the shoulders of open-source communities
      </p>

      <section className={s.section}>
        <p className={s.text}>
          Roam uses the following open-source software, open data, public data
          sources, and third-party services. We are grateful to the developers,
          contributors, and organisations that make these resources available.
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

      {ATTRIBUTION_GROUPS.map((group) => (
        <div key={group.title}>
          <hr className={s.divider} />
          <h2 className={s.sectionTitle}>{group.title}</h2>
          {group.entries.map((attr, i) => (
            <section key={attr.name} className={s.section}>
              <h3 className={s.subsectionTitle}>{attr.name}</h3>
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
                  Website ↗
                </a>
              </p>
            </section>
          ))}
        </div>
      ))}

      <hr className={s.divider} />

      <section className={s.section}>
        <h2 className={s.sectionTitle}>Additional Notice</h2>
        <p className={s.text}>
          This list covers the primary components, data sources, and services.
          Roam also uses numerous smaller libraries and dependencies, each
          governed by their respective open-source licences (primarily MIT, BSD,
          and Apache 2.0). A complete list of dependencies and their licences is
          available in the application&apos;s source repository.
        </p>
        <p className={s.text}>
          Australian Government data is used in accordance with the Creative
          Commons Attribution licence terms. Traffic, hazard, and weather data
          is sourced from official government feeds and may be subject to change
          without notice.
        </p>
        <div className={s.highlight}>
          <p>
            If you are an open-source maintainer or data provider and believe
            Roam is using your work in a way that does not comply with your
            licence terms, please{" "}
            <a href="/contact" className={s.link}>
              contact us immediately
            </a>
            . We take licence compliance seriously and will address any concerns
            promptly.
          </p>
        </div>
      </section>
      </div>
    </>
  );
}
