"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import {
  Fuel,
  AlertTriangle,
  Navigation,
  Clock,
  Users,
  WifiOff,
  ArrowRight,
  ArrowDown,
  Compass,
  Menu,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Capacitor redirect — native shell goes straight to /trip            */
/* ------------------------------------------------------------------ */
function useNativeRedirect() {
  const router = useRouter();
  const [isNative, setIsNative] = useState<boolean | null>(null);
  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsNative(native);
    if (native) router.replace("/trip");
  }, [router]);
  return isNative;
}

/* ------------------------------------------------------------------ */
/* Platform detection                                                  */
/* ------------------------------------------------------------------ */
type Platform = "ios" | "android" | "desktop";

function usePlatform(): Platform {
  const [p, setP] = useState<Platform>("desktop");
  useEffect(() => {
    const ua = navigator.userAgent || "";
    if (
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    )
      setP("ios");
    else if (/android/i.test(ua)) setP("android");
  }, []);
  return p;
}

const APP_STORE = "https://apps.apple.com/au/app/roam/id000000000";
const PLAY_STORE =
  "https://play.google.com/store/apps/details?id=com.roamapp.au";

/* ------------------------------------------------------------------ */
/* Platform-aware CTA config                                           */
/* ------------------------------------------------------------------ */
function useCtaConfig(platform: Platform) {
  return useMemo(() => {
    switch (platform) {
      case "ios":
        return {
          href: APP_STORE,
          heroLabel: "Download for iPhone",
          navLabel: "Get the App",
          mobileLabel: "Download Roam",
          external: true,
        };
      case "android":
        return {
          href: PLAY_STORE,
          heroLabel: "Get it on Google Play",
          navLabel: "Get the App",
          mobileLabel: "Download Roam",
          external: true,
        };
      default:
        return {
          href: "/trip",
          heroLabel: "Open Roam",
          navLabel: "Open Roam",
          mobileLabel: "Open Roam",
          external: false,
        };
    }
  }, [platform]);
}

/** Adds target + rel for external links, nothing for internal */
function extProps(external: boolean) {
  return external
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : {};
}

/* ------------------------------------------------------------------ */
/* Brand SVGs — Apple and Google Play logos                             */
/* ------------------------------------------------------------------ */
function AppleSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 21.99 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 21.99C7.79 22.03 6.8 20.68 5.96 19.47C4.25 16.99 2.97 12.5 4.7 9.46C5.56 7.95 7.13 6.99 8.82 6.97C10.1 6.95 11.32 7.84 12.11 7.84C12.89 7.84 14.37 6.77 15.92 6.93C16.57 6.96 18.39 7.21 19.56 8.91C19.47 8.96 17.39 10.15 17.41 12.68C17.44 15.7 20.06 16.7 20.09 16.71C20.06 16.78 19.67 18.14 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
    </svg>
  );
}

function PlaySvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302a1 1 0 0 1 0 1.38l-2.302 2.302L15.396 13l2.302-2.492zM5.864 2.658L16.8 8.99l-2.302 2.303L5.864 2.658z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */
const MARQUEE_ITEMS = [
  "Brisbane → Cairns",
  "1,700 km",
  "Adelaide → Darwin",
  "3,030 km",
  "Sydney → Broken Hill",
  "1,160 km",
  "Perth → Broome",
  "2,240 km",
  "Melbourne → Alice Springs",
  "2,330 km",
  "Cairns → Darwin",
  "2,760 km",
];

