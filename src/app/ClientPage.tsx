"use client";

import { useEffect, useState, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  Map,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Capacitor redirect                                                  */
/* ------------------------------------------------------------------ */
const subscribeNoop = () => () => {};
const getIsNative = () => Capacitor.isNativePlatform();
const getIsNativeServer = () => false;

function useNativeRedirect() {
  const router = useRouter();
  const isNative = useSyncExternalStore(subscribeNoop, getIsNative, getIsNativeServer);
  useEffect(() => {
    if (isNative) router.replace("/trip");
  }, [isNative, router]);
  return isNative;
}

/* ------------------------------------------------------------------ */
/* Platform detection                                                  */
/* ------------------------------------------------------------------ */
type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

function usePlatform(): Platform {
  return useSyncExternalStore(subscribeNoop, detectPlatform, () => "desktop" as Platform);
}

const APP_STORE = "https://apps.apple.com/au/app/roam-nav/id000000000";
const PLAY_STORE = "https://play.google.com/store/apps/details?id=au.ecodia.roam";

/* ------------------------------------------------------------------ */
/* CTA config                                                          */
/* ------------------------------------------------------------------ */
function useCtaConfig(platform: Platform) {
  return useMemo(() => {
    switch (platform) {
      case "ios": return { href: APP_STORE, heroLabel: "Download for iPhone", navLabel: "Get the App", mobileLabel: "Download Roam", external: true };
      case "android": return { href: PLAY_STORE, heroLabel: "Get it on Google Play", navLabel: "Get the App", mobileLabel: "Download Roam", external: true };
      default: return { href: "/trip", heroLabel: "Open Roam", navLabel: "Open Roam", mobileLabel: "Open Roam", external: false };
    }
  }, [platform]);
}

function extProps(external: boolean) {
  return external ? ({ target: "_blank", rel: "noopener noreferrer" } as const) : {};
}

/* ------------------------------------------------------------------ */
/* Brand SVGs                                                          */
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
  "Brisbane \u2192 Cairns", "1,700 km", "Adelaide \u2192 Darwin", "3,030 km",
  "Sydney \u2192 Broken Hill", "1,160 km", "Perth \u2192 Broome", "2,240 km",
  "Melbourne \u2192 Alice Springs", "2,330 km", "Cairns \u2192 Darwin", "2,760 km",
];

const FEATURES = [
  { icon: WifiOff, num: "01", title: "Works without signal", body: "Your maps, route, fuel stops and hazard warnings all live on your phone. Drive through dead zones like they don\u2019t exist." },
  { icon: Fuel, num: "02", title: "Never miss a servo", body: "See every fuel stop between here and there. Roam flags the gaps where your tank won\u2019t make it, before you\u2019re stranded." },
  { icon: AlertTriangle, num: "03", title: "Know before you go", body: "Road closures, floods, fires and roadworks from every state transport authority. If something\u2019s blocking your road, you\u2019ll know about it." },
  { icon: Navigation, num: "04", title: "Proper turn-by-turn", body: "Voice directions that keep going when you lose signal. No spinning wheel, no \u201csearching for route.\u201d Just the next turn, on time." },
  { icon: Clock, num: "05", title: "Fatigue nudges", body: "Tracks your drive time and tells you where the next rest stop is. Two hours in, you\u2019ll get a gentle reminder to pull over." },
  { icon: Users, num: "06", title: "Share with your co-pilot", body: "Send your trip plan to whoever\u2019s riding shotgun. Same stops, same fuel plan, same warnings. Works on both phones." },
];

