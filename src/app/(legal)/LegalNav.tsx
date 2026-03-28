import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { Compass, Menu, X, ArrowRight } from "lucide-react";

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
    return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

const subscribePlatform = () => () => {};

function usePlatform(): Platform {
  return useSyncExternalStore(subscribePlatform, detectPlatform, () => "desktop" as Platform);
}

// TODO: Replace with real App Store ID after first submission
const APP_STORE = "https://apps.apple.com/au/app/roam-nav/id000000000";
const PLAY_STORE =
  "https://play.google.com/store/apps/details?id=au.ecodia.roam";

function useCtaConfig(platform: Platform) {
  return useMemo(() => {
    switch (platform) {
      case "ios":
        return { href: APP_STORE, label: "Get the App", external: true };
      case "android":
        return { href: PLAY_STORE, label: "Get the App", external: true };
      default:
        return { href: "/trip", label: "Open Roam", external: false };
    }
  }, [platform]);
}

function extProps(external: boolean) {
  return external
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : {};
}

interface LegalNavProps {
  /** The href of the current page, used to highlight the active nav link */
  activePath: string;
}

export default function LegalNav({ activePath }: LegalNavProps) {
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

  return (
    <>
      <style>{NAV_STYLES}</style>
      <nav className={`rl-nav ${scrolled ? "rl-nav-s" : ""}`}>
        <div className="rl-nav-bar">
          <Link to="/" className="rl-nav-logo">
            <Compass size={22} strokeWidth={2.5} />
            <span>ROAM</span>
          </Link>

          <div className="rl-nav-links">
            <Link to="/#features" className="rl-nav-link">Features</Link>
            <Link to="/#how" className="rl-nav-link">How It Works</Link>
            {[
              { href: "/contact", label: "Contact" },
              { href: "/terms", label: "Terms" },
              { href: "/privacy", label: "Privacy" },
              { href: "/attributions", label: "Attributions" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                to={href}
                className={`rl-nav-link${activePath === href ? " rl-nav-link-active" : ""}`}
              >
                {label}
              </Link>
            ))}
          </div>

          <a href={cta.href} className="rl-nav-cta" {...extProps(cta.external)}>
            {cta.label}
          </a>

          <button
            className="rl-nav-hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {menuOpen && (
          <div className="rl-nav-mobile">
            <Link to="/#features" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>Features</Link>
            <Link to="/#how" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>How It Works</Link>
            {[
              { href: "/contact", label: "Contact" },
              { href: "/terms", label: "Terms" },
              { href: "/privacy", label: "Privacy" },
              { href: "/attributions", label: "Attributions" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                to={href}
                className="rl-nav-mobile-link"
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
            <a
              href={cta.href}
              className="rl-nav-mobile-cta"
              onClick={() => setMenuOpen(false)}
              {...extProps(cta.external)}
            >
              {cta.label} <ArrowRight size={16} />
            </a>
          </div>
        )}
      </nav>
    </>
  );
}

const NAV_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap');

.rl-legal-content {
  max-width: 680px;
  width: 100%;
  margin: 0 auto;
  padding: 24px 20px 40px;
}

.rl-nav {
  position: sticky; top: 0; z-index: 1000;
  background: #1a1612;
  border-bottom: 1px solid transparent;
  transition: background 0.3s, border-color 0.3s, backdrop-filter 0.3s;
}
.rl-nav-s {
  background: rgba(26, 22, 18, 0.88);
  backdrop-filter: blur(16px);
  border-bottom-color: rgba(232, 221, 208, 0.08);
}
.rl-nav-bar {
  max-width: 1100px; margin: 0 auto;
  height: 72px; padding: 0 24px;
  display: flex; align-items: center; justify-content: space-between;
}
.rl-nav-logo {
  display: flex; align-items: center; gap: 10px;
  font-family: 'Syne', sans-serif; font-weight: 800; font-size: 22px;
  color: #d4845a;
  text-decoration: none;
  transition: opacity 0.2s;
}
.rl-nav-logo:hover { opacity: 0.7; }

.rl-nav-links {
  display: flex; align-items: center; gap: 20px;
}
.rl-nav-link {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 600; font-size: 15px;
  color: rgba(232, 221, 208, 0.5);
  text-decoration: none;
  transition: color 0.2s;
  position: relative;
}
.rl-nav-link::after {
  content: '';
  position: absolute; bottom: -4px; left: 0; right: 0;
  height: 2px; background: #d4845a;
  transform: scaleX(0);
  transition: transform 0.2s;
}
.rl-nav-link:hover { color: #e8ddd0; }
.rl-nav-link:hover::after { transform: scaleX(1); }
.rl-nav-link-active { color: #e8ddd0; }
.rl-nav-link-active::after { transform: scaleX(1); }

.rl-nav-cta {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800; font-size: 15px;
  color: #d4845a;
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-thickness: 2px;
  transition: color 0.2s;
}
.rl-nav-cta:hover { color: #e8ddd0; }

.rl-nav-hamburger {
  display: none;
  background: none; border: none;
  color: #e8ddd0; cursor: pointer;
  padding: 8px;
  -webkit-tap-highlight-color: transparent;
}

.rl-nav-mobile {
  display: none;
  flex-direction: column;
  padding: 8px 24px 24px;
  max-width: 1100px; margin: 0 auto;
  border-top: 2px solid rgba(232, 221, 208, 0.06);
}
.rl-nav-mobile-link {
  display: block;
  padding: 16px 0;
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 600; font-size: 16px;
  color: rgba(232, 221, 208, 0.5);
  text-decoration: none;
  border-bottom: 2px solid rgba(232, 221, 208, 0.06);
  transition: color 0.2s;
}
.rl-nav-mobile-link:hover { color: #e8ddd0; }
.rl-nav-mobile-cta {
  display: inline-flex; align-items: center; gap: 8px;
  margin-top: 20px;
  background: #d4845a; color: #ffffff;
  padding: 14px 28px; border-radius: var(--r-card);
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800; font-size: 15px;
  text-decoration: none;
  text-align: center; justify-content: center;
  box-shadow: 0 6px 0 #a3623d;
  transition: transform 0.12s, box-shadow 0.12s;
}
.rl-nav-mobile-cta:active {
  transform: translateY(3px);
  box-shadow: 0 3px 0 #a3623d;
}

@media (max-width: 1100px) {
  .rl-nav-links { display: none; }
  .rl-nav-cta { display: none; }
  .rl-nav-hamburger { display: block; }
  .rl-nav-mobile { display: flex; }
}

@media (min-width: 1101px) {
  .rl-nav-mobile { display: none !important; }
}
`;
