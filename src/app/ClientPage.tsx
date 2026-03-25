import { useEffect, useState, useMemo, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { Link } from "react-router";
import { Capacitor } from "@capacitor/core";
import "./landing.css";
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
/* Capacitoreredirect                                                  */
/* ------------------------------------------------------------------ */
const subscribeNoop = () => () => {};
const getIsNative = () => Capacitor.isNativePlatform();
const getIsNativeServer = () => false;

function useNativeRedirect() {
  const navigate = useNavigate();
  const isNative = useSyncExternalStore(subscribeNoop, getIsNative, getIsNativeServer);
  useEffect(() => {
    if (isNative) navigate("/trip", { replace: true });
  }, [isNative, navigate]);
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

      <nav className={`rl-nav ${scrolled ? "rl-nav-s" : ""}`}>
        <div className="rl-nav-bar">
          <Link to="/" className="rl-nav-logo">
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
