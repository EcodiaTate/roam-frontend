// src/app/sos/ClientPage.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Capacitor } from "@capacitor/core";
import { haptic } from "@/lib/native/haptics";
import { useAuth } from "@/lib/supabase/auth";
import { listEmergencyContacts } from "@/lib/offline/emergencyStore";
import { emergencySyncOnce } from "@/lib/offline/emergencySync";
import { saveEmergencyContactLocalFirst, deleteEmergencyContactLocalFirst } from "@/lib/emergency/emergencyActions";

import type { EmergencyContactLocal } from "@/lib/types/emergency";
import { PhoneCall, MessageSquareText, Plus, Pencil, Trash2, Satellite, MapPin, RefreshCw } from "lucide-react";

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `em_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function useOnlineStatus() {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function telHref(phone: string) {
  const trimmed = (phone ?? "").trim();
  const normalized = trimmed.replace(/[^\d+]/g, "");
  return `tel:${normalized}`;
}

function smsHref(phones: string[], body: string) {
  const normalizedPhones = (phones ?? [])
    .map((p) => (p ?? "").trim().replace(/[^\d+]/g, ""))
    .filter(Boolean);

  const to = normalizedPhones.join(",");
  return `sms:${to}?body=${encodeURIComponent(body ?? "")}`;
}

function fmt5(x: number) {
  return (Math.round(x * 1e5) / 1e5).toFixed(5);
}

function mapsLink(lat: number, lon: number) {
  return `https://maps.google.com/?q=${encodeURIComponent(`${lat},${lon}`)}`;
}

type GeoResult = { lat: number; lon: number; accuracy_m: number | null };

function isLocationGranted(perms: { location: string; coarseLocation: string }) {
  return perms.location === "granted" || perms.coarseLocation === "granted";
}

async function getPositionNative(timeoutMs = 120_000): Promise<GeoResult> {
  // 1. Try Native Capacitor Geolocation first
  try {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");

      // Mobile OS requires explicit permission checks before getting location
      let perms = await Geolocation.checkPermissions();
      if (!isLocationGranted(perms)) {
        perms = await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
      }
      if (!isLocationGranted(perms)) {
        throw new Error("Location permission denied. Please allow it in Settings → Roam → Location.");
      }

      return await new Promise<GeoResult>((resolve, reject) => {
        let settled = false;
        let watchId: string | null = null;

        const stop = () => {
          if (watchId != null) Geolocation.clearWatch({ id: watchId }).catch(() => {});
        };

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          stop();
          reject(new Error("Location timeout - move to open sky and retry."));
        }, timeoutMs);

        Geolocation.watchPosition(
          { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
          (pos, err) => {
            if (settled) return;

            if (err) {
              settled = true;
              clearTimeout(timer);
              stop();
              reject(new Error(err?.message || "Location error."));
              return;
            }

            if (pos) {
              settled = true;
              clearTimeout(timer);
              stop();
              resolve({
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy_m: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
              });
            }
          }
        ).then((id) => {
          watchId = id;
          if (settled) stop();
        }).catch(() => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new Error("Failed to start location watch."));
          }
        });
      });
    }
  } catch (e: unknown) {
    // Bubble up explicit permission errors so the user knows they blocked it
    if (e instanceof Error && e.message?.includes("permission")) {
      throw e;
    }
    // Otherwise fall through to browser API
  }

  // 2. Fallback: Browser navigator.geolocation
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Geolocation not available on this device.");
  }

  return new Promise<GeoResult>((resolve, reject) => {
    let watchId: number | null = null;
    let settled = false;

    const stop = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      stop();
      reject(new Error("Location timeout - move to open sky and retry."));
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stop();
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy_m: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
        });
      },
      (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stop();
        reject(new Error(e?.message || "Could not get location."));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
    );
  });
}