const STEPS = [
  { t: "Drop your stops", d: "Tell Roam where you\u2019re headed. It finds the route, every fuel station, and checks for road closures." },
  { t: "Tap download", d: "One button saves your whole trip. Maps, directions, fuel plan, and warnings stay on your phone." },
  { t: "Hit the road", d: "Voice directions and fatigue reminders work 100% offline. Roam handles the dead zones." },
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

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  if (isNative === null || isNative === true) return null;

  return (
    <div className="rl">
      <style>{STYLES}</style>

      <nav className={`rl-nav ${scrolled ? "rl-nav-s" : ""}`}>
        <div className="rl-nav-bar">
          <Link href="/" className="rl-nav-logo">
            <Compass size={20} strokeWidth={2.5} />
            <span>ROAM</span>
          </Link>
          <div className="rl-nav-links">
            <a href="#features" className="rl-nav-link">Features</a>
            <a href="#how" className="rl-nav-link">How It Works</a>
            <a href="/contact" className="rl-nav-link">Contact</a>
          </div>
          <a href={cta.href} className="rl-nav-cta" {...extProps(cta.external)}>{cta.navLabel}</a>
          <button className="rl-nav-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close menu" : "Open menu"}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        <div className={`rl-nav-mobile ${menuOpen ? "open" : ""}`}>
          <a href="#features" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#how" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>How It Works</a>
          <a href="/contact" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>Contact</a>
          <a href={cta.href} className="rl-nav-mobile-cta" onClick={() => setMenuOpen(false)} {...extProps(cta.external)}>{cta.navLabel} <ArrowRight size={16} /></a>
        </div>
      </nav>

      <section className="rl-hero">
        <div className="rl-hero-content">
          <h1 className="rl-hero-mega">
            <Compass strokeWidth={1.5} className="rl-hero-compass" />
            ROAM
          </h1>
          <p className="rl-hero-tagline">Road trip navigation that works<br /><strong>way</strong> out here.</p>
          <div className="rl-hero-actions">
            <a href={cta.href} className="rl-btn-hero" {...extProps(cta.external)}>{cta.heroLabel} <ArrowRight size={18} /></a>
            {platform === "desktop" && <a href="#download" className="rl-btn-hero-alt">Or download the app</a>}
          </div>
        </div>
        <a href="#problem" className="rl-hero-scroll" aria-label="Scroll down"><ArrowDown size={16} /></a>
      </section>

      <div className="rl-marquee" aria-hidden="true">
        <div className="rl-marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="rl-marquee-item">{item}<span className="rl-marquee-dot">{"\u2022"}</span></span>
          ))}
        </div>
      </div>

      <section className="rl-problem" id="problem">
        <div className="rl-inner">
          <div className="rl-problem-grid">
            <div className="rl-problem-text">
              <span className="rl-label">The Signal Void</span>
              <h2>Google Maps quits 50km out of town.</h2>
              <p>You&apos;re past Longreach. Fuel light&apos;s on. 180km to the next servo. Your phone says <strong>&ldquo;No connection&rdquo;</strong> and the map is a grey void.</p>
              <p>Most nav apps need the cloud. Roam downloads everything to your phone before you leave so it&apos;s useful the whole way.</p>
            </div>
            <div className="rl-problem-visual">
              <div className="rl-visual-card">
                <WifiOff size={40} strokeWidth={1.5} />
                <h3>OFFLINE</h3>
                <p>Navigation active without signal</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rl-features" id="features">
        <div className="rl-inner">
          <div className="rl-section-header">
            <span className="rl-label">The Toolkit</span>
            <h2>Six things that keep you moving.</h2>
          </div>
          <div className="rl-features-grid">
            {FEATURES.map((f) => { const Icon = f.icon; return (
              <div key={f.num} className="rl-feat-card">
                <div className="rl-feat-top"><span className="rl-feat-num">{f.num}</span><Icon className="rl-feat-icon" size={22} /></div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ); })}
          </div>
        </div>
      </section>

      <section className="rl-how" id="how">
        <div className="rl-inner">
          <div className="rl-how-grid">
            <div className="rl-how-header">
              <span className="rl-label">Workflow</span>
              <h2>Three steps.<br />Then drive.</h2>
            </div>
            <div className="rl-how-steps">
              {STEPS.map((s, i) => (
                <div key={i} className="rl-step">
                  <div className="rl-step-num">{i + 1}</div>
                  <div className="rl-step-content"><h3>{s.t}</h3><p>{s.d}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rl-download" id="download">
        <div className="rl-inner">
          <div className="rl-download-card">
            <h2>Don&apos;t get stranded.</h2>
            <p>The outback is no place for a loading wheel. Get Roam and plan your first trip today.</p>
            <div className="rl-download-btns">
              {(platform === "ios" || platform === "desktop") && <a href={APP_STORE} className="rl-app-btn" target="_blank" rel="noopener noreferrer"><AppleSvg /> <span>App Store</span></a>}
              {(platform === "android" || platform === "desktop") && <a href={PLAY_STORE} className="rl-app-btn" target="_blank" rel="noopener noreferrer"><PlaySvg /> <span>Google Play</span></a>}
            </div>
            {platform === "desktop" && <a href="/trip" className="rl-download-web">Or use Roam in your browser <ArrowRight size={14} /></a>}
          </div>
        </div>
      </section>

      <section className="rl-aoc-footer">
        <div className="rl-inner">
          <div className="rl-aoc-content">
            <Map className="rl-aoc-icon" size={18} strokeWidth={1.5} />
            <p>Roam was built on the lands of the <strong>Gubbi Gubbi</strong> people. We pay our respects to their Elders past and present. As you travel this wide country, we invite you to recognize that every track, highway, and river you cross has been cared for by Traditional Custodians for tens of thousands of years.</p>
          </div>
        </div>
      </section>

      <footer className="rl-footer">
        <div className="rl-inner">
          <div className="rl-footer-grid">
            <div className="rl-footer-left">
              <div className="rl-footer-logo"><Compass size={16} /> <strong>ROAM</strong></div>
              <p>Road navigation for the wide brown land.</p>
            </div>
            <div className="rl-footer-right">
              <div className="rl-footer-links">
                <a href="mailto:hello@ecodia.au">Contact</a>
                <a href="/privacy">Privacy</a>
                <a href="/terms">Terms</a>
              </div>
            </div>
          </div>
          <div className="rl-footer-sig">
            <span className="rl-sig-text">Made by</span>
            <div className="rl-sig-box">
              <a href="https://code.ecodia.au" target="_blank" rel="noopener noreferrer" className="rl-sig-eco">ECODIA</a>
              <a href="https://code.ecodia.au" target="_blank" rel="noopener noreferrer" className="rl-sig-code">CODE</a>
            </div>
          </div>
        </div>
      </footer>

      <div className="rl-mobile-cta">
        <a href={cta.href} className="rl-btn-mobile" {...extProps(cta.external)}>{cta.mobileLabel} <ArrowRight size={18} /></a>
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
  --sand: #faf8f5;
  --sand-dark: #f0ebe3;
  --ochre: #d46e3a;
  --burnt: #8c2f0a;
  --hero-dark: #0f0f0f;
  --accent: #e8764b;
  --text: #1a1510;
  --text-muted: #6b5e52;
  --white: #ffffff;
}

.rl *, .rl *::before, .rl *::after { box-sizing: border-box; margin: 0; padding: 0; }
.rl {
  background: var(--sand); color: var(--text);
  font-family: 'Bricolage Grotesque', sans-serif;
  overflow-x: hidden;
  -webkit-tap-highlight-color: transparent;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  position: relative;
}
.rl a { text-decoration: none; }
.rl-inner { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

.rl-label {
  font-family: 'Syne', sans-serif;
  text-transform: uppercase; letter-spacing: 0.25em;
  font-size: 11px; color: var(--accent);
  display: block; margin-bottom: 20px; font-weight: 800;
}

/* ---- Nav ---- */
.rl-nav {
  position: sticky; top: 0; z-index: 1000;
  background: var(--hero-dark);
  border-bottom: 1px solid transparent;
  transition: background 0.3s, border-color 0.3s, backdrop-filter 0.3s;
}
.rl-nav-s {
  background: rgba(15,15,15,0.92);
  backdrop-filter: blur(20px) saturate(1.2);
  border-bottom-color: rgba(255,255,255,0.06);
}
.rl-nav-bar {
  max-width: 1100px; margin: 0 auto; height: 64px; padding: 0 24px;
  display: flex; align-items: center; justify-content: space-between;
  position: relative; z-index: 1001;
}
.rl-nav-logo {
  display: flex; align-items: center; gap: 10px;
  font-family: 'Syne', sans-serif; font-weight: 800; font-size: 20px;
  letter-spacing: 0.04em; color: var(--white) !important; transition: opacity 0.2s;
}
.rl-nav-logo:hover { opacity: 0.7; }
.rl-nav-links { display: flex; align-items: center; gap: 36px; }
.rl-nav-link {
  font-weight: 600; font-size: 14px; color: rgba(255,255,255,0.55);
  transition: color 0.2s; position: relative; letter-spacing: 0.01em;
}
.rl-nav-link::after {
  content: ''; position: absolute; bottom: -4px; left: 0; right: 0;
  height: 1px; background: var(--accent); transform: scaleX(0); transition: transform 0.2s;
}
.rl-nav-link:hover { color: rgba(255,255,255,0.9); }
.rl-nav-link:hover::after { transform: scaleX(1); }
.rl-nav-cta {
  font-weight: 800; font-size: 13px; color: var(--hero-dark); background: var(--white);
  padding: 9px 20px; border-radius: 8px; letter-spacing: 0.02em;
  transition: background 0.2s, transform 0.12s, box-shadow 0.2s;
}
.rl-nav-cta:hover { background: var(--sand); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
.rl-nav-hamburger {
  display: none; background: none; border: none;
  color: var(--white); cursor: pointer; padding: 8px;
  -webkit-tap-highlight-color: transparent;
}
.rl-nav-mobile {
  position: absolute; top: 100%; left: 0; width: 100%;
  background: rgba(15,15,15,0.97); backdrop-filter: blur(20px);
  flex-direction: column; padding: 8px 24px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  box-shadow: 0 24px 48px rgba(0,0,0,0.4);
  display: flex; visibility: hidden; opacity: 0;
  transform: translateY(-12px);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); z-index: 999;
}
.rl-nav-mobile.open { visibility: visible; opacity: 1; transform: translateY(0); }
.rl-nav-mobile-link {
  display: block; padding: 16px 0; font-weight: 600; font-size: 16px;
  color: rgba(255,255,255,0.6); border-bottom: 1px solid rgba(255,255,255,0.08);
  transition: color 0.2s;
}
.rl-nav-mobile-link:hover { color: var(--white); }
.rl-nav-mobile-cta {
  display: inline-flex; align-items: center; gap: 8px; margin-top: 20px;
  background: var(--white); color: var(--hero-dark);
  padding: 14px 28px; border-radius: 12px;
  font-weight: 800; font-size: 15px; text-align: center; justify-content: center;
  transition: transform 0.12s;
}
.rl-nav-mobile-cta:active { transform: translateY(2px); }

/* ---- Hero ---- */
.rl-hero {
  min-height: 100vh; min-height: 100dvh;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; position: relative;
  padding: 80px 24px 100px; background: var(--hero-dark); color: var(--white); overflow: hidden;
}
.rl-hero::before {
  content: ''; position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(232,118,75,0.14), transparent 70%),
    radial-gradient(ellipse 60% 80% at 20% 100%, rgba(232,118,75,0.06), transparent),
    radial-gradient(ellipse 50% 60% at 80% 90%, rgba(14,165,233,0.05), transparent);
  pointer-events: none; z-index: 0;
}
.rl-hero-content, .rl-hero-scroll { position: relative; z-index: 1; }
.rl-hero-content { max-width: 900px; margin: 0 auto; padding: 0 12px; }
.rl-hero-mega {
  font-family: 'Syne', sans-serif;
  display: inline-flex; align-items: center; justify-content: center;
  gap: 20px; margin: 0 auto 36px;
  font-size: clamp(80px, 12vw, 200px);
  line-height: 0.85; letter-spacing: -0.04em;
  color: var(--white); user-select: none; max-width: 100%;
}
.rl-hero-compass {
  color: var(--accent);
  width: 0.55em; height: 0.55em; flex-shrink: 0;
  animation: rl-spin-subtle 20s linear infinite;
}
.rl-hero-tagline {
  font-size: clamp(18px, 2.8vw, 24px); font-weight: 400; line-height: 1.55;
  max-width: 480px; margin: 0 auto; color: rgba(255,255,255,0.55); letter-spacing: 0.01em;
}
.rl-hero-tagline strong { font-weight: 800; color: rgba(255,255,255,0.85); }
.rl-hero-actions { margin-top: 48px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.rl-btn-hero {
  display: inline-flex; align-items: center; gap: 10px;
  background: var(--white); color: var(--hero-dark);
  padding: 16px 36px; border-radius: 12px;
  font-size: 15px; font-weight: 800; letter-spacing: 0.01em;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 4px 24px rgba(0,0,0,0.3);
}
.rl-btn-hero:hover { transform: translateY(-2px); box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 8px 32px rgba(0,0,0,0.4); }
.rl-btn-hero:active { transform: translateY(0); box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 2px 12px rgba(0,0,0,0.3); }
.rl-btn-hero-alt { font-size: 13px; color: rgba(255,255,255,0.4); transition: color 0.2s; letter-spacing: 0.02em; }
.rl-btn-hero-alt:hover { color: rgba(255,255,255,0.7); }
.rl-hero-scroll { position: absolute; bottom: 40px; color: rgba(255,255,255,0.3); animation: rl-bounce 3s ease-in-out infinite; }

/* ---- Marquee ---- */
.rl-marquee {
  background: var(--accent); color: var(--white);
  padding: 14px 0; overflow: hidden; white-space: nowrap;
}
.rl-marquee-track { display: inline-flex; animation: rl-marquee 60s linear infinite; }
.rl-marquee-item {
  display: inline-flex; align-items: center;
  font-family: 'Syne', sans-serif;
  color: var(--white); font-weight: 800; font-size: 11px;
  letter-spacing: 0.1em; text-transform: uppercase; padding: 0 18px;
}
.rl-marquee-dot { color: rgba(255,255,255,0.4); font-size: 8px; margin-left: 18px; }

/* ---- Problem ---- */
.rl-problem { padding: 140px 0; }
.rl-problem-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 80px; align-items: center; }
.rl-problem-text h2 { font-size: clamp(30px, 4.5vw, 48px); font-weight: 800; line-height: 1.1; margin-bottom: 28px; color: var(--text); }
.rl-problem-text p { font-size: 17px; color: var(--text-muted); line-height: 1.8; margin-bottom: 20px; }
.rl-problem-text p:last-child { margin-bottom: 0; }
.rl-problem-text strong { color: var(--text); }
.rl-visual-card {
  background: var(--hero-dark); border: 1px solid rgba(255,255,255,0.08);
  padding: 64px 40px; text-align: center; border-radius: 24px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.08);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s;
}
.rl-visual-card:hover { transform: translateY(-4px); box-shadow: 0 32px 80px rgba(0,0,0,0.12); }
.rl-visual-card svg { color: var(--accent); }
.rl-visual-card h3 { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 22px; margin-top: 16px; letter-spacing: 0.15em; color: var(--white); }
.rl-visual-card p { font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 8px; letter-spacing: 0.02em; }

/* ---- Features ---- */
.rl-features { background: var(--sand); padding: 140px 0; }
.rl-section-header { text-align: center; margin-bottom: 64px; }
.rl-section-header h2 { font-size: clamp(30px, 4vw, 44px); font-weight: 800; color: var(--text); }
.rl-features-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 12px; }
.rl-feat-card {
  background: var(--white); padding: 36px; border-radius: 16px;
  border: 1px solid rgba(0,0,0,0.04);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s;
}
.rl-feat-card:hover { transform: translateY(-2px); box-shadow: 0 16px 48px rgba(42,26,15,0.06); }
.rl-feat-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.rl-feat-num { font-family: 'Syne', sans-serif; font-weight: 800; color: var(--accent); opacity: 0.3; font-size: 13px; }
.rl-feat-icon { color: var(--accent); }
.rl-feat-card h3 { font-size: 18px; font-weight: 800; margin-bottom: 10px; color: var(--text); }
.rl-feat-card p { color: var(--text-muted); line-height: 1.7; font-size: 15px; }

