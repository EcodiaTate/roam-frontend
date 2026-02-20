"use client";

import s from "../legal.module.css";

export default function TermsContent() {
  return (
    <>
      <h1 className={s.pageTitle}>Terms and Conditions</h1>
      <p className={s.effectiveDate}>
        Effective 1 March 2026 · Last updated 20 February 2026
      </p>

      {/* ── Intro ──────────────────────────────────── */}
      <section className={s.section}>
        <p className={s.text}>
          These Terms and Conditions (&quot;Terms&quot;) govern your use of the
          Roam navigation application and all associated services (the
          &quot;Service&quot;), operated by Ecodia Pty Ltd (ABN: 89693123278), a
          company registered in Queensland, Australia (&quot;we&quot;,
          &quot;us&quot;, &quot;our&quot;).
        </p>
        <p className={s.text}>
          By downloading, installing, or using Roam, you agree to be bound by
          these Terms. If you do not agree, do not use the Service.
        </p>
        <div className={s.highlight}>
          <p>
            <strong>Important safety notice:</strong> Roam is a navigation aid.
            It is not a substitute for your own judgment, local knowledge,
            current road signage, or official road authority instructions.
            Always drive safely and obey posted signs and conditions.
          </p>
        </div>
      </section>

      <hr className={s.divider} />

      {/* ── 1  The Service ──────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>1. About the Service</h2>
        <p className={s.text}>
          Roam provides trip planning, turn-by-turn navigation, offline mapping,
          fuel range estimation, hazard awareness, fatigue monitoring, and
          related tools designed for driving in Australia, particularly in
          remote and outback regions.
        </p>
        <p className={s.text}>
          The Service is provided on an &quot;as is&quot; and &quot;as
          available&quot; basis. We continuously work to improve accuracy and
          reliability, but we cannot guarantee that the Service will be
          uninterrupted, error-free, or that all information will be accurate at
          all times.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 2  Eligibility ──────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>2. Eligibility</h2>
        <p className={s.text}>
          You must be at least 16 years of age to create an account and use the
          Service. By using Roam, you represent that you meet this age
          requirement. If you are under 18, you represent that you have the
          consent of a parent or legal guardian.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 3  Accounts ─────────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>3. Your Account</h2>
        <p className={s.text}>
          You may use some features of Roam without an account. Creating an
          account enables trip syncing, plan sharing, and collaboration
          features.
        </p>
        <ul className={s.list}>
          <li>
            You are responsible for maintaining the confidentiality of your
            account credentials.
          </li>
          <li>
            You are responsible for all activity that occurs under your account.
          </li>
          <li>
            You agree to provide accurate and complete information when creating
            your account.
          </li>
          <li>
            We may suspend or terminate your account if we reasonably believe
            you have violated these Terms.
          </li>
        </ul>
      </section>

      <hr className={s.divider} />

      {/* ── 4  Safety & Navigation Disclaimers ──────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>
          4. Navigation Safety &amp; Disclaimers
        </h2>
        <p className={s.text}>
          This section is critical. Please read it carefully.
        </p>

        <h3 className={s.subsectionTitle}>4.1 Navigation data accuracy</h3>
        <p className={s.text}>
          Routes, directions, estimated times, distances, and other navigation
          data are generated using third-party mapping and routing engines
          (including OpenStreetMap data and OSRM). This data may be incomplete,
          inaccurate, or outdated. Roads may be closed, conditions may have
          changed, or routes may pass through unsuitable terrain.
        </p>

        <h3 className={s.subsectionTitle}>4.2 Hazard and traffic alerts</h3>
        <p className={s.text}>
          Hazard warnings, traffic alerts, road closures, and flood information
          are sourced from Australian state government feeds (QLD, NSW, VIC, SA,
          WA, NT) and the Bureau of Meteorology. These feeds may have delays,
          gaps, or inaccuracies. The absence of an alert in Roam does not mean a
          road is safe.
        </p>
        <div className={s.highlight}>
          <p>
            <strong>Always check official sources</strong> before travelling in
            remote areas. Roam supplements but does not replace official road
            condition reports from state road authorities.
          </p>
        </div>

        <h3 className={s.subsectionTitle}>4.3 Fuel range estimates</h3>
        <p className={s.text}>
          Fuel range calculations, fuel station availability, and fuel gap
          warnings are estimates only. Actual fuel consumption varies depending
          on vehicle condition, load, driving style, terrain, weather, and other
          factors. Fuel station data may be outdated — stations may be
          permanently closed, temporarily unavailable, or have limited fuel
          types. Always carry sufficient fuel reserves when travelling in remote
          areas, and never rely solely on Roam for fuel planning.
        </p>

        <h3 className={s.subsectionTitle}>4.4 Fatigue monitoring</h3>
        <p className={s.text}>
          Fatigue alerts are based on estimated driving time and speed data.
          They are general reminders, not medical advice. Individual fatigue
          varies based on sleep quality, health, medication, and many other
          factors. You are solely responsible for assessing your own fitness to
          drive.
        </p>

        <h3 className={s.subsectionTitle}>4.5 Offline limitations</h3>
        <p className={s.text}>
          When used offline, Roam relies on previously cached data. This data
          may become stale. Cached traffic alerts, road conditions, and fuel
          station availability may no longer be accurate. Offline rerouting is
          only available within pre-downloaded corridor areas. Roam will clearly
          indicate when data is stale or when features are limited due to
          offline operation.
        </p>

        <h3 className={s.subsectionTitle}>4.6 Elevation data</h3>
        <p className={s.text}>
          Elevation profiles and grade-adjusted fuel calculations use publicly
          available elevation models (SRTM / Open-Elevation). These have
          inherent accuracy limitations and may not reflect recent terrain
          changes.
        </p>

        <h3 className={s.subsectionTitle}>4.7 Your responsibility</h3>
        <p className={s.text}>You acknowledge and agree that:</p>
        <ul className={s.list}>
          <li>
            Roam is a navigation aid, not a definitive source of road
            information.
          </li>
          <li>
            You must always obey posted road signs, local laws, and the
            directions of emergency services or road authorities.
          </li>
          <li>
            You should not interact with the Roam interface while driving. Use
            voice guidance and set your route before departing.
          </li>
          <li>
            You are solely responsible for your own safety, the safety of your
            passengers, and the safe operation of your vehicle.
          </li>
          <li>
            You should carry paper maps, sufficient water, fuel reserves, and
            emergency supplies when travelling in remote Australian areas.
          </li>
        </ul>
      </section>

      <hr className={s.divider} />

      {/* ── 5  Acceptable Use ───────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>5. Acceptable Use</h2>
        <p className={s.text}>You agree not to:</p>
        <ul className={s.list}>
          <li>
            Use the Service for any unlawful purpose or in violation of any
            applicable Australian federal, state, or territory law.
          </li>
          <li>
            Reverse-engineer, decompile, or disassemble the Service or attempt
            to extract source code.
          </li>
          <li>
            Scrape, harvest, or systematically extract data from the Service or
            its APIs.
          </li>
          <li>
            Interfere with or disrupt the Service, servers, or networks
            connected to the Service.
          </li>
          <li>
            Impersonate another person or entity, or falsify your identity.
          </li>
          <li>Use the Service to create a competing product or service.</li>
          <li>
            Share your account credentials or allow others to access your
            account.
          </li>
          <li>Upload or transmit viruses, malware, or other harmful code.</li>
        </ul>
      </section>

      <hr className={s.divider} />

      {/* ── 6  Intellectual Property ─────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>6. Intellectual Property</h2>

        <h3 className={s.subsectionTitle}>6.1 Our property</h3>
        <p className={s.text}>
          The Roam application, including its design, code, algorithms,
          branding, icons, UI components, and documentation, is the intellectual
          property of Ecodia Pty Ltd and is protected by Australian and
          international copyright, trademark, and intellectual property laws.
        </p>

        <h3 className={s.subsectionTitle}>6.2 Open-source components</h3>
        <p className={s.text}>
          Roam uses open-source software components including but not limited to
          Next.js, MapLibre GL JS, OSRM, PMTiles, and Capacitor. These
          components are subject to their respective open-source licences. Our
          use of open-source software does not affect your rights under those
          licences.
        </p>

        <h3 className={s.subsectionTitle}>6.3 Map data</h3>
        <p className={s.text}>
          Map data is derived from{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            className={s.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenStreetMap
          </a>{" "}
          contributors, available under the Open Data Commons Open Database
          Licence (ODbL). Map tiles are generated from this data and are
          provided for use within Roam only.
        </p>

        <h3 className={s.subsectionTitle}>6.4 Your content</h3>
        <p className={s.text}>
          You retain ownership of any content you create in Roam (trip plans,
          notes, etc.). By using the sharing features, you grant us a limited
          licence to transmit and display your shared content to the intended
          recipients.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 7  Limitation of Liability ──────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>7. Limitation of Liability</h2>

        <h3 className={s.subsectionTitle}>7.1 Australian Consumer Law</h3>
        <p className={s.text}>
          Nothing in these Terms excludes, restricts, or modifies any consumer
          guarantee, right, or remedy conferred on you by the{" "}
          <em>Competition and Consumer Act 2010</em> (Cth), Schedule 2
          (Australian Consumer Law), or any other applicable Australian law that
          cannot be excluded, restricted, or modified by agreement.
        </p>

        <h3 className={s.subsectionTitle}>7.2 Limitation where permitted</h3>
        <p className={s.text}>
          To the maximum extent permitted by law, and subject to Section 7.1:
        </p>
        <ul className={s.list}>
          <li>
            We are not liable for any indirect, incidental, special,
            consequential, or punitive damages arising out of or related to your
            use of the Service.
          </li>
          <li>
            We are not liable for any loss, damage, injury, or death arising
            from your reliance on navigation data, fuel estimates, hazard
            alerts, fatigue monitoring, or any other information provided by the
            Service.
          </li>
          <li>
            We are not liable for any loss or damage arising from circumstances
            beyond our reasonable control, including but not limited to natural
            disasters, road condition changes, government data feed outages,
            device failures, or loss of connectivity.
          </li>
          <li>
            Our total aggregate liability to you for all claims arising from
            your use of the Service shall not exceed AUD $100 or the amount you
            have paid us in the 12 months preceding the claim, whichever is
            greater.
          </li>
        </ul>

        <h3 className={s.subsectionTitle}>7.3 SOS feature disclaimer</h3>
        <p className={s.text}>
          If Roam includes an SOS or emergency feature, it is provided as a
          convenience tool only. It is not a substitute for calling 000
          (Australian emergency services) or 112 (international emergency
          number). We do not guarantee that SOS features will function in all
          areas, particularly in areas without cellular coverage. You must
          always have an independent means of contacting emergency services when
          travelling in remote areas (e.g., satellite communicator, EPIRB, or
          PLB).
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 8  Indemnity ────────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>8. Indemnity</h2>
        <p className={s.text}>
          To the maximum extent permitted by law, you agree to indemnify,
          defend, and hold harmless Ecodia Pty Ltd and its directors, officers,
          employees, and agents from and against any claims, liabilities,
          damages, losses, costs, or expenses (including reasonable legal fees)
          arising out of or related to:
        </p>
        <ul className={s.list}>
          <li>Your use of the Service in violation of these Terms.</li>
          <li>Your breach of any applicable law while using the Service.</li>
          <li>
            Any third-party claim arising from your use of the Service,
            including claims related to your driving or navigation decisions.
          </li>
        </ul>
      </section>

      <hr className={s.divider} />

      {/* ── 9  Service Availability ─────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>
          9. Service Availability &amp; Changes
        </h2>
        <p className={s.text}>
          We reserve the right to modify, suspend, or discontinue any part of
          the Service at any time, with or without notice. We will endeavour to
          provide reasonable notice of material changes that affect your use of
          the Service.
        </p>
        <p className={s.text}>
          Offline functionality will continue to work with previously cached
          data even if our servers are unavailable. However, new route
          generation, plan syncing, and alert updates require server
          connectivity.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 10  Plan Sharing & Collaboration ────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>10. Plan Sharing &amp; Collaboration</h2>
        <p className={s.text}>
          Roam allows you to share trip plans with other users via invite codes.
          When you share a plan:
        </p>
        <ul className={s.list}>
          <li>
            Collaborators can view and, where permitted, edit the shared plan.
          </li>
          <li>
            You are responsible for who you share your plans with. Invite codes
            should be shared only with trusted individuals.
          </li>
          <li>
            We are not responsible for any actions taken by collaborators on
            shared plans.
          </li>
          <li>
            You can revoke access to a shared plan at any time by deleting the
            plan or regenerating the invite code.
          </li>
        </ul>
      </section>

      <hr className={s.divider} />

      {/* ── 11  Third-Party Data & Services ─────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>11. Third-Party Data &amp; Services</h2>
        <p className={s.text}>
          Roam incorporates data and services from third parties, including
          OpenStreetMap, Australian government traffic and hazard feeds, weather
          services, and elevation data providers. We do not control and are not
          responsible for the accuracy, completeness, timeliness, or
          availability of third-party data.
        </p>
        <p className={s.text}>
          Third-party services are subject to their own terms of use and privacy
          policies. Your use of Roam constitutes acceptance of the terms of
          these third-party services to the extent they apply to data displayed
          within Roam.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 12  Termination ─────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>12. Termination</h2>
        <p className={s.text}>
          You may stop using the Service at any time by uninstalling the app
          and, if applicable, requesting account deletion.
        </p>
        <p className={s.text}>
          We may suspend or terminate your access to the Service if you violate
          these Terms or if we are required to do so by law. Upon termination,
          your right to use the Service ceases immediately, but locally stored
          data on your device remains yours.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 13  Governing Law ───────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>13. Governing Law &amp; Disputes</h2>
        <p className={s.text}>
          These Terms are governed by the laws of Queensland, Australia. Any
          dispute arising from these Terms or your use of the Service shall be
          subject to the exclusive jurisdiction of the courts of Queensland,
          Australia, subject to any overriding rights you may have under
          Australian Consumer Law.
        </p>
        <p className={s.text}>
          Before commencing any formal legal proceedings, you agree to attempt
          to resolve any dispute with us in good faith by contacting us at{" "}
          <a href="mailto:tate@ecodia.au" className={s.link}>
            tate@ecodia.au
          </a>
          .
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 14  Severability ────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>14. General Provisions</h2>

        <h3 className={s.subsectionTitle}>14.1 Severability</h3>
        <p className={s.text}>
          If any provision of these Terms is found to be invalid or
          unenforceable, the remaining provisions will continue in full force
          and effect.
        </p>

        <h3 className={s.subsectionTitle}>14.2 Entire agreement</h3>
        <p className={s.text}>
          These Terms, together with our{" "}
          <a href="/privacy" className={s.link}>
            Privacy Policy
          </a>
          , constitute the entire agreement between you and us regarding the
          Service.
        </p>

        <h3 className={s.subsectionTitle}>14.3 No waiver</h3>
        <p className={s.text}>
          Our failure to enforce any right or provision of these Terms shall not
          constitute a waiver of that right or provision.
        </p>

        <h3 className={s.subsectionTitle}>14.4 Assignment</h3>
        <p className={s.text}>
          You may not assign or transfer your rights under these Terms. We may
          assign our rights and obligations to a successor entity in the event
          of a merger, acquisition, or sale of assets, provided the successor
          agrees to honour these Terms.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 15  Changes ─────────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>15. Changes to These Terms</h2>
        <p className={s.text}>
          We may update these Terms from time to time. Material changes will be
          communicated via in-app notification or email. Continued use of the
          Service after changes take effect constitutes acceptance of the
          revised Terms.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 16  Contact ─────────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>16. Contact</h2>
        <p className={s.text}>
          For questions about these Terms, please contact:
        </p>
        <ul className={s.list}>
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:tate@ecodia.au" className={s.link}>
              tate@ecodia.au
            </a>
          </li>
          <li>
            <strong>In-app:</strong>{" "}
            <a href="/contact" className={s.link}>
              Contact page
            </a>
          </li>
          <li>
            <strong>Entity:</strong> Ecodia Pty Ltd, Brisbane, Queensland,
            Australia
          </li>
        </ul>
      </section>
    </>
  );
}
