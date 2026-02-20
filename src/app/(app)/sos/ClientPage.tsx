// src/app/sos/ClientPage.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { haptic } from "@/lib/native/haptics";
import { useAuth } from "@/lib/supabase/auth";
import { listEmergencyContacts } from "@/lib/offline/emergencyStore";
import { emergencySyncOnce } from "@/lib/offline/emergencySync";
import { saveEmergencyContactLocalFirst, deleteEmergencyContactLocalFirst } from "@/lib/emergency/emergencyActions";

import type { EmergencyContactLocal } from "@/lib/types/emergency";
import { PhoneCall, MessageSquareText, Plus, Pencil, Trash2, Satellite, MapPin } from "lucide-react";

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
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

async function getPositionNative(timeoutMs = 120_000): Promise<{ lat: number; lon: number; accuracy_m: number | null }> {
  // Try Capacitor plugin dynamically (native)
  try {
    const mod: any = await import("@capacitor/geolocation");
    if (mod?.Geolocation?.getCurrentPosition) {
      const res = await mod.Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 5_000,
      });
      return {
        lat: res.coords.latitude,
        lon: res.coords.longitude,
        accuracy_m: typeof res.coords.accuracy === "number" ? res.coords.accuracy : null,
      };
    }
  } catch {
    // ignore
  }

  // Fallback: browser geolocation
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Geolocation not available on this device.");
  }

  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Location timeout.")), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(t);
        resolve(p);
      },
      (e) => {
        clearTimeout(t);
        reject(new Error(e?.message || "Could not get location."));
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: timeoutMs },
    );
  });

  return {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    accuracy_m: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
  };
}