export default function EmergencyClientPage() {
  const isOnline = useOnlineStatus();
  const { user } = useAuth();

  const [items, setItems] = useState<EmergencyContactLocal[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const [busy, setBusy] = useState<null | "boot" | "save" | "delete" | "sync">(null);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [elapsedWait, setElapsedWait] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(() => items.find((x) => x.id === editingId) ?? null, [items, editingId]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [notes, setNotes] = useState("");

  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);

  const didBootRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const locInFlightRef = useRef(false);
  const timerDisplayRef = useRef<HTMLSpanElement>(null);

  const isLocating = locating && (lat == null || lon == null);

  useEffect(() => {
    if (!isLocating) {
      setElapsedWait(0);
      return;
    }

    const startTime = Date.now();
    const durationMs = 120_000;
    const endTime = startTime + durationMs;
    let frameId: number;
    let lastSecond = 0;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      const elapsed = Math.floor((now - startTime) / 1000);

      if (elapsed !== lastSecond) {
        setElapsedWait(elapsed);
        lastSecond = elapsed;
      }

      if (timerDisplayRef.current) {
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const ms = Math.floor(remaining % 1000);

        const formattedTime =
          String(mins).padStart(2, '0') + ':' +
          String(secs).padStart(2, '0') + '.' +
          String(ms).padStart(3, '0');

        timerDisplayRef.current.textContent = formattedTime;
      }

      if (remaining > 0) {
        frameId = requestAnimationFrame(updateTimer);
      }
    };

    frameId = requestAnimationFrame(updateTimer);

    return () => cancelAnimationFrame(frameId);
  }, [isLocating]);

  const refresh = useCallback(async () => {
    const next = await listEmergencyContacts();
    setItems(next);

    setSelectedIds((prev) => {
      const hasAnyPrev = Object.keys(prev || {}).length > 0;
      if (hasAnyPrev) {
        const still: Record<string, boolean> = {};
        for (const c of next) if (prev[c.id]) still[c.id] = true;
        return still;
      }
      const all: Record<string, boolean> = {};
      for (const c of next) all[c.id] = true;
      return all;
    });
  }, []);

  const runAutoSync = useCallback(async () => {
    if (!user || !isOnline) return;
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    setBusy((b) => (b ? b : "sync"));
    try {
      await emergencySyncOnce(user);
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      syncInFlightRef.current = false;
      setBusy((b) => (b === "sync" ? null : b));
    }
  }, [user, isOnline, refresh]);

  const fetchLocationAuto = useCallback(async (force = false) => {
    // force=true allows the retry button to bypass the in-flight guard
    if (locInFlightRef.current && !force) return;
    locInFlightRef.current = true;
    setLocating(true);
    setErr(null);
    try {
      const p = await getPositionNative(120_000);
      setLat(p.lat);
      setLon(p.lon);
      setAccuracyM(p.accuracy_m);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      locInFlightRef.current = false;
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (didBootRef.current) return;
      didBootRef.current = true;

      setBusy("boot");
      setErr(null);
      try {
        await refresh();
        if (cancelled) return;
        await runAutoSync();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(null);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [refresh, runAutoSync]);

  useEffect(() => {
    runAutoSync();
  }, [runAutoSync]);

  useEffect(() => {
    if (!user || !isOnline) return;
    const t = setInterval(() => runAutoSync(), 30_000);
    return () => clearInterval(t);
  }, [user, isOnline, runAutoSync]);

  useEffect(() => {
    fetchLocationAuto();
  }, [fetchLocationAuto]);

  useEffect(() => {
    const t = setInterval(() => {
      fetchLocationAuto();
    }, 20_000);
    return () => clearInterval(t);
  }, [fetchLocationAuto]);

  useEffect(() => {
    if (!editing) {
      setName("");
      setPhone("");
      setRelationship("");
      setNotes("");
      return;
    }
    setName(editing.name ?? "");
    setPhone(editing.phone ?? "");
    setRelationship(editing.relationship ?? "");
    setNotes(editing.notes ?? "");
  }, [editingId, editing]);

  const callEmergency = useCallback(() => {
    if (!confirm("Call 000 now?")) return;
    haptic.heavy();
    window.location.href = "tel:000";
  }, []);

  const toggleSelected = useCallback((id: string) => {
    haptic.selection();
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const selectedContacts = useMemo(() => {
    const map = selectedIds ?? {};
    return items.filter((c) => !!map[c.id]);
  }, [items, selectedIds]);

  const sendLocationToSelected = useCallback(async () => {
    if (selectedContacts.length === 0) {
      setErr("Select at least one contact.");
      haptic.error();
      return;
    }

    let useLat = lat;
    let useLon = lon;
    let acc = accuracyM;

    if (useLat == null || useLon == null) {
      setErr(null);
      setLocating(true);
      try {
        haptic.medium();
        const p = await getPositionNative(120_000);
        useLat = p.lat;
        useLon = p.lon;
        acc = p.accuracy_m;
        setLat(useLat);
        setLon(useLon);
        setAccuracyM(acc);
      } catch (e: unknown) {
        haptic.error();
        setErr(e instanceof Error ? e.message : String(e));
        setLocating(false);
        return;
      }
      setLocating(false);
    }

    const coords = `${fmt5(useLat!)}, ${fmt5(useLon!)}${acc ? ` (±${Math.round(acc)}m)` : ""}`;
    const link = mapsLink(useLat!, useLon!);
    const time = new Date().toLocaleString();

    const msg =
      `ROAM SAFETY: I need help.\n` +
      `Your coordinates are: ${coords}\n` +
      `Map: ${link}\n` +
      `Time: ${time}`;

    haptic.heavy();
    window.location.href = smsHref(selectedContacts.map((c) => c.phone), msg);
  }, [selectedContacts, lat, lon, accuracyM]);

  const startNew = useCallback(() => {
    haptic.selection();
    setErr(null);
    setEditingId("__new__");
    setName("");
    setPhone("");
    setRelationship("");
    setNotes("");
  }, []);

  const cancelEdit = useCallback(() => {
    haptic.selection();
    setErr(null);
    setEditingId(null);
  }, []);

  const save = useCallback(async () => {
    setBusy("save");
    setErr(null);
    try {
      haptic.medium();
      const id = editingId && editingId !== "__new__" ? editingId : randomId();

      await saveEmergencyContactLocalFirst({
        user,
        isOnline,
        contact: {
          id,
          name: name.trim(),
          phone: phone.trim(),
          relationship: relationship.trim() || null,
          notes: notes.trim() || null,
          updated_at: nowIso(),
        },
      });

      await refresh();
      setEditingId(null);
      runAutoSync();
      haptic.success();
    } catch (e: unknown) {
      haptic.error();
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [editingId, name, phone, relationship, notes, user, isOnline, refresh, runAutoSync]);

  const remove = useCallback(
    async (id: string) => {
      if (!confirm("Delete this contact?")) return;
      setBusy("delete");
      setErr(null);
      try {
        haptic.heavy();
        await deleteEmergencyContactLocalFirst({ user, isOnline, id });
        await refresh();
        if (editingId === id) setEditingId(null);
        runAutoSync();
        haptic.success();
      } catch (e: unknown) {
        haptic.error();
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [user, isOnline, refresh, editingId, runAutoSync],
  );

  const selectedCount = selectedContacts.length;

  let waitMessage = "Acquiring GPS lock...";
  if (elapsedWait > 5) waitMessage = "Searching satellites. Ensure a clear view of the sky...";
  if (elapsedWait > 15) waitMessage = "Offline GPS cold lock (can take up to 2 mins)...";

  return (
    <div className="sos-page roam-scroll">
      {err ? <div className="trip-err-box">{err}</div> : null}

      {/* 1) TOP PRIORITY - CALL 000 */}
      <button type="button" className="sos-call-000" onClick={callEmergency}>
        <PhoneCall size={40} />
        CALL 000
      </button>

      {/* 2) AUTO LOCATION (WITH UX TIMER) */}
      <div className="sos-location-block" data-locating={isLocating ? "true" : undefined}>
        <div className="sos-loc-label">Your coordinates are:</div>
        <div className="sos-loc-value">
          {isLocating ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Satellite size={28} className="animate-pulse" style={{ color: "var(--roam-info)" }} />
                <span ref={timerDisplayRef} className="sos-loc-wait">02:00.000</span>
              </div>
              <div className="trip-muted">
                {waitMessage}
              </div>
            </div>
          ) : lat == null || lon == null ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <div className="trip-muted">Location unavailable</div>
              <button
                type="button"
                className="trip-interactive sos-retry-loc-btn"
                onClick={() => {
                  haptic.medium();
                  fetchLocationAuto(true);
                }}
              >
                <RefreshCw size={16} />
                Retry location
              </button>
              <div className="trip-muted" style={{ fontSize: 13 }}>
                If this keeps failing, go to Settings → Roam → Location and set to &quot;While Using&quot;.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <MapPin size={28} />
              <span>{fmt5(lat)}, {fmt5(lon)}{accuracyM ? ` (±${Math.round(accuracyM)}m)` : ""}</span>
              <button
                type="button"
                className="trip-interactive sos-retry-loc-btn"
                onClick={() => {
                  haptic.light();
                  fetchLocationAuto(true);
                }}
                title="Refresh location"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3) BIG SECOND ACTION */}
      <button
        type="button"
        className="sos-msg-btn"
        onClick={sendLocationToSelected}
        disabled={items.length === 0}
        title={items.length === 0 ? "Add a contact first" : "Send location by SMS"}
      >
        <MessageSquareText size={28} />
        {selectedCount > 0 ? `MESSAGE ${selectedCount} CONTACT${selectedCount === 1 ? "" : "S"}` : "SELECT CONTACTS BELOW"}
      </button>

      {/* CONTACTS (SECONDARY) */}
      <div className="sos-section-title">Contacts</div>

      <button type="button" className="trip-interactive sos-add-btn" onClick={startNew}>
        <Plus size={22} />
        Add Contact
      </button>

      {editingId ? (
        <div className="sos-editor">
          <div style={{ fontWeight: 800, fontSize: 20 }}>
            {editingId === "__new__" ? "Add contact" : "Edit contact"}
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <div className="sos-label">Name</div>
            <input className="sos-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mum" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div className="sos-label">Phone</div>
            <input
              className="sos-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="04xx xxx xxx"
              inputMode="tel"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div className="sos-label">Relationship (optional)</div>
            <input
              className="sos-input"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="Partner / Friend"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div className="sos-label">Notes (optional)</div>
            <textarea
              className="sos-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any instructions..."
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            <button
              type="button"
              className="trip-btn trip-btn-primary"
              onClick={save}
              disabled={busy === "save" || !name.trim() || !phone.trim()}
            >
              Save
            </button>
            <button type="button" className="trip-btn trip-btn-secondary" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="trip-muted" style={{ textAlign: "center", padding: "20px 0", fontSize: 16 }}>
          No contacts saved.
        </div>
      ) : (
        items.map((c) => {
          const sel = !!selectedIds[c.id];
          return (
            <div key={c.id} className="sos-contact-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button
                  type="button"
                  className="trip-interactive sos-select-circle"
                  onClick={() => toggleSelected(c.id)}
                  data-selected={sel ? "true" : "false"}
                  aria-pressed={sel}
                  title={sel ? "Selected" : "Tap to select"}
                >
                  {sel ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-8.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.3px" }}>{c.name}</div>
                  <div className="trip-muted" style={{ marginTop: 3 }}>
                    {c.phone}
                    {c.relationship ? ` · ${c.relationship}` : ""}
                    {c.notes ? ` · ${c.notes}` : ""}
                  </div>
                </div>
              </div>

              <div className="sos-action-grid">
                <a
                  href={telHref(c.phone)}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!confirm(`Call ${c.name} (${c.phone})?`)) return;
                    haptic.heavy();
                    window.location.href = telHref(c.phone);
                  }}
                  className="trip-interactive sos-action-btn"
                  style={{ background: "var(--roam-accent)", color: "var(--on-color)" }}
                >
                  <PhoneCall size={18} />
                  Call
                </a>

                <button
                  type="button"
                  className="trip-interactive sos-action-btn"
                  onClick={() => {
                    if (!lat || !lon) {
                      setErr("Location unavailable right now.");
                      haptic.error();
                      return;
                    }
                    const coords = `${fmt5(lat)}, ${fmt5(lon)}${accuracyM ? ` (±${Math.round(accuracyM)}m)` : ""}`;
                    const link = mapsLink(lat, lon);
                    const time = new Date().toLocaleString();

                    const msg =
                      `ROAM SAFETY: I need help.\n` +
                      `Your coordinates are: ${coords}\n` +
                      `Map: ${link}\n` +
                      `Time: ${time}`;

                    haptic.heavy();
                    window.location.href = smsHref([c.phone], msg);
                  }}
                  style={{ background: "var(--roam-info)", color: "var(--on-color)" }}
                >
                  <MessageSquareText size={18} />
                  Text
                </button>

                <button
                  type="button"
                  className="trip-interactive sos-action-btn"
                  onClick={() => {
                    haptic.selection();
                    setEditingId(c.id);
                  }}
                  style={{ background: "var(--roam-surface-hover)", color: "var(--roam-text)" }}
                >
                  <Pencil size={16} />
                  Edit
                </button>

                <button
                  type="button"
                  className="trip-interactive sos-action-btn"
                  onClick={() => remove(c.id)}
                  disabled={busy === "delete"}
                  style={{ background: "var(--bg-error)", color: "var(--text-error)" }}
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