const FEATURES = [
  {
    icon: WifiOff,
    num: "01",
    title: "Works without signal",
    body: "Your maps, route, fuel stops and hazard warnings all live on your phone. Drive through dead zones like they don't exist.",
  },
  {
    icon: Fuel,
    num: "02",
    title: "Never miss a servo",
    body: "See every fuel stop between here and there. Roam flags the gaps where your tank won't make it, before you're stranded.",
  },
  {
    icon: AlertTriangle,
    num: "03",
    title: "Know before you go",
    body: "Road closures, floods, fires and roadworks from every state transport authority. If something's blocking your road, you'll know about it.",
  },
  {
    icon: Navigation,
    num: "04",
    title: "Proper turn-by-turn",
    body: 'Voice directions that keep going when you lose signal. No spinning wheel, no "searching for route." Just the next turn, on time.',
  },
  {
    icon: Clock,
    num: "05",
    title: "Fatigue nudges",
    body: "Tracks your drive time and tells you where the next rest stop is. Two hours in, you'll get a gentle reminder to pull over.",
  },
  {
    icon: Users,
    num: "06",
    title: "Share with your co-pilot",
    body: "Send your trip plan to whoever's riding shotgun. Same stops, same fuel plan, same warnings. Works on both phones.",
  },
];

const STEPS = [
  {
    t: "Drop your stops",
    d: "Tell Roam where you're headed. It finds the route, every fuel station, and checks for road closures.",
  },
  {
    t: "Tap download",
    d: "One button saves your whole trip. Maps, directions, fuel plan, and warnings stay on your phone.",
  },
  {
    t: "Hit the road",
    d: "Voice directions and fatigue reminders work 100% offline. Roam handles the dead zones.",
  },
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  const isNative = useNativeRedirect();
  const platform = usePlatform();
  const cta = useCtaConfig(platform);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Close mobile menu on route change / resize
  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  // Don't render anything while checking native / if native (redirecting)
  if (isNative === null || isNative === true) return null;

  return (
    <div className="rl">
      <style>{STYLES}</style>

      {/* 01. Acknowledgement of Country */}
      <section className="rl-aoc">
        <div className="rl-inner">
          <p>
            We acknowledge the Traditional Custodians of the land on which we
            live and work, the <strong>Gubbi Gubbi</strong> people. We pay our
            respects to their Elders past and present and recognise their
            continued connection to the land, waters, and culture of this
            country.
          </p>
        </div>
      </section>

      {/* 02. Nav */}
      <nav className={`rl-nav ${scrolled ? "rl-nav-s" : ""}`}>
        <div className="rl-nav-bar">
          <a href="/" className="rl-nav-logo">
            <Compass size={22} strokeWidth={2.5} />
            <span>ROAM</span>
          </a>

          {/* Desktop links */}
          <div className="rl-nav-links">
            <a href="#features" className="rl-nav-link">Features</a>
            <a href="#how" className="rl-nav-link">How It Works</a>
            <a href="/contact" className="rl-nav-link">Contact</a>
          </div>

          <a
            href={cta.href}
            className="rl-nav-cta"
            {...extProps(cta.external)}
          >
            {cta.navLabel}
          </a>

          {/* Mobile hamburger */}
          <button
            className="rl-nav-hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="rl-nav-mobile">
            <a href="#features" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#how" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>How It Works</a>
            <a href="/contact" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>Contact</a>
            <a
              href={cta.href}
              className="rl-nav-mobile-cta"
              onClick={() => setMenuOpen(false)}
              {...extProps(cta.external)}
            >
              {cta.navLabel} <ArrowRight size={16} />
            </a>
          </div>
        )}
      </nav>

      {/* 03. Hero */}
      <section className="rl-hero">
        <div className="rl-hero-content">
          <h1 className="rl-hero-mega">ROAM</h1>
          <p className="rl-hero-tagline">
            Road trip navigation that
            <br />
            <strong>actually works</strong> out here.
          </p>
          <div className="rl-hero-actions">
            <a
              href={cta.href}
              className="rl-btn-hero"
              {...extProps(cta.external)}
            >
              {cta.heroLabel} <ArrowRight size={22} />
            </a>
            {platform === "desktop" && (
              <a href="#download" className="rl-btn-hero-alt">
                Or download the app
              </a>
            )}
          </div>
        </div>
        <a href="#problem" className="rl-hero-scroll" aria-label="Scroll down">
          <ArrowDown size={18} />
        </a>
      </section>

      {/* Marquee */}
      <div className="rl-marquee" aria-hidden="true">
        <div className="rl-marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="rl-marquee-item">
              {item}
              <span className="rl-marquee-dot">◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* 04. Problem */}
      <section className="rl-problem" id="problem">
        <div className="rl-inner">
          <div className="rl-problem-grid">
            <div className="rl-problem-text">
              <span className="rl-label">The Signal Void</span>
              <h2>Google Maps quits 50km out of town.</h2>
              <p>
                You're past Longreach. Fuel light's on. 180km to the next
                servo. Your phone says{" "}
                <strong>&ldquo;No connection&rdquo;</strong> and the map is a
                grey void.
              </p>
              <p>
                Most nav apps need the cloud. Roam downloads everything to your
                phone before you leave so it's useful the whole way.
              </p>
            </div>
            <div className="rl-problem-visual">
              <div className="rl-visual-card">
                <WifiOff size={48} strokeWidth={1.5} />
                <h3>OFFLINE</h3>
                <p>Navigation active without signal</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 05. Features */}
      <section className="rl-features" id="features">
        <div className="rl-inner">
          <div className="rl-section-header">
            <span className="rl-label">The Toolkit</span>
            <h2>Six things that keep you moving.</h2>
          </div>
          <div className="rl-features-grid">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.num} className="rl-feat-card">
                  <div className="rl-feat-top">
                    <span className="rl-feat-num">{f.num}</span>
                    <Icon className="rl-feat-icon" size={24} />
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 06. How it works */}
      <section className="rl-how" id="how">
        <div className="rl-inner">
          <div className="rl-how-grid">
            <div className="rl-how-header">
              <span className="rl-label">Workflow</span>
              <h2>
                Three steps.
                <br />
                Then drive.
              </h2>
            </div>
            <div className="rl-how-steps">
              {STEPS.map((s, i) => (
                <div key={i} className="rl-step">
                  <div className="rl-step-num">{i + 1}</div>
                  <div className="rl-step-content">
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 07. Download — platform-aware buttons */}
      <section className="rl-download" id="download">
        <div className="rl-inner">
          <div className="rl-download-card">
            <h2>Don't get stranded.</h2>
            <p>
              The outback is no place for a loading wheel. Get Roam and plan
              your first trip today.
            </p>
            <div className="rl-download-btns">
              {(platform === "ios" || platform === "desktop") && (
                <a
                  href={APP_STORE}
                  className="rl-app-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <AppleSvg />
                  <span>App Store</span>
                </a>
              )}
              {(platform === "android" || platform === "desktop") && (
                <a
                  href={PLAY_STORE}
                  className="rl-app-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <PlaySvg />
                  <span>Google Play</span>
                </a>
              )}
            </div>
            {platform === "desktop" && (
              <a href="/trip" className="rl-download-web">
                Or use Roam in your browser <ArrowRight size={14} />
              </a>
            )}
          </div>
        </div>
      </section>

      {/* 08. Footer */}
      <footer className="rl-footer">
        <div className="rl-inner">
          <div className="rl-footer-grid">
            <div className="rl-footer-left">
              <div className="rl-footer-logo">
                <Compass size={18} /> <strong>ROAM</strong>
              </div>
              <p>Road navigation for the wide brown land.</p>
            </div>
            <div className="rl-footer-right">
              <div className="rl-footer-links">
                <a href="mailto:hello@roamapp.com.au">Contact</a>
                <a href="/privacy">Privacy</a>
                <a href="/terms">Terms</a>
              </div>
            </div>
          </div>
          <div className="rl-footer-sig">
            <span className="rl-sig-text">Made by</span>
            <div className="rl-sig-box">
              <span className="rl-sig-eco">ECODIA</span>
              <span className="rl-sig-code">CODE</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile sticky CTA — platform-aware */}
      <div className="rl-mobile-cta">
        <a
          href={cta.href}
          className="rl-btn-mobile"
          {...extProps(cta.external)}
        >
          {cta.mobileLabel} <ArrowRight size={18} />
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap');

:root {
  --sand: #fcf6ef;
  --sand-dark: #f2e7d5;
  --ochre: #d46e3a;
  --burnt: #8c2f0a;
  --sky: #0ea5e9;
  --eucalypt: #4d6652;
  --text: #2a1a0f;
  --text-muted: #6b5a4e;
  --white: #ffffff;
}

/* ---- Reset + base ---- */
.rl *, .rl *::before, .rl *::after { box-sizing: border-box; margin: 0; padding: 0; }
.rl {
  background: var(--sand);
  color: var(--text);
  font-family: 'Bricolage Grotesque', sans-serif;
  overflow-x: hidden;
  -webkit-tap-highlight-color: transparent;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.rl a { color: inherit; text-decoration: none; }

.rl-inner { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

.rl-label {
  font-family: 'Syne', sans-serif;
  text-transform: uppercase; letter-spacing: 0.2em;
  font-size: 13px; color: var(--eucalypt);
  display: block; margin-bottom: 16px;
}

/* ---- 01. Acknowledgement of Country ---- */
.rl-aoc {
  background: var(--sand-dark);
  padding: 48px 24px;
  text-align: center;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.rl-aoc p {
  max-width: 660px; margin: 0 auto;
  font-size: 15px; line-height: 1.65;
  color: var(--eucalypt);
}
.rl-aoc strong { font-weight: 800; }

/* ---- 02. Nav ---- */
.rl-nav {
  position: sticky; top: 0; z-index: 1000;
  background: var(--sand);
  border-bottom: 1px solid transparent;
  transition: background 0.3s, border-color 0.3s, backdrop-filter 0.3s;
}
.rl-nav-s {
  background: rgba(252, 246, 239, 0.88);
  backdrop-filter: blur(16px);
  border-bottom-color: var(--sand-dark);
}
.rl-nav-bar {
  max-width: 1100px; margin: 0 auto;
  height: 72px; padding: 0 24px;
  display: flex; align-items: center; justify-content: space-between;
}
.rl-nav-logo {
  display: flex; align-items: center; gap: 10px;
  font-family: 'Syne', sans-serif; font-weight: 800; font-size: 22px;
  color: var(--burnt);
  transition: opacity 0.2s;
}
.rl-nav-logo:hover { opacity: 0.7; }

/* Nav links (desktop) */
.rl-nav-links {
  display: flex; align-items: center; gap: 32px;
}
.rl-nav-link {
  font-weight: 600; font-size: 15px;
  color: var(--text-muted);
  transition: color 0.2s;
  position: relative;
}
.rl-nav-link::after {
  content: '';
  position: absolute; bottom: -4px; left: 0; right: 0;
  height: 2px; background: var(--ochre);
  transform: scaleX(0);
  transition: transform 0.2s;
}
.rl-nav-link:hover { color: var(--text); }
.rl-nav-link:hover::after { transform: scaleX(1); }

.rl-nav-cta {
  font-weight: 800; font-size: 15px;
  color: var(--ochre);
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-thickness: 2px;
  transition: color 0.2s;
}
.rl-nav-cta:hover { color: var(--burnt); }

/* Hamburger (mobile) */
.rl-nav-hamburger {
  display: none;
  background: none; border: none;
  color: var(--text); cursor: pointer;
  padding: 8px;
  -webkit-tap-highlight-color: transparent;
}

/* Mobile dropdown */
.rl-nav-mobile {
  display: none;
  flex-direction: column;
  padding: 8px 24px 24px;
  max-width: 1100px; margin: 0 auto;
  border-top: 1px solid var(--sand-dark);
}
.rl-nav-mobile-link {
  display: block;
  padding: 16px 0;
  font-weight: 600; font-size: 16px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--sand-dark);
  transition: color 0.2s;
}
.rl-nav-mobile-link:hover { color: var(--text); }
.rl-nav-mobile-cta {
  display: inline-flex; align-items: center; gap: 8px;
  margin-top: 20px;
  background: var(--ochre); color: var(--white);
  padding: 14px 28px; border-radius: 14px;
  font-weight: 800; font-size: 15px;
  text-align: center; justify-content: center;
  box-shadow: 0 6px 0 var(--burnt);
  transition: transform 0.12s, box-shadow 0.12s;
}
.rl-nav-mobile-cta:active {
  transform: translateY(3px);
  box-shadow: 0 3px 0 var(--burnt);
}

/* ---- 03. Hero ---- */
.rl-hero {
  min-height: 85vh; min-height: 85dvh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center; position: relative;
  padding: 60px 24px 80px;
  background: linear-gradient(to bottom, #bae6fd22, var(--sand));
}
.rl-hero-content {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 12px;
}

.rl-hero-mega {
  font-family: 'Syne', sans-serif;
  width: auto;
  display: inline-block;
  margin: 0 auto 28px;
  text-align: center;
  font-size: clamp(72px, 10vw, 220px);
  line-height: 0.82;
  letter-spacing: -0.05em;
  color: var(--burnt);
  user-select: none;
  white-space: nowrap;
  max-width: 100%;
}
html, body {
  overflow-x: hidden;
}
.rl-hero-tagline {
  font-size: clamp(20px, 3.5vw, 32px);
  font-weight: 400; line-height: 1.3;
  max-width: 600px; margin: 0 auto;
}
.rl-hero-tagline strong { font-weight: 800; }
.rl-hero-actions {
  margin-top: 44px;
  display: flex; flex-direction: column;
  align-items: center; gap: 14px;
}
.rl-btn-hero {
  display: inline-flex; align-items: center; gap: 12px;
  background: var(--ochre); color: var(--white);
  padding: 20px 40px; border-radius: 18px;
  font-size: 18px; font-weight: 800;
  box-shadow: 0 8px 0 var(--burnt);
  transition: transform 0.12s, box-shadow 0.12s;
}
.rl-btn-hero:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 0 var(--burnt);
}
.rl-btn-hero:active {
  transform: translateY(4px);
  box-shadow: 0 4px 0 var(--burnt);
}
.rl-btn-hero-alt {
  font-size: 14px; color: var(--text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: color 0.2s;
}
.rl-btn-hero-alt:hover { color: var(--text); }
.rl-hero-scroll {
  position: absolute; bottom: 32px;
  color: var(--text); opacity: 0.25;
  animation: rl-bounce 2s infinite;
}

/* ---- Marquee ---- */
.rl-marquee {
  background: var(--sky); padding: 14px 0;
  overflow: hidden; white-space: nowrap;
}
.rl-marquee-track {
  display: inline-flex;
  animation: rl-marquee 40s linear infinite;
}
.rl-marquee-item {
  display: inline-flex; align-items: center;
  font-family: 'Syne', sans-serif;
  color: var(--white); font-weight: 800; font-size: 13px;
  letter-spacing: 0.04em; text-transform: uppercase;
  padding: 0 12px;
}
.rl-marquee-dot {
  color: rgba(255, 255, 255, 0.35);
  font-size: 7px;
  margin-left: 12px;
}

/* ---- 04. Problem ---- */
.rl-problem { padding: 120px 0; }
.rl-problem-grid {
  display: grid; grid-template-columns: 1.1fr 0.9fr;
  gap: 72px; align-items: center;
}
.rl-problem-text h2 {
  font-size: clamp(30px, 4.5vw, 52px);
  font-weight: 800; line-height: 1.08; margin-bottom: 28px;
}
.rl-problem-text p {
  font-size: 17px; color: var(--text-muted);
  line-height: 1.75; margin-bottom: 20px;
}
.rl-problem-text p:last-child { margin-bottom: 0; }
.rl-problem-text strong { color: var(--text); }
.rl-visual-card {
  background: var(--white);
  border: 3px solid var(--text);
  padding: 56px 40px;
  text-align: center;
  transform: rotate(-2.5deg);
  box-shadow: 12px 12px 0 var(--sand-dark);
  transition: transform 0.3s;
}
.rl-visual-card:hover { transform: rotate(0deg); }
.rl-visual-card svg { color: var(--burnt); }
.rl-visual-card h3 {
  font-family: 'Syne', sans-serif;
  font-weight: 800; font-size: 28px;
  margin-top: 14px; letter-spacing: 0.1em;
}
.rl-visual-card p {
  font-size: 14px; color: var(--text-muted); margin-top: 6px;
}

/* ---- 05. Features ---- */
.rl-features { background: var(--sand-dark); padding: 120px 0; }
.rl-section-header { text-align: center; margin-bottom: 56px; }
.rl-section-header h2 {
  font-size: clamp(32px, 4vw, 48px); font-weight: 800;
}
.rl-features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
  gap: 20px;
}
.rl-feat-card {
  background: var(--sand);
  padding: 36px; border-radius: 20px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  transition: transform 0.2s, box-shadow 0.2s;
}
.rl-feat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(42, 26, 15, 0.06);
}
.rl-feat-top {
  display: flex; justify-content: space-between;
  align-items: flex-start; margin-bottom: 18px;
}
.rl-feat-num {
  font-family: 'Syne', sans-serif;
  font-weight: 800; color: var(--ochre); opacity: 0.35;
  font-size: 14px;
}
.rl-feat-icon { color: var(--ochre); }
.rl-feat-card h3 {
  font-size: 20px; font-weight: 800; margin-bottom: 10px;
}
.rl-feat-card p {
  color: var(--text-muted); line-height: 1.65; font-size: 15px;
}

/* ---- 06. How it works ---- */
.rl-how { padding: 120px 0; }
.rl-how-grid {
  display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 56px;
}
.rl-how-header h2 {
  font-size: clamp(36px, 5vw, 56px);
  font-weight: 800; line-height: 1.0;
}
.rl-how-steps { display: flex; flex-direction: column; gap: 36px; }
.rl-step { display: flex; gap: 24px; align-items: flex-start; }
.rl-step-num {
  font-family: 'Syne', sans-serif;
  font-size: 44px; font-weight: 800;
  color: var(--ochre); line-height: 1;
  min-width: 48px;
}
.rl-step-content h3 {
  font-size: 22px; font-weight: 800; margin-bottom: 6px;
}
.rl-step-content p {
  color: var(--text-muted); font-size: 16px; line-height: 1.7;
}

/* ---- 07. Download ---- */
.rl-download { padding: 0 0 120px; }
.rl-download-card {
  background: var(--burnt); color: var(--white);
  padding: 72px 40px; border-radius: 32px;
  text-align: center;
  position: relative; overflow: hidden;
}
.rl-download-card::before {
  content: ''; position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 50% 60% at 80% 20%, rgba(255,255,255,0.06), transparent),
    radial-gradient(ellipse 40% 50% at 10% 80%, rgba(255,255,255,0.04), transparent);
  pointer-events: none;
}
.rl-download-card h2 {
  position: relative;
  font-family: 'Syne', sans-serif;
  font-size: clamp(36px, 6vw, 60px);
  margin-bottom: 16px;
}
.rl-download-card > p {
  position: relative;
  font-size: 18px; opacity: 0.75;
  max-width: 480px; margin: 0 auto 36px;
  line-height: 1.65;
}
.rl-download-btns {
  position: relative;
  display: flex; gap: 16px;
  color: #000000;
  justify-content: center; flex-wrap: wrap;
}
.rl-app-btn {
  background: var(--white); color: var(--burnt);
  padding: 16px 32px; border-radius: 16px;
  font-weight: 800; font-size: 16px;
  color: black;
  display: inline-flex; align-items: center; gap: 10px;
  transition: transform 0.15s, box-shadow 0.15s;
}
.rl-app-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}
.rl-app-btn:active { transform: translateY(0); }
.rl-download-web {
  position: relative;
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 20px;
  font-size: 14px; color: rgba(255, 255, 255, 0.45);
  text-decoration: underline; text-underline-offset: 3px;
  transition: color 0.2s;
}
.rl-download-web:hover { color: rgba(255, 255, 255, 0.7); }