export default function EmergencyClientPage() {
  const isOnline = useOnlineStatus();
  const { user } = useAuth();

  const [items, setItems] = useState<EmergencyContactLocal[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const [busy, setBusy] = useState<null | "boot" | "save" | "delete" | "sync" | "loc">(null);
  const [err, setErr] = useState<string | null>(null);
  const [elapsedWait, setElapsedWait] = useState(0); // Tracks seconds spent waiting for coaching msgs

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
  const timerDisplayRef = useRef<HTMLSpanElement>(null); // Fast DOM update ref

  const isLocating = lat == null || lon == null ? (busy === "boot" || busy === "loc") : false;

  // High-performance countdown timer & elapsed tracker
  useEffect(() => {
    if (!isLocating) {
      setElapsedWait(0);
      return;
    }

    const startTime = Date.now();
    const durationMs = 120_000; // 2 minutes
    const endTime = startTime + durationMs;
    let frameId: number;
    let lastSecond = 0;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      const elapsed = Math.floor((now - startTime) / 1000);

      // Update React state only once per second for dynamic coaching messages
      if (elapsed !== lastSecond) {
        setElapsedWait(elapsed);
        lastSecond = elapsed;
      }

      // Update the countdown DOM directly every frame for buttery smooth ms
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

    // Auto-select ALL contacts by default (emergency-first)
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
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      syncInFlightRef.current = false;
      setBusy((b) => (b === "sync" ? null : b));
    }
  }, [user, isOnline, refresh]);

  const fetchLocationAuto = useCallback(async () => {
    if (locInFlightRef.current) return;
    locInFlightRef.current = true;

    setBusy((b) => (b ? b : "loc"));
    setErr(null);
    try {
      const p = await getPositionNative(120_000); // 2 full minutes to allow hardware cold lock
      setLat(p.lat);
      setLon(p.lon);
      setAccuracyM(p.accuracy_m);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      locInFlightRef.current = false;
      setBusy((b) => (b === "loc" ? null : b));
    }
  }, []);

  // Boot: contacts + sync + location
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
        if (cancelled) return;

        // Immediate location fetch on load
        await fetchLocationAuto();
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setBusy(null);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [refresh, runAutoSync, fetchLocationAuto]);

  // Autosync loop
  useEffect(() => {
    runAutoSync();
  }, [runAutoSync]);

  useEffect(() => {
    if (!user || !isOnline) return;
    const t = setInterval(() => runAutoSync(), 30_000);
    return () => clearInterval(t);
  }, [user, isOnline, runAutoSync]);

  // Auto-refresh location periodically
  useEffect(() => {
    const t = setInterval(() => {
      fetchLocationAuto();
    }, 20_000);
    return () => clearInterval(t);
  }, [fetchLocationAuto]);

  // Populate editor
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
  }, [editingId]);

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
      setBusy("loc"); // Trigger the UI waiting state so they know it's working
      setElapsedWait(0);
      try {
        haptic.medium();
        const p = await getPositionNative(120_000); // 2 full minutes here too
        useLat = p.lat;
        useLon = p.lon;
        acc = p.accuracy_m;
        setLat(useLat);
        setLon(useLon);
        setAccuracyM(acc);
      } catch (e: any) {
        haptic.error();
        setErr(e?.message ?? String(e));
        setBusy(null);
        return;
      }
      setBusy(null);
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
    } catch (e: any) {
      haptic.error();
      setErr(e?.message ?? String(e));
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
      } catch (e: any) {
        haptic.error();
        setErr(e?.message ?? String(e));
      } finally {
        setBusy(null);
      }
    },
    [user, isOnline, refresh, editingId, runAutoSync],
  );

  // ==== UI (BIG, SOLID, OBVIOUS - MAPPED TO GLOBALS.CSS) ====
  const S = {
    page: {
      height: "100dvh",
      background: "var(--bg-sand)",
      color: "var(--text-main)",
      overflowY: "auto",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch",
      padding: "calc(var(--roam-safe-top) + 16px) 16px calc(var(--bottom-nav-height, 80px) + 24px) 16px",
      display: "grid",
      alignContent: "start",
      gap: "16px",
      boxSizing: "border-box",
    } as React.CSSProperties,

    call000: {
      width: "100%",
      height: 120,
      background: "var(--brand-ochre)",
      color: "#ffffff",
      borderRadius: "var(--radius-lg)",
      fontWeight: 900,
      fontSize: 40,
      letterSpacing: "-0.5px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      border: "none",
      boxShadow: "var(--shadow-heavy)",
      textTransform: "uppercase",
    } as React.CSSProperties,

    locBlock: {
      borderRadius: "var(--radius-lg)",
      background: "var(--surface-card)",
      padding: 20,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      boxShadow: "var(--shadow-soft)",
      minHeight: 100,
      justifyContent: "center",
    } as React.CSSProperties,
    
    locLabel: { fontSize: 14, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" } as React.CSSProperties,
    
    locValue: {
      fontSize: 24,
      fontWeight: 800,
      color: "var(--brand-ochre)",
      lineHeight: 1.1,
      wordBreak: "break-word",
      display: "flex",
      alignItems: "center",
      gap: 12,
    } as React.CSSProperties,

    locWaitText: {
      fontSize: 22,
      fontWeight: 800,
      color: "var(--brand-sky)", 
      lineHeight: 1.2,
      fontVariantNumeric: "tabular-nums", // Prevents the text from jittering
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    } as React.CSSProperties,

    msgBtn: {
      width: "100%",
      height: 88,
      background: "var(--brand-sky)",
      color: "#ffffff",
      borderRadius: "var(--radius-lg)",
      fontWeight: 800,
      fontSize: 20,
      letterSpacing: "-0.3px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      border: "none",
      boxShadow: "var(--shadow-button)",
      textTransform: "uppercase",
      transition: "opacity 0.2s var(--ease-out)",
    } as React.CSSProperties,

    err: {
      padding: 16,
      background: "var(--bg-error)",
      color: "var(--text-error)",
      borderRadius: "var(--radius-md)",
      fontWeight: 700,
      fontSize: 16,
      lineHeight: 1.25,
      boxShadow: "var(--shadow-soft)",
    } as React.CSSProperties,

    sectionTitle: {
      fontSize: 22,
      fontWeight: 800,
      color: "var(--text-main)",
      marginTop: 8,
      marginBottom: 0,
      letterSpacing: "-0.3px",
    } as React.CSSProperties,

    addBtn: {
      width: "100%",
      height: 64,
      borderRadius: "var(--radius-md)",
      background: "var(--surface-card)",
      color: "var(--text-main)",
      fontWeight: 800,
      fontSize: 18,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      border: "none",
      boxShadow: "var(--shadow-button)",
      textTransform: "uppercase",
    } as React.CSSProperties,

    contactRow: {
      padding: 16,
      borderRadius: "var(--radius-lg)",
      background: "var(--surface-card)",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      boxShadow: "var(--shadow-soft)",
    } as React.CSSProperties,
    
    contactTop: { display: "flex", alignItems: "center", gap: 16 } as React.CSSProperties,
    
    selectBtn: (on: boolean): React.CSSProperties => ({
      width: 56,
      height: 56,
      borderRadius: "var(--radius-md)",
      background: on ? "var(--brand-eucalypt)" : "var(--surface-muted)",
      color: on ? "#ffffff" : "var(--text-muted)",
      fontWeight: 900,
      fontSize: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "none",
      boxShadow: on ? "var(--tab-center-glow)" : "none",
      transition: "all 0.2s var(--spring)"
    }),
    
    contactName: { fontWeight: 800, fontSize: 22, letterSpacing: "-0.3px", color: "var(--text-main)" } as React.CSSProperties,
    contactMeta: { fontWeight: 600, fontSize: 16, color: "var(--text-muted)", marginTop: 4 } as React.CSSProperties,

    actionGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as React.CSSProperties,
    
    actionBtn: (bg: string, color: string): React.CSSProperties => ({
      height: 56,
      borderRadius: "var(--radius-md)",
      background: bg,
      color: color,
      fontWeight: 800,
      fontSize: 16,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      border: "none",
      boxShadow: "var(--shadow-button)",
      textTransform: "uppercase",
    }),

    editor: {
      padding: 20,
      borderRadius: "var(--radius-lg)",
      background: "var(--surface-card)",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      boxShadow: "var(--shadow-heavy)",
    } as React.CSSProperties,
    
    label: { fontSize: 14, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" } as React.CSSProperties,
    
    input: {
      height: 56,
      borderRadius: "var(--radius-md)",
      background: "var(--surface-muted)",
      color: "var(--text-main)",
      fontSize: 18,
      fontWeight: 700,
      padding: "0 16px",
      border: "none",
      outline: "none",
    } as React.CSSProperties,
    
    textarea: {
      borderRadius: "var(--radius-md)",
      background: "var(--surface-muted)",
      color: "var(--text-main)",
      fontSize: 18,
      fontWeight: 700,
      padding: 16,
      border: "none",
      outline: "none",
      resize: "vertical",
    } as React.CSSProperties,
    
    editorActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 } as React.CSSProperties,
    
    saveBtn: {
      height: 64,
      borderRadius: "var(--radius-md)",
      background: "var(--brand-eucalypt)",
      color: "#ffffff",
      fontWeight: 800,
      fontSize: 18,
      textTransform: "uppercase",
      border: "none",
      boxShadow: "var(--shadow-button)",
    } as React.CSSProperties,
    
    cancelBtn: {
      height: 64,
      borderRadius: "var(--radius-md)",
      background: "var(--surface-muted)",
      color: "var(--text-main)",
      fontWeight: 800,
      fontSize: 18,
      textTransform: "uppercase",
      border: "none",
    } as React.CSSProperties,
  };

  const selectedCount = selectedContacts.length;

  // Dynamic coaching logic based on time elapsed
  let waitMessage = "Acquiring GPS lock...";
  if (elapsedWait > 5) waitMessage = "Searching satellites. Ensure a clear view of the sky...";
  if (elapsedWait > 15) waitMessage = "Offline GPS cold lock (can take up to 2 mins)...";

  return (
    <div style={S.page}>
      {err ? <div style={S.err}>{err}</div> : null}

      {/* 1) TOP PRIORITY */}
      <button type="button" className="trip-interactive" onClick={callEmergency} style={S.call000}>
        <PhoneCall size={40} />
        CALL 000
      </button>

      {/* 2) AUTO LOCATION (WITH UX TIMER) */}
      <div style={S.locBlock}>
        <div style={S.locLabel}>Your coordinates are:</div>
        <div style={S.locValue}>
          {isLocating ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Satellite size={28} className="animate-pulse" color="var(--brand-sky)" />
                {/* Fast UI DOM ref for the countdown */}
                <span ref={timerDisplayRef} style={S.locWaitText}>02:00.000</span>
              </div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 600 }}>
                {waitMessage}
              </div>
            </div>
          ) : lat == null || lon == null ? (
            "Location unavailable"
          ) : (
            <>
              <MapPin size={28} />
              {fmt5(lat)}, {fmt5(lon)}{accuracyM ? ` (±${Math.round(accuracyM)}m)` : ""}
            </>
          )}
        </div>
      </div>

      {/* 3) BIG SECOND ACTION */}
      <button
        type="button"
        className="trip-interactive"
        onClick={sendLocationToSelected}
        disabled={items.length === 0}
        style={{ ...S.msgBtn, opacity: items.length === 0 ? 0.6 : 1 }}
        title={items.length === 0 ? "Add a contact first" : "Send location by SMS"}
      >
        <MessageSquareText size={28} />
        {selectedCount > 0 ? `MESSAGE ${selectedCount} CONTACT${selectedCount === 1 ? "" : "S"}` : "SELECT CONTACTS BELOW"}
      </button>

      {/* CONTACTS (SECONDARY) */}
      <div style={S.sectionTitle}>Contacts</div>

      <button type="button" className="trip-interactive" onClick={startNew} style={S.addBtn}>
        <Plus size={22} />
        Add Contact
      </button>

      {editingId ? (
        <div style={S.editor}>
          <div style={{ fontWeight: 800, fontSize: 20, color: "var(--text-main)" }}>
            {editingId === "__new__" ? "Add contact" : "Edit contact"}
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={S.label}>Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} style={S.input} placeholder="Mum" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={S.label}>Phone</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={S.input}
              placeholder="04xx xxx xxx"
              inputMode="tel"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={S.label}>Relationship (optional)</div>
            <input
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              style={S.input}
              placeholder="Partner / Friend"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={S.label}>Notes (optional)</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={S.textarea}
              rows={3}
              placeholder="Any instructions…"
            />
          </label>

          <div style={S.editorActions}>
            <button
              type="button"
              className="trip-interactive"
              onClick={save}
              disabled={busy === "save" || !name.trim() || !phone.trim()}
              style={{ ...S.saveBtn, opacity: busy === "save" || !name.trim() || !phone.trim() ? 0.7 : 1 }}
            >
              Save
            </button>

            <button type="button" className="trip-interactive" onClick={cancelEdit} style={S.cancelBtn}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: 16, textAlign: "center", padding: "20px 0" }}>
          No contacts saved.
        </div>
      ) : (
        items.map((c) => {
          const sel = !!selectedIds[c.id];
          return (
            <div key={c.id} style={S.contactRow}>
              <div style={S.contactTop}>
                <button
                  type="button"
                  className="trip-interactive"
                  onClick={() => toggleSelected(c.id)}
                  style={S.selectBtn(sel)}
                  aria-pressed={sel}
                  title={sel ? "Selected" : "Tap to select"}
                >
                  {sel ? "✓" : "+"}
                </button>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={S.contactName}>{c.name}</div>
                  <div style={S.contactMeta}>
                    {c.phone}
                    {c.relationship ? ` • ${c.relationship}` : ""}
                    {c.notes ? ` • ${c.notes}` : ""}
                  </div>
                </div>
              </div>

              <div style={S.actionGrid}>
                <a
                  href={telHref(c.phone)}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!confirm(`Call ${c.name} (${c.phone})?`)) return;
                    haptic.heavy();
                    window.location.href = telHref(c.phone);
                  }}
                  className="trip-interactive"
                  style={S.actionBtn("var(--brand-eucalypt)", "#ffffff")}
                >
                  <PhoneCall size={20} />
                  Call
                </a>

                <button
                  type="button"
                  className="trip-interactive"
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
                  style={S.actionBtn("var(--brand-sky)", "#ffffff")}
                >
                  <MessageSquareText size={20} />
                  Text
                </button>

                <button
                  type="button"
                  className="trip-interactive"
                  onClick={() => {
                    haptic.selection();
                    setEditingId(c.id);
                  }}
                  style={S.actionBtn("var(--surface-muted)", "var(--text-main)")}
                >
                  <Pencil size={18} />
                  Edit
                </button>

                <button
                  type="button"
                  className="trip-interactive"
                  onClick={() => remove(c.id)}
                  disabled={busy === "delete"}
                  style={{ ...S.actionBtn("var(--bg-error)", "var(--text-error)"), opacity: busy === "delete" ? 0.7 : 1 }}
                >
                  <Trash2 size={18} />
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