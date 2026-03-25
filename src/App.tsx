import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider } from "@/lib/supabase/auth";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { NativeBootstrap } from "@/components/native/NativeBootstrap";
import { SyncBootstrap } from "@/components/auth/SyncBootstrap";
import { BasemapBootstrap } from "@/components/native/BasemapBootstrap";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { AppLayout } from "./app/(app)/layout";
import { LegalLayout } from "./app/(legal)/layout";
import { Suspense, lazy } from "react";
import GlobalError from "./app/error";
import AppError from "./app/(app)/error";

// ── Loading skeletons (imported eagerly for instant fallbacks) ──────────
import { DiscoverSkeleton } from "./app/(app)/discover/DiscoverSkeleton";
import { GuideSkeleton } from "./app/(app)/guide/GuideSkeleton";
import { NewTripSkeleton } from "./app/(app)/new/NewTripSkeleton";
import { TripSkeleton } from "./app/(app)/trip/TripSkeleton";
import { JournalSkeleton } from "./app/(app)/journal/JournalSkeleton";
import LiveLoading from "./app/(app)/live/loading";
import LoginLoading from "./app/(app)/login/loading";
import PlacesLoading from "./app/(app)/places/loading";
import SosLoading from "./app/(app)/sos/loading";
import UntetheredLoading from "./app/(app)/untethered/loading";

// ── Lazy-loaded page components ────────────────────────────────────────
const LandingPage = lazy(() => import("./app/ClientPage"));

// App (tab) routes — these are rendered by PersistentTabs inside AppLayout,
// so the actual tab pages (trip, guide, discover, journal, sos) don't need
// individual lazy routes. Non-tab routes under (app) are lazy-loaded here.
const LoginPage = lazy(() => import("./app/(app)/login/page"));
const AuthCallbackPage = lazy(() => import("./app/(app)/auth/callback/page"));
const UntetheredPage = lazy(() => import("./app/(app)/untethered/page"));
const LiveTripClientPage = lazy(() => import("./app/(app)/live/ClientPage"));
const NewTripPage = lazy(() => import("./app/(app)/new/page"));
const PlacesPage = lazy(() => import("./app/(app)/places/page"));

// Legal routes
const AttributionsPage = lazy(() => import("./app/(legal)/attributions/page"));
const ContactPage = lazy(() => import("./app/(legal)/contact/page"));
const PrivacyPage = lazy(() => import("./app/(legal)/privacy/page"));
const TermsPage = lazy(() => import("./app/(legal)/terms/page"));

// Standalone routes
const PurchaseSuccessPage = lazy(() => import("./app/purchase/success/page"));

// Catch-all
const NotFoundClient = lazy(() =>
  import("@/components/ui/NotFoundClient").then((m) => ({ default: m.NotFoundClient }))
);

// ── Stub page for tab routes (PersistentTabs handles rendering) ────────
function NullPage() {
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary fallback={(props) => <GlobalError {...props} />}>
        <AuthProvider>
          <ServiceWorkerRegistration />
          <NativeBootstrap />
          <SyncBootstrap />
          <BasemapBootstrap />
          <Routes>
            {/* Landing */}
            <Route
              index
              element={
                <Suspense fallback={null}>
                  <LandingPage />
                </Suspense>
              }
            />

            {/* App shell routes */}
            <Route element={<ErrorBoundary fallback={(props) => <AppError {...props} />}><AppLayout /></ErrorBoundary>}>
            {/* Tab routes — PersistentTabs renders the actual content */}
            <Route path="discover" element={<NullPage />} />
            <Route path="guide" element={<NullPage />} />
            <Route path="journal" element={<NullPage />} />
            <Route path="trip" element={<NullPage />} />
            <Route path="sos" element={<NullPage />} />

            {/* Non-tab app routes */}
            <Route
              path="live"
              element={
                <Suspense fallback={<LiveLoading />}>
                  <LiveTripClientPage />
                </Suspense>
              }
            />
            <Route
              path="login"
              element={
                <Suspense fallback={<LoginLoading />}>
                  <LoginPage />
                </Suspense>
              }
            />
            <Route
              path="new"
              element={
                <Suspense fallback={<NewTripSkeleton />}>
                  <NewTripPage />
                </Suspense>
              }
            />
            <Route
              path="places"
              element={
                <Suspense fallback={<PlacesLoading />}>
                  <PlacesPage />
                </Suspense>
              }
            />
            <Route
              path="untethered"
              element={
                <Suspense fallback={<UntetheredLoading />}>
                  <UntetheredPage />
                </Suspense>
              }
            />
            <Route
              path="auth/callback"
              element={
                <Suspense fallback={null}>
                  <AuthCallbackPage />
                </Suspense>
              }
            />
          </Route>

          {/* Legal routes */}
          <Route element={<LegalLayout />}>
            <Route
              path="attributions"
              element={
                <Suspense fallback={null}>
                  <AttributionsPage />
                </Suspense>
              }
            />
            <Route
              path="contact"
              element={
                <Suspense fallback={null}>
                  <ContactPage />
                </Suspense>
              }
            />
            <Route
              path="privacy"
              element={
                <Suspense fallback={null}>
                  <PrivacyPage />
                </Suspense>
              }
            />
            <Route
              path="terms"
              element={
                <Suspense fallback={null}>
                  <TermsPage />
                </Suspense>
              }
            />
          </Route>

          {/* Standalone routes */}
          <Route
            path="purchase/success"
            element={
              <Suspense fallback={null}>
                <PurchaseSuccessPage />
              </Suspense>
            }
          />

          {/* 404 catch-all */}
          <Route
            path="*"
            element={
              <Suspense fallback={null}>
                <NotFoundClient />
              </Suspense>
            }
          />
          </Routes>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
