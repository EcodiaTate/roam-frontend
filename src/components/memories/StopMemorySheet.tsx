// src/components/memories/StopMemorySheet.tsx
//
// Bottom-sheet for adding/editing a stop's journal entry (note + photos).
// Opened when user taps a proximity notification or manually from the trip view.

"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { StopMemory } from "@/lib/types/memories";
import {
  getMemoryForStop,
  saveMemory,
  addPhoto,
  removePhoto,
} from "@/lib/offline/memoriesStore";
import { haptic } from "@/lib/native/haptics";
import { isNative, hasPlugin } from "@/lib/native/platform";
import { cx } from "@/lib/utils/cx";
import {
  X,
  Camera,
  ImagePlus,
  Trash2,
  MapPin,
  Clock,
  Loader2,
  BookOpen,
} from "lucide-react";

import { PhotoLightbox } from "@/components/ui/PhotoLightbox";
import s from "./StopMemorySheet.module.css";

/* ── Types ────────────────────────────────────────────────────────────── */

export type StopMemorySheetProps = {
  open: boolean;
  planId: string;
  stopId: string;
  stopName: string | null;
  stopIndex: number;
  lat: number;
  lng: number;
  onClose: () => void;
  onSaved?: (memory: StopMemory) => void;
};

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatArrival(ts: number | null): string {
  if (!ts) return "Not yet arrived";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const SAVING_QUIPS = [
  "Locking in the memory\u2026",
  "Writing it down\u2026",
  "Preserving the moment\u2026",
];

/** Use Capacitor Camera if available, fall back to file input */
async function takePhoto(): Promise<File | null> {
  if (isNative && hasPlugin("Camera")) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import(
        "@capacitor/camera"
      );
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        width: 1600,
        height: 1200,
      });
      if (photo.webPath) {
        const resp = await fetch(photo.webPath);
        const blob = await resp.blob();
        return new File([blob], `photo_${Date.now()}.${photo.format}`, {
          type: `image/${photo.format}`,
        });
      }
    } catch {
      // User cancelled or camera unavailable
    }
    return null;
  }
  // Web fallback — handled by file input
  return null;
}

async function pickFromGallery(): Promise<File | null> {
  if (isNative && hasPlugin("Camera")) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import(
        "@capacitor/camera"
      );
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
        width: 1600,
        height: 1200,
      });
      if (photo.webPath) {
        const resp = await fetch(photo.webPath);
        const blob = await resp.blob();
        return new File([blob], `photo_${Date.now()}.${photo.format}`, {
          type: `image/${photo.format}`,
        });
      }
    } catch {
      // User cancelled
    }
    return null;
  }
  return null;
}

/* ── Rotating quip hook ──────────────────────────────────────────────── */

function useRotatingQuip(quips: string[], active: boolean): string {
  const [idx, setIdx] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setIdx(0); }, [active]);

  useEffect(() => {
    if (!active) {
      if (ref.current) clearInterval(ref.current);
      return;
    }
    ref.current = setInterval(() => setIdx((i) => (i + 1) % quips.length), 2500);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [active, quips.length]);

  return quips[active ? idx : 0] ?? quips[0] ?? "";
}

/* ── Component ────────────────────────────────────────────────────────── */

export function StopMemorySheet({
  open,
  planId,
  stopId,
  stopName,
  stopIndex,
  lat,
  lng,
  onClose,
  onSaved,
}: StopMemorySheetProps) {
  const [memory, setMemory] = useState<StopMemory | null>(null);
  const [note, setNote] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const savingQuip = useRotatingQuip(SAVING_QUIPS, saving);

  // ── Entrance transition ──
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(raf);
    }
    setMounted(false);
  }, [open]);

  // ── Drag-to-dismiss ──
  const dragState = useRef<{ startY: number; startTranslate: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  const onDragPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (busy || saving) return;
    dragState.current = { startY: e.clientY, startTranslate: dragY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [dragY, busy, saving]);

  const onDragPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const delta = e.clientY - dragState.current.startY;
    setDragY(Math.max(0, dragState.current.startTranslate + delta));
  }, []);

  const onDragPointerUp = useCallback(() => {
    if (!dragState.current) return;
    if (dragY > 120) onClose();
    setDragY(0);
    dragState.current = null;
  }, [dragY, onClose]);

  // Load existing memory when opened
  useEffect(() => {
    if (!open) {
      setSaving(false);
      setDragY(0);
      dragState.current = null;
      return;
    }
    let cancelled = false;

    (async () => {
      const existing = await getMemoryForStop(planId, stopId);
      if (cancelled) return;

      if (existing) {
        setMemory(existing);
        setNote(existing.note ?? "");
        const urls = existing.photos.map(
          (p) => p.localUrl ?? p.url ?? "",
        ).filter(Boolean);
        setPhotoUrls(urls);
      } else {
        const now = new Date().toISOString();
        const fresh: StopMemory = {
          id: crypto.randomUUID(),
          plan_id: planId,
          stop_id: stopId,
          stop_name: stopName,
          stop_index: stopIndex,
          note: null,
          photos: [],
          arrived_at: null,
          lat,
          lng,
          created_at: now,
          updated_at: now,
          dirty: true,
        };
        setMemory(fresh);
        setNote("");
        setPhotoUrls([]);
      }
    })();

    return () => { cancelled = true; };
  }, [open, planId, stopId, stopName, stopIndex, lat, lng]);

  // Auto-focus textarea when sheet opens
  useEffect(() => {
    if (open && textareaRef.current) {
      const t = setTimeout(() => textareaRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSave = useCallback(async () => {
    if (!memory || saving) return;
    setSaving(true);
    haptic.tap();
    try {
      const updated = await saveMemory({
        ...memory,
        note: note.trim() || null,
      });
      setMemory(updated);
      onSaved?.(updated);
      haptic.success();
      // Brief pause so saving state is visible
      setTimeout(() => {
        setSaving(false);
        onClose();
      }, 600);
    } catch (e) {
      console.warn("[StopMemorySheet] save failed:", e);
      haptic.error();
      setSaving(false);
    }
  }, [memory, note, onSaved, onClose, saving]);

  const handleTakePhoto = useCallback(async () => {
    if (!memory) return;
    if (memory.photos.length >= 5) {
      haptic.warning();
      return;
    }
    setBusy(true);
    try {
      const file = await takePhoto();
      if (file) {
        const updated = await addPhoto(memory.id, file);
        setMemory(updated);
        const urls = updated.photos
          .map((p) => p.localUrl ?? p.url ?? "")
          .filter(Boolean);
        setPhotoUrls(urls);
        haptic.success();
      } else if (!isNative) {
        if (fileInputRef.current) {
          fileInputRef.current.setAttribute("capture", "environment");
          fileInputRef.current.click();
        }
      }
    } finally {
      setBusy(false);
    }
  }, [memory]);

  const handlePickPhoto = useCallback(async () => {
    if (!memory) return;
    if (memory.photos.length >= 5) {
      haptic.warning();
      return;
    }
    setBusy(true);
    try {
      const file = await pickFromGallery();
      if (file) {
        const updated = await addPhoto(memory.id, file);
        setMemory(updated);
        const urls = updated.photos
          .map((p) => p.localUrl ?? p.url ?? "")
          .filter(Boolean);
        setPhotoUrls(urls);
        haptic.success();
      } else if (!isNative) {
        if (fileInputRef.current) {
          fileInputRef.current.removeAttribute("capture");
          fileInputRef.current.click();
        }
      }
    } finally {
      setBusy(false);
    }
  }, [memory]);

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!memory) return;
      const file = e.target.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const updated = await addPhoto(memory.id, file);
        setMemory(updated);
        const urls = updated.photos
          .map((p) => p.localUrl ?? p.url ?? "")
          .filter(Boolean);
        setPhotoUrls(urls);
        haptic.success();
      } finally {
        setBusy(false);
        e.target.value = "";
      }
    },
    [memory],
  );

  const handleRemovePhoto = useCallback(
    async (index: number) => {
      if (!memory) return;
      haptic.medium();

      // Optimistic: remove from UI immediately
      const prevMemory = memory;
      const prevUrls = photoUrls;
      const optimisticPhotos = [...memory.photos];
      optimisticPhotos.splice(index, 1);
      const optimisticMemory = { ...memory, photos: optimisticPhotos };
      setMemory(optimisticMemory);
      setPhotoUrls(
        optimisticPhotos.map((p) => p.localUrl ?? p.url ?? "").filter(Boolean),
      );

      // Persist in background — revert on failure
      try {
        const updated = await removePhoto(memory.id, index);
        setMemory(updated);
        setPhotoUrls(
          updated.photos.map((p) => p.localUrl ?? p.url ?? "").filter(Boolean),
        );
      } catch {
        // Revert
        setMemory(prevMemory);
        setPhotoUrls(prevUrls);
        haptic.error();
      }
    },
    [memory, photoUrls],
  );

  if (!open) return null;

  const photoCount = memory?.photos.length ?? 0;
  const canAddPhoto = photoCount < 5;
  const displayName = stopName ?? `Stop ${stopIndex + 1}`;

  return (
    <>
      {/* Backdrop */}
      <div
        className={s.backdrop}
        onClick={saving ? undefined : onClose}
      />

      {/* Sheet */}
      <div
        className={s.sheet}
        style={{
          transform: mounted
            ? `translateX(-50%) translateY(${dragY}px)`
            : "translateX(-50%) translateY(100%)",
          transition: dragState.current ? "none" : "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero band (includes drag handle) */}
        <div className={s.hero}
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          style={{ cursor: saving ? "default" : "grab" }}
        >
          <div className={s.dragHandle} />
          <div className={s.heroRing1} />
          <div className={s.heroRing2} />

          {/* Badge */}
          <div className={s.heroBadge}>
            <BookOpen size={10} style={{ color: "rgba(255,255,255,0.85)" }} />
            <span className={s.heroBadgeText}>Stop memory</span>
          </div>

          {/* Stop name */}
          <h3 className={s.heroTitle}>{displayName}</h3>

          {/* Arrival time */}
          <div className={s.heroMeta}>
            <Clock size={11} strokeWidth={2} />
            {formatArrival(memory?.arrived_at ?? null)}
          </div>

          {/* Close button */}
          {!saving && (
            <button
              type="button"
              className={s.heroClose}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onClose}
            >
              <X size={15} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* ── Body ── */}
        {saving ? (
          /* Saving overlay */
          <div className={s.savingOverlay}>
            <div className={s.savingRing}>
              <div className={s.savingRingBorder} />
              <BookOpen size={20} style={{ color: "var(--brand-eucalypt, #2d6e40)" }} />
            </div>
            <div className={s.savingTitle}>Saving memory</div>
            <div className={s.savingQuip} key={savingQuip}>{savingQuip}</div>
          </div>
        ) : (
          <>
            <div className={s.body}>
              {/* Photos section */}
              <div className={s.sectionLabel}>
                <Camera size={11} strokeWidth={2.5} style={{ verticalAlign: "-1px", marginRight: 5 }} />
                Photos {photoCount > 0 ? `(${photoCount}/5)` : ""}
              </div>
              <div className={s.photoSection}>
                <div className={s.photoGrid}>
                  {photoUrls.map((url, i) => (
                    <div key={i} className={s.photoThumb}>
                      <img
                        src={url}
                        alt={`Photo ${i + 1}`}
                        className={s.photoImg}
                        onClick={() => setLightboxIndex(i)}
                        style={{ cursor: "pointer" }}
                      />
                      <button
                        type="button"
                        className={s.photoRemove}
                        onClick={() => handleRemovePhoto(i)}
                        disabled={busy}
                      >
                        <Trash2 size={12} strokeWidth={2} />
                      </button>
                    </div>
                  ))}

                  {canAddPhoto && (
                    <div className={s.photoActions}>
                      <button
                        type="button"
                        className={s.photoActionBtn}
                        onClick={handleTakePhoto}
                        disabled={busy}
                      >
                        <Camera size={20} strokeWidth={1.8} />
                        <span>Camera</span>
                      </button>
                      <button
                        type="button"
                        className={s.photoActionBtn}
                        onClick={handlePickPhoto}
                        disabled={busy}
                      >
                        <ImagePlus size={20} strokeWidth={1.8} />
                        <span>Gallery</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Note section */}
              <div className={s.sectionLabel}>
                <MapPin size={11} strokeWidth={2.5} style={{ verticalAlign: "-1px", marginRight: 5 }} />
                Journal note
              </div>
              <div className={s.noteSection}>
                <textarea
                  ref={textareaRef}
                  className={s.noteInput}
                  placeholder="What made this stop memorable?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  maxLength={2000}
                />
                {note.length > 0 && (
                  <div className={s.noteCharCount}>
                    {note.length}/2,000
                  </div>
                )}
              </div>
            </div>

            {/* Save button */}
            <div className={s.footer}>
              <button
                type="button"
                className={cx(s.saveBtn, busy && s.saveBtnBusy)}
                onClick={handleSave}
                disabled={busy}
              >
                <div className={s.saveBtnNoise} />
                {busy ? (
                  <Loader2 size={16} strokeWidth={2} className={s.spinner} />
                ) : (
                  <span style={{ position: "relative" }}>Save Memory</span>
                )}
              </button>
            </div>
          </>
        )}

        {/* Hidden file input for web fallback */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className={s.hiddenInput}
          onChange={handleFileInput}
        />
      </div>

      {/* Photo lightbox preview */}
      {lightboxIndex !== null && photoUrls.length > 0 && (
        <PhotoLightbox
          urls={photoUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
