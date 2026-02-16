// src/app/emergency/ClientPage.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { haptic } from "@/lib/native/haptics";
import { useAuth } from "@/lib/supabase/auth";
import { listEmergencyContacts } from "@/lib/offline/emergencyStore";
import { emergencySyncOnce } from "@/lib/offline/emergencySync";
import { saveEmergencyContactLocalFirst, deleteEmergencyContactLocalFirst } from "@/lib/emergency/emergencyActions";

import type { EmergencyContactLocal } from "@/lib/types/emergency";

import {
  ArrowLeft,
  PhoneCall,
  ShieldAlert,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";

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

export default function EmergencyClientPage() {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const { user } = useAuth();

  const [items, setItems] = useState<EmergencyContactLocal[]>([]);
  const [busy, setBusy] = useState<null | "boot" | "save" | "delete" | "sync">(null);
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(() => items.find((x) => x.id === editingId) ?? null, [items, editingId]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [notes, setNotes] = useState("");

  const didBootRef = useRef(false);
  const syncInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    const next = await listEmergencyContacts();
    setItems(next);
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
      // keep it quiet-ish, but still surface if needed
      setErr(e?.message ?? String(e));
    } finally {
      syncInFlightRef.current = false;
      setBusy((b) => (b === "sync" ? null : b));
    }
  }, [user, isOnline, refresh]);

  // Boot local + initial autosync
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
  }, [refresh, runAutoSync]);

  // Autosync when auth/online changes
  useEffect(() => {
    runAutoSync();
  }, [runAutoSync]);

  // Background autosync loop while signed-in + online
  useEffect(() => {
    if (!user || !isOnline) return;
    const t = setInterval(() => {
      runAutoSync();
    }, 30_000);
    return () => clearInterval(t);
  }, [user, isOnline, runAutoSync]);

  // Populate editor on edit select
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
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

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

      // kick autosync (will no-op if not signed-in/online)
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
      if (!confirm("Delete this emergency contact?")) return;
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

  const callEmergency = useCallback(() => {
    if (!confirm("Call 000 now?")) return;
    haptic.heavy();
    window.location.href = "tel:000";
  }, []);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--roam-bg)",
        color: "var(--roam-text)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: "16px 14px 12px",
          background: "linear-gradient(to bottom, var(--roam-bg) 78%, rgba(0,0,0,0))",
          backdropFilter: "blur(10px)",
          flex: "0 0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="trip-btn-sm trip-interactive"
            onClick={() => {
              haptic.selection();
              router.push("/trip");
            }}
            style={{
              borderRadius: 999,
              minHeight: 42,
              padding: "0 14px",
              fontWeight: 950,
              background: "var(--roam-surface)",
              color: "var(--roam-text)",
              boxShadow: "var(--shadow-soft)",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ArrowLeft size={18} />
            Trip
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>
              Safety
            </div>
            <div
              className="trip-truncate"
              style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.2px" }}
            >
              Emergency
            </div>
          </div>

          {/* subtle autosync indicator */}
          {user ? (
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 900,
                background: isOnline ? "rgba(0,200,120,0.12)" : "rgba(255,180,0,0.12)",
                color: isOnline ? "rgba(0,160,90,1)" : "rgba(200,130,0,1)",
                whiteSpace: "nowrap",
              }}
              title={isOnline ? "Syncing automatically" : "Offline"}
            >
              {isOnline ? (busy === "sync" ? "Syncing…" : "Online") : "Offline"}
            </div>
          ) : null}
        </div>

        {err ? (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 14,
              background: "rgba(255,0,0,0.08)",
              color: "rgba(200,0,0,1)",
              fontWeight: 850,
              fontSize: 13,
            }}
          >
            {err}
          </div>
        ) : null}
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: "1 1 auto",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "0 14px",
          paddingBottom: "calc(var(--bottom-nav-height, 80px) + 24px)",
        }}
      >
        {/* Big 000 button */}
        <div
          style={{
            borderRadius: 18,
            padding: 14,
            background: "linear-gradient(180deg, rgba(255,0,0,0.14), rgba(255,0,0,0.06))",
            border: "1px solid rgba(255,0,0,0.18)",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          <div style={{ fontWeight: 950, fontSize: 14, marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <ShieldAlert size={18} />
            Emergency services
          </div>

          <button
            type="button"
            onClick={callEmergency}
            className="trip-interactive"
            style={{
              width: "100%",
              minHeight: 56,
              borderRadius: 16,
              fontWeight: 980,
              letterSpacing: "-0.2px",
              background: "rgba(255,0,0,0.18)",
              border: "1px solid rgba(255,0,0,0.25)",
              color: "rgba(255,220,220,1)",
              boxShadow: "var(--shadow-soft)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <PhoneCall size={20} />
            Call 000
          </button>
        </div>

        {/* Contacts header */}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 950 }}>Emergency contacts</div>
          <button
            type="button"
            className="trip-btn-sm trip-interactive"
            onClick={startNew}
            style={{
              borderRadius: 999,
              minHeight: 42,
              padding: "0 14px",
              fontWeight: 950,
              background: "var(--roam-surface)",
              color: "var(--roam-text)",
              boxShadow: "var(--shadow-soft)",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Plus size={18} />
            Add
          </button>
        </div>

        {/* Editor */}
        {editingId ? (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 16,
              background: "var(--roam-surface)",
              boxShadow: "var(--shadow-soft)",
              border: "1px solid var(--roam-border)",
            }}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>
                  Name
                </div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mum"
                  style={{
                    height: 44,
                    borderRadius: 12,
                    padding: "0 12px",
                    background: "var(--roam-surface-hover)",
                    border: "1px solid var(--roam-border)",
                    color: "var(--roam-text)",
                    outline: "none",
                    fontWeight: 850,
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>
                  Phone
                </div>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 04xx xxx xxx"
                  inputMode="tel"
                  style={{
                    height: 44,
                    borderRadius: 12,
                    padding: "0 12px",
                    background: "var(--roam-surface-hover)",
                    border: "1px solid var(--roam-border)",
                    color: "var(--roam-text)",
                    outline: "none",
                    fontWeight: 850,
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>
                  Relationship
                </div>
                <input
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="Optional"
                  style={{
                    height: 44,
                    borderRadius: 12,
                    padding: "0 12px",
                    background: "var(--roam-surface-hover)",
                    border: "1px solid var(--roam-border)",
                    color: "var(--roam-text)",
                    outline: "none",
                    fontWeight: 850,
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>
                  Notes
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                  rows={3}
                  style={{
                    borderRadius: 12,
                    padding: "10px 12px",
                    background: "var(--roam-surface-hover)",
                    border: "1px solid var(--roam-border)",
                    color: "var(--roam-text)",
                    outline: "none",
                    fontWeight: 800,
                    resize: "vertical",
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy === "save"}
                  className="trip-interactive"
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 14,
                    fontWeight: 950,
                    background: "var(--roam-accent)",
                    color: "var(--roam-accent-contrast, #000)",
                    boxShadow: "var(--shadow-soft)",
                    opacity: busy === "save" ? 0.7 : 1,
                  }}
                >
                  {busy === "save" ? "Saving…" : "Save"}
                </button>

                <button
                  type="button"
                  onClick={cancelEdit}
                  className="trip-interactive"
                  style={{
                    minHeight: 48,
                    borderRadius: 14,
                    fontWeight: 950,
                    padding: "0 14px",
                    background: "var(--roam-surface-hover)",
                    border: "1px solid var(--roam-border)",
                    color: "var(--roam-text)",
                    boxShadow: "var(--shadow-soft)",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Contacts list */}
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {items.length === 0 ? (
            <div
              style={{
                padding: 14,
                borderRadius: 16,
                background: "var(--roam-surface)",
                color: "var(--roam-text-muted)",
                fontWeight: 850,
                boxShadow: "var(--shadow-soft)",
              }}
            >
              No emergency contacts saved.
            </div>
          ) : (
            items.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: 12,
                  borderRadius: 16,
                  background: "var(--roam-surface)",
                  boxShadow: "var(--shadow-soft)",
                  border: "1px solid var(--roam-border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }} className="trip-truncate">
                    {c.name}
                  </div>
                  <div
                    style={{ fontWeight: 850, fontSize: 12, color: "var(--roam-text-muted)" }}
                    className="trip-truncate"
                  >
                    {c.phone}
                    {c.relationship ? ` • ${c.relationship}` : ""}
                  </div>
                </div>

                <a
                  href={telHref(c.phone)}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!confirm(`Call ${c.name} (${c.phone})?`)) return;
                    haptic.medium();
                    window.location.href = telHref(c.phone);
                  }}
                  className="trip-interactive"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 44,
                    padding: "0 12px",
                    borderRadius: 999,
                    background: "var(--roam-surface-hover)",
                    border: "1px solid var(--roam-border)",
                    color: "var(--roam-text)",
                    fontWeight: 950,
                    boxShadow: "var(--shadow-soft)",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    gap: 8,
                  }}
                  title="Call"
                >
                  <PhoneCall size={18} />
                  Call
                </a>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setEditingId(c.id);
                  }}
                  className="trip-interactive"
                  style={{
                    minHeight: 44,
                    padding: "0 12px",
                    borderRadius: 999,
                    background: "var(--roam-surface-hover)",
                    border: "1px solid var(--roam-border)",
                    color: "var(--roam-text)",
                    fontWeight: 950,
                    boxShadow: "var(--shadow-soft)",
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  title="Edit"
                >
                  <Pencil size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={busy === "delete"}
                  className="trip-interactive"
                  style={{
                    minHeight: 44,
                    padding: "0 12px",
                    borderRadius: 999,
                    background: "rgba(255,0,0,0.10)",
                    border: "1px solid rgba(255,0,0,0.20)",
                    color: "rgba(255,120,120,1)",
                    fontWeight: 950,
                    boxShadow: "var(--shadow-soft)",
                    whiteSpace: "nowrap",
                    opacity: busy === "delete" ? 0.7 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Delete"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