/* ---- How it works ---- */
.rl-how { padding: 140px 0; background: var(--sand-dark); }
.rl-how-grid { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 64px; }
.rl-how-header h2 { font-size: clamp(36px, 5vw, 52px); font-weight: 800; line-height: 1.0; color: var(--text); }
.rl-how-steps { display: flex; flex-direction: column; gap: 40px; }
.rl-step { display: flex; gap: 24px; align-items: flex-start; }
.rl-step-num { font-family: 'Syne', sans-serif; font-size: 48px; font-weight: 800; color: var(--accent); opacity: 0.2; line-height: 1; min-width: 52px; }
.rl-step-content h3 { font-size: 20px; font-weight: 800; margin-bottom: 8px; color: var(--text); }
.rl-step-content p { color: var(--text-muted); font-size: 16px; line-height: 1.7; }

/* ---- Download ---- */
.rl-download { padding: 0 0 140px; background: var(--sand-dark); }
.rl-download-card {
  background: var(--hero-dark); color: var(--white);
  padding: 80px 40px; border-radius: 24px;
  text-align: center; position: relative; overflow: hidden;
}
.rl-download-card::before {
  content: ''; position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 50% 0%, rgba(232,118,75,0.12), transparent 70%),
    radial-gradient(ellipse 40% 50% at 10% 80%, rgba(14,165,233,0.05), transparent);
  pointer-events: none; z-index: 0;
}
.rl-download-card > * { position: relative; z-index: 1; }
.rl-download-card h2 { font-family: 'Syne', sans-serif; font-size: clamp(32px, 6vw, 52px); margin-bottom: 16px; letter-spacing: -0.02em; color: var(--white); }
.rl-download-card > p { font-size: 16px; color: rgba(255,255,255,0.55); max-width: 420px; margin: 0 auto 40px; line-height: 1.7; }
.rl-download-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.rl-app-btn {
  background: var(--white); color: var(--hero-dark);
  padding: 14px 28px; border-radius: 10px;
  font-weight: 800; font-size: 15px;
  display: inline-flex; align-items: center; gap: 10px;
  transition: transform 0.15s, box-shadow 0.2s;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.1);
}
.rl-app-btn:hover { transform: translateY(-2px); box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 8px 32px rgba(0,0,0,0.3); }
.rl-app-btn:active { transform: translateY(0); }
.rl-download-web {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 24px;
  font-size: 13px; color: rgba(255,255,255,0.4); transition: color 0.2s; letter-spacing: 0.02em;
}
.rl-download-web:hover { color: rgba(255,255,255,0.7); }

/* ---- Acknowledgement ---- */
.rl-aoc-footer { padding: 80px 0; background: var(--sand); border-top: 1px solid var(--sand-dark); }
.rl-aoc-content { max-width: 600px; margin: 0 auto; text-align: center; }
.rl-aoc-icon { color: var(--accent); margin-bottom: 24px; opacity: 0.5; }
.rl-aoc-footer p { font-size: 15px; line-height: 1.9; color: var(--text-muted); }
.rl-aoc-footer strong { color: var(--text); font-weight: 800; }

/* ---- Footer ---- */
.rl-footer { padding: 0 0 48px; background: var(--sand); }
@media (max-width: 968px) { .rl-footer { padding-bottom: 120px; } }
.rl-footer-grid { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 48px; border-bottom: 1px solid var(--sand-dark); }
.rl-footer-logo { display: flex; align-items: center; gap: 8px; font-family: 'Syne', sans-serif; font-size: 16px; color: var(--text); margin-bottom: 8px; }
.rl-footer-left p { font-size: 13px; color: var(--text-muted); }
.rl-footer-links { display: flex; gap: 28px; }
.rl-footer-links a { font-weight: 600; font-size: 13px; color: var(--text-muted); transition: color 0.2s; }
.rl-footer-links a:hover { color: var(--text); }
.rl-footer-sig { margin-top: 48px; display: flex; align-items: center; justify-content: center; gap: 12px; }
.rl-sig-text { font-weight: 500; font-size: 11px; color: var(--text-muted); letter-spacing: 0.06em; text-transform: uppercase; }
.rl-sig-box { display: flex; overflow: hidden; border-radius: 4px; font-weight: 800; font-size: 11px; letter-spacing: 0.04em; cursor: default; }
.rl-sig-eco { background: var(--text); color: var(--white); padding: 4px 10px; transition: background 0.2s, color 0.2s; }
.rl-sig-box:hover .rl-sig-eco { background: var(--white); color: var(--text); }
.rl-sig-code { background: var(--white); color: var(--text); padding: 4px 10px; border: 1px solid var(--sand-dark); border-left: none; transition: background 0.2s, color 0.2s; }
.rl-sig-box:hover .rl-sig-code { background: var(--text); color: var(--white); }