/* ---- 08. Footer ---- */
.rl-footer {
  padding: 72px 0 48px;
  background: var(--white);
}
@media (max-width: 968px) {
  .rl-footer { padding-bottom: 120px; }
}
.rl-footer-grid {
  display: flex; justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 48px;
  border-bottom: 1px solid var(--sand-dark);
}
.rl-footer-logo {
  display: flex; align-items: center; gap: 10px;
  font-family: 'Syne', sans-serif; font-size: 20px;
  color: var(--burnt); margin-bottom: 8px;
}
.rl-footer-left p { font-size: 14px; color: var(--text-muted); }
.rl-footer-links { display: flex; gap: 28px; }
.rl-footer-links a {
  font-weight: 600; font-size: 14px;
  color: var(--text-muted);
  transition: color 0.2s;
}
.rl-footer-links a:hover { color: var(--text); }

/* Ecodia signature */
.rl-footer-sig {
  margin-top: 48px;
  display: flex; align-items: center; justify-content: center; gap: 12px;
}
.rl-sig-text { font-weight: 500; font-size: 14px; color: var(--text-muted); }
.rl-sig-box {
  display: flex; overflow: hidden;
  font-weight: 800; font-size: 14px;
  cursor: default;
}
.rl-sig-eco {
  background: #fff; color: #000;
  padding: 5px 11px;
  transition: background 0.2s, color 0.2s;
}
.rl-sig-box:hover .rl-sig-eco { background: #000; color: #fff; }
.rl-sig-code {
  background: #000; color: #fff;
  padding: 5px 11px;
  transition: background 0.2s, color 0.2s;
}
.rl-sig-box:hover .rl-sig-code { background: #fff; color: #000; }

/* ---- Mobile sticky CTA ---- */
.rl-mobile-cta {
  display: none;
  position: fixed; bottom: 24px; left: 20px; right: 20px;
  z-index: 1100;
}
.rl-btn-mobile {
  background: var(--text); color: var(--white);
  padding: 18px 24px; border-radius: 18px;
  display: flex; align-items: center; justify-content: center; gap: 12px;
  font-weight: 800; font-size: 16px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s;
}
.rl-btn-mobile:active { transform: scale(0.97); }

/* ---- Animations ---- */
@keyframes rl-marquee { to { transform: translateX(-50%); } }
@keyframes rl-bounce {
  0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-8px); }
  60% { transform: translateY(-4px); }
}

