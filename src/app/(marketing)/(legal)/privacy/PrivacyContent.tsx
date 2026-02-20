"use client";

import s from "../legal.module.css";

export default function PrivacyContent() {
  return (
    <>
      <h1 className={s.pageTitle}>Privacy Policy</h1>
      <p className={s.effectiveDate}>
        Effective 1 March 2026 · Last updated 20 February 2026
      </p>

      {/* ── Intro ────────────────────────────────────── */}
      <section className={s.section}>
        <p className={s.text}>
          Roam is operated by Ecodia Pty Ltd (ABN: 89693123278), a company
          registered in Queensland, Australia (&quot;we&quot;, &quot;us&quot;,
          &quot;our&quot;). We are committed to protecting your privacy in
          accordance with the <em>Privacy Act 1988</em> (Cth) and the Australian
          Privacy Principles (APPs).
        </p>
        <p className={s.text}>
          This policy explains what personal information we collect, why we
          collect it, how we use and store it, and what rights you have. It
          applies to the Roam mobile application, the roam web application, and
          any associated APIs and services (collectively, the
          &quot;Service&quot;).
        </p>
        <div className={s.highlight}>
          <p>
            <strong>Roam is built offline-first.</strong> The vast majority of
            your data — routes, maps, trip plans, fuel calculations — is stored
            locally on your device and never transmitted to our servers unless
            you explicitly choose to sync or share.
          </p>
        </div>
      </section>

      <hr className={s.divider} />

      {/* ── 1  Information We Collect ────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>1. Information We Collect</h2>

        <h3 className={s.subsectionTitle}>1.1 Information you provide</h3>
        <ul className={s.list}>
          <li>
            <strong>Account information:</strong> Email address, display name,
            and authentication credentials when you create an account.
          </li>
          <li>
            <strong>Trip plans:</strong> Origin/destination points, waypoints,
            stop preferences, vehicle fuel profile, and trip notes you enter.
          </li>
          <li>
            <strong>Contact submissions:</strong> Name, email, and message
            content when you contact us through the in-app contact form.
          </li>
          <li>
            <strong>Feedback and support:</strong> Any information you
            voluntarily provide when reporting bugs, requesting features, or
            corresponding with us.
          </li>
        </ul>

        <h3 className={s.subsectionTitle}>
          1.2 Information collected automatically
        </h3>
        <ul className={s.list}>
          <li>
            <strong>Location data:</strong> GPS coordinates, speed, heading, and
            accuracy when you use navigation features. See Section 3 for
            detailed location data handling.
          </li>
          <li>
            <strong>Device information:</strong> Device model, operating system
            version, app version, screen resolution, and unique device
            identifiers for crash reporting.
          </li>
          <li>
            <strong>Usage analytics:</strong> Feature usage patterns, navigation
            session durations, route types, and crash/error logs. These are
            collected in aggregate and are not tied to your identity.
          </li>
          <li>
            <strong>Network status:</strong> Whether your device is online or
            offline (used to determine data sync availability, not tracked or
            stored).
          </li>
        </ul>

        <h3 className={s.subsectionTitle}>1.3 Information we do NOT collect</h3>
        <ul className={s.list}>
          <li>We do not collect biometric data (fingerprint, face ID).</li>
          <li>
            We do not access your contacts, photos, or other personal files.
          </li>
          <li>We do not record audio from voice guidance sessions.</li>
          <li>
            We do not collect financial information — there are no in-app
            purchases. If we introduce paid features in the future, payment
            processing will be handled by Apple/Google and we will not receive
            your card details.
          </li>
          <li>We do not build advertising profiles or sell your data.</li>
        </ul>
      </section>

      <hr className={s.divider} />

      {/* ── 2  Data Collection Summary ──────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>2. Data Collection Summary</h2>
        <p className={s.text}>
          The following table summarises what we collect, where it is stored,
          and the legal basis under the APPs:
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className={s.dataTable}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Stored</th>
                <th>Purpose</th>
                <th>APP Basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GPS position (live)</td>
                <td>Device only</td>
                <td>Turn-by-turn navigation, fatigue tracking</td>
                <td>APP 3.3 — necessary for service</td>
              </tr>
              <tr>
                <td>Trip plans</td>
                <td>Device + optional cloud sync</td>
                <td>Route planning, offline navigation</td>
                <td>APP 3.3 — core functionality</td>
              </tr>
              <tr>
                <td>Route requests</td>
                <td>Server (transient)</td>
                <td>Generate navigation route via OSRM</td>
                <td>APP 3.3 — necessary for service</td>
              </tr>
              <tr>
                <td>Account email</td>
                <td>Server (Supabase Auth)</td>
                <td>Authentication, plan sharing</td>
                <td>APP 3.3 — account functionality</td>
              </tr>
              <tr>
                <td>Device info</td>
                <td>Server (crash reporting)</td>
                <td>Bug fixing, stability</td>
                <td>APP 3.3 — service improvement</td>
              </tr>
              <tr>
                <td>Aggregate analytics</td>
                <td>Server (anonymised)</td>
                <td>Feature prioritisation</td>
                <td>APP 3.3 — legitimate interest</td>
              </tr>
              <tr>
                <td>Contact form submissions</td>
                <td>Email (FormSubmit)</td>
                <td>Support &amp; enquiries</td>
                <td>APP 3.3 — you initiated contact</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <hr className={s.divider} />

      {/* ── 3  Location Data ───────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>3. Location Data — Detailed Handling</h2>
        <p className={s.text}>
          Location data is central to Roam&apos;s navigation functionality. We
          treat it with the highest level of care.
        </p>

        <h3 className={s.subsectionTitle}>3.1 When location is used</h3>
        <ul className={s.list}>
          <li>
            <strong>Active navigation:</strong> GPS coordinates are read in
            real-time to provide turn-by-turn guidance, off-route detection,
            fatigue monitoring, and fuel range calculations.
          </li>
          <li>
            <strong>Background tracking:</strong> When you tap &quot;Start
            Navigation&quot;, Roam requests background location permission so
            navigation continues when the screen is off. You can revoke this at
            any time in your device settings.
          </li>
          <li>
            <strong>Map display:</strong> Your current location is shown on the
            map when location permission is granted.
          </li>
        </ul>

        <h3 className={s.subsectionTitle}>3.2 Where location data is stored</h3>
        <div className={s.highlight}>
          <p>
            <strong>
              Your GPS position is processed on-device and is NOT sent to our
              servers.
            </strong>{" "}
            Navigation state, route matching, fatigue calculations, and fuel
            tracking all run locally on your device. We do not maintain a
            history of your locations.
          </p>
        </div>
        <p className={s.text}>
          The only time location-adjacent data leaves your device is when you
          request a new route (we send the origin/destination coordinates to our
          routing server to generate the route) or when you opt into plan
          syncing (trip plan waypoints are synced to enable sharing).
        </p>

        <h3 className={s.subsectionTitle}>
          3.3 No location tracking or history
        </h3>
        <p className={s.text}>
          Roam does not store a breadcrumb trail of your past positions. We do
          not build movement profiles. We do not sell, share, or monetise
          location data. When you end navigation, all live position data is
          discarded from memory.
        </p>

        <h3 className={s.subsectionTitle}>3.4 Revoking location permission</h3>
        <p className={s.text}>
          You can revoke location permission at any time through your
          device&apos;s system settings. Roam will continue to function for trip
          planning and offline map viewing, but real-time navigation and
          position display will be unavailable.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 4  Offline / On-Device Storage ──────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>4. On-Device &amp; Offline Storage</h2>
        <p className={s.text}>
          Roam stores the following data locally on your device using IndexedDB
          (a browser/app-embedded database):
        </p>
        <ul className={s.list}>
          <li>Trip plans (routes, stops, preferences)</li>
          <li>Cached navigation packs (route geometry, steps, corridors)</li>
          <li>Offline map tiles (PMTiles basemaps for Australia)</li>
          <li>Cached places data (fuel stations, rest areas)</li>
          <li>Traffic and hazard overlays (cached for offline use)</li>
          <li>Elevation profiles</li>
          <li>Offline bundles (zip archives for complete offline trips)</li>
        </ul>
        <p className={s.text}>
          This data is stored solely to enable offline functionality and is
          never transmitted to our servers unless you explicitly initiate a
          sync. You can delete all locally stored data at any time by clearing
          the app&apos;s storage in your device settings or by using the in-app
          data management options.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 5  How We Use Information ──────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>5. How We Use Your Information</h2>
        <p className={s.text}>We use your information to:</p>
        <ul className={s.list}>
          <li>Provide and operate the navigation and trip planning Service</li>
          <li>Generate routes via our OSRM-based routing engine</li>
          <li>Enable plan sharing and collaboration between trip partners</li>
          <li>
            Deliver traffic alerts, hazard warnings, and road condition data
          </li>
          <li>Calculate fuel requirements and range estimates</li>
          <li>Monitor fatigue and provide rest recommendations</li>
          <li>Diagnose and fix bugs, crashes, and performance issues</li>
          <li>
            Improve the Service based on aggregate, anonymised usage patterns
          </li>
          <li>Respond to your support enquiries and feedback</li>
          <li>Comply with legal obligations</li>
        </ul>
        <p className={s.text}>
          We will never use your personal information for purposes materially
          different from those described above without notifying you and, where
          required, obtaining your consent.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 6  Third Parties ──────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>6. Third-Party Services</h2>
        <p className={s.text}>
          Roam uses the following third-party services. We only share the
          minimum data necessary for each service to function:
        </p>
        <ul className={s.list}>
          <li>
            <strong>Supabase (Authentication &amp; Sync):</strong> Stores your
            account credentials and, if you opt in, synced trip plan data.
            Supabase processes data in accordance with their privacy policy.
            Servers are located in Australia (Sydney region) where available.
          </li>
          <li>
            <strong>OSRM (Routing Engine):</strong> Self-hosted. Receives
            coordinate pairs to generate routes. No personal information beyond
            the requested waypoints is transmitted.
          </li>
          <li>
            <strong>Australian Government Traffic &amp; Hazard Feeds:</strong>{" "}
            We fetch publicly available traffic, hazard, and road condition data
            from QLD, NSW, VIC, SA, WA, NT, and BOM feeds. No user data is sent
            to these services.
          </li>
          <li>
            <strong>FormSubmit (Contact Form):</strong> Processes contact form
            submissions and forwards them to our support email. FormSubmit does
            not store form data beyond delivery.
          </li>
          <li>
            <strong>Open-Elevation API / SRTM (Elevation Data):</strong>{" "}
            Receives coordinate samples along a route to return elevation data.
            No personal information is transmitted.
          </li>
        </ul>
        <p className={s.text}>
          We do not use any third-party advertising services, analytics
          platforms that track individual users, or data brokers.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 7  Data Sharing ───────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>7. When We Share Your Information</h2>
        <p className={s.text}>
          We do not sell, rent, or trade your personal information. We share
          information only in the following limited circumstances:
        </p>
        <ul className={s.list}>
          <li>
            <strong>Trip sharing:</strong> When you share a trip plan with
            another person via an invite code, they can see the trip plan
            details (stops, route, notes). They cannot see your location,
            account details, or other trip plans.
          </li>
          <li>
            <strong>Legal compliance:</strong> If required by Australian law, a
            court order, or a government authority with lawful jurisdiction.
          </li>
          <li>
            <strong>Safety:</strong> If we believe in good faith that disclosure
            is necessary to prevent imminent harm to a person&apos;s life,
            health, or safety.
          </li>
          <li>
            <strong>Service providers:</strong> As described in Section 6, to
            the minimum extent necessary for the Service to function.
          </li>
        </ul>
      </section>

      <hr className={s.divider} />

      {/* ── 8  Data Security ──────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>8. Data Security</h2>
        <p className={s.text}>
          We take reasonable steps to protect your information from misuse,
          interference, loss, and unauthorised access, as required by APP 11:
        </p>
        <ul className={s.list}>
          <li>All data in transit is encrypted via HTTPS/TLS.</li>
          <li>
            Authentication tokens are securely managed via Supabase Auth with
            industry-standard encryption.
          </li>
          <li>
            Backend services run on Google Cloud Run with automatic security
            patching and isolated container environments.
          </li>
          <li>
            Database access (Postgres on Fly.io) is restricted to authenticated
            backend services only.
          </li>
          <li>
            On-device data is stored in the app&apos;s sandboxed storage, which
            is protected by your device&apos;s operating system security.
          </li>
          <li>
            User authentication tokens are derived server-side — user identity
            is never transmitted in API payloads.
          </li>
        </ul>
        <p className={s.text}>
          No method of electronic transmission or storage is 100% secure. While
          we strive to protect your information, we cannot guarantee absolute
          security.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 9  Data Retention ─────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>9. Data Retention</h2>
        <ul className={s.list}>
          <li>
            <strong>On-device data:</strong> Retained until you delete it or
            uninstall the app.
          </li>
          <li>
            <strong>Account data:</strong> Retained while your account is
            active. You can request account deletion at any time (see Section
            11).
          </li>
          <li>
            <strong>Synced trip plans:</strong> Retained until you delete the
            plan or your account. Shared plans are removed from collaborators
            when deleted by the owner.
          </li>
          <li>
            <strong>Route requests:</strong> Transient — processed and discarded
            after the route is generated. We do not store a log of your
            requested routes.
          </li>
          <li>
            <strong>Crash reports and analytics:</strong> Retained for up to 12
            months in anonymised/aggregated form, then deleted.
          </li>
          <li>
            <strong>Contact form submissions:</strong> Retained in our email for
            as long as necessary to resolve your enquiry, then archived or
            deleted within 24 months.
          </li>
        </ul>
      </section>

      <hr className={s.divider} />

      {/* ── 10  Children ──────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>10. Children&apos;s Privacy</h2>
        <p className={s.text}>
          Roam is not directed at children under the age of 16. We do not
          knowingly collect personal information from children under 16. If you
          are a parent or guardian and believe your child has provided us with
          personal information, please contact us at{" "}
          <a href="mailto:tate@ecodia.au" className={s.link}>
            tate@ecodia.au
          </a>{" "}
          and we will promptly delete it.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 11  Your Rights ───────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>
          11. Your Rights Under Australian Privacy Law
        </h2>
        <p className={s.text}>Under the APPs, you have the right to:</p>
        <ul className={s.list}>
          <li>
            <strong>Access:</strong> Request a copy of the personal information
            we hold about you (APP 12).
          </li>
          <li>
            <strong>Correction:</strong> Request that we correct inaccurate or
            out-of-date personal information (APP 13).
          </li>
          <li>
            <strong>Deletion:</strong> Request deletion of your account and all
            associated data. We will comply within 30 days, except where we are
            required by law to retain certain records.
          </li>
          <li>
            <strong>Complaint:</strong> If you believe we have breached the
            APPs, you can lodge a complaint with us (see Section 13). If you are
            not satisfied with our response, you can complain to the{" "}
            <a
              href="https://www.oaic.gov.au/privacy/privacy-complaints"
              className={s.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Office of the Australian Information Commissioner (OAIC)
            </a>
            .
          </li>
        </ul>
        <p className={s.text}>
          To exercise any of these rights, contact us at{" "}
          <a href="mailto:tate@ecodia.au" className={s.link}>
            tate@ecodia.au
          </a>
          . We will respond within 30 days and may need to verify your identity
          before processing your request.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 12  International Users ────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>12. International Users</h2>
        <p className={s.text}>
          Roam is designed for use in Australia. If you access the Service from
          outside Australia, your information may be transferred to and
          processed in Australia.
        </p>
        <p className={s.text}>
          For users in the European Economic Area (EEA) or the United Kingdom:
          we process your data on the basis of legitimate interest (providing
          the Service you requested) and, where applicable, your consent. You
          may have additional rights under the GDPR, including the right to data
          portability and the right to restrict processing. Contact us to
          exercise these rights.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 13  Contact & Complaints ──────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>13. Contact &amp; Complaints</h2>
        <p className={s.text}>
          If you have questions about this privacy policy, wish to exercise your
          rights, or want to make a complaint:
        </p>
        <ul className={s.list}>
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:tate@ecodia.au" className={s.link}>
              tate@ecodia.au
            </a>
          </li>
          <li>
            <strong>In-app:</strong> Use the{" "}
            <a href="/contact" className={s.link}>
              Contact
            </a>{" "}
            page
          </li>
          <li>
            <strong>Privacy Officer:</strong> Tate, Ecodia Pty Ltd, Brisbane
            QLD, Australia
          </li>
        </ul>
        <p className={s.text}>
          We aim to acknowledge complaints within 7 days and resolve them within
          30 days. If we cannot resolve your complaint, we will explain why and
          inform you of further steps available, including escalation to the
          OAIC.
        </p>
      </section>

      <hr className={s.divider} />

      {/* ── 14  Changes ───────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>14. Changes to This Policy</h2>
        <p className={s.text}>
          We may update this privacy policy from time to time. We will notify
          you of material changes by displaying a prominent notice in the app or
          by emailing you (if we have your email). The &quot;Last updated&quot;
          date at the top of this page will be revised accordingly.
        </p>
        <p className={s.text}>
          Continued use of the Service after changes constitutes acceptance of
          the updated policy. If you do not agree with any changes, you should
          stop using the Service and delete your account.
        </p>
      </section>
    </>
  );
}