/* ---- Mobile CTA ---- */
.rl-mobile-cta { display: none; position: fixed; bottom: 24px; left: 20px; right: 20px; z-index: 1100; }
.rl-btn-mobile {
  background: var(--hero-dark); color: var(--white) !important;
  padding: 16px 24px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  font-weight: 800; font-size: 15px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
  transition: transform 0.15s;
}
.rl-btn-mobile:active { transform: scale(0.97); }

/* ---- Animations ---- */
@keyframes rl-marquee { to { transform: translateX(-50%); } }
@keyframes rl-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes rl-spin-subtle { to { transform: rotate(360deg); } }

/* ---- Responsive ---- */
@media (max-width: 968px) {
  .rl-nav-links { display: none; }
  .rl-nav-cta { display: none; }
  .rl-nav-hamburger { display: block; }
  .rl-problem-grid { grid-template-columns: 1fr; gap: 48px; }
  .rl-how-grid { grid-template-columns: 1fr; gap: 40px; }
  .rl-footer-grid { flex-direction: column; align-items: center; text-align: center; gap: 32px; }
  .rl-mobile-cta { display: block; }
}
@media (min-width: 969px) { .rl-nav-mobile { display: none !important; } }
@media (max-width: 480px) {
  .rl-hero { padding: 60px 20px 80px; }
  .rl-hero-mega { font-size: 64px; gap: 12px; }
  .rl-btn-hero { width: 100%; justify-content: center; padding: 16px 28px; font-size: 15px; }
  .rl-download-card { padding: 56px 24px; border-radius: 20px; }
  .rl-download-card h2 { font-size: 32px; }
  .rl-app-btn { width: 100%; justify-content: center; }
  .rl-features-grid { grid-template-columns: 1fr; }
  .rl-visual-card { padding: 48px 28px; }
  .rl-problem { padding: 80px 0; }
  .rl-features { padding: 80px 0; }
  .rl-how { padding: 80px 0; }
  .rl-download { padding: 0 0 80px; }
  .rl-aoc-footer { padding: 60px 0; }
}
`;