/* ---- Responsive ---- */
@media (max-width: 968px) {
  .rl-nav-links { display: none; }
  .rl-nav-cta { display: none; }
  .rl-nav-hamburger { display: block; }
  .rl-nav-mobile { display: flex; }
  .rl-problem-grid { grid-template-columns: 1fr; gap: 48px; }
  .rl-how-grid { grid-template-columns: 1fr; gap: 40px; }
  .rl-footer-grid {
    flex-direction: column; align-items: center;
    text-align: center; gap: 32px;
  }
  .rl-mobile-cta { display: block; }
}

@media (min-width: 969px) {
  .rl-nav-mobile { display: none !important; }
}

@media (max-width: 480px) {
  .rl-hero { padding: 48px 20px 60px; min-height: auto; overflow: hidden; }
  .rl-hero-mega { font-size: 72px; }
  .rl-btn-hero {
    width: 100%; justify-content: center;
    padding: 18px 32px; font-size: 16px;
  }
  .rl-download-card { padding: 56px 24px; border-radius: 24px; }
  .rl-download-card h2 { font-size: 36px; }
  .rl-app-btn { width: 100%; justify-content: center; }
  .rl-features-grid { grid-template-columns: 1fr; }
  .rl-visual-card { padding: 40px 28px; }
  .rl-problem { padding: 80px 0; }
  .rl-features { padding: 80px 0; }
  .rl-how { padding: 80px 0; }
}
`;