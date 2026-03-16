// src/components/ui/PhotoLightbox.tsx
//
// Full-screen image preview overlay.
// Supports multi-image navigation with prev/next and keyboard controls.

"use client";

import { useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

import s from "./PhotoLightbox.module.css";

export type PhotoLightboxProps = {
  /** Array of image URLs to display */
  urls: string[];
  /** Initial index to show */
  initialIndex?: number;
  /** Called when the lightbox should close */
  onClose: () => void;
};

export function PhotoLightbox({
  urls,
  initialIndex = 0,
  onClose,
}: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  const hasPrev = index > 0;
  const hasNext = index < urls.length - 1;

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(urls.length - 1, i + 1)),
    [urls.length],
  );

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!urls.length) return null;

  const url = urls[index];

  return (
    <div className={s.backdrop} onClick={onClose}>
      {/* Top bar */}
      <div className={s.topBar} onClick={(e) => e.stopPropagation()}>
        <span className={s.counter}>
          {urls.length > 1 ? `${index + 1} / ${urls.length}` : ""}
        </span>
        <button type="button" className={s.closeBtn} onClick={onClose}>
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Image */}
      <div
        className={s.imageArea}
        onClick={(e) => e.stopPropagation()}
      >
        {hasPrev && (
          <button
            type="button"
            className={`${s.navBtn} ${s.navPrev}`}
            onClick={goPrev}
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
        )}

        <img
          key={url}
          src={url}
          alt={`Photo ${index + 1}`}
          className={s.image}
          draggable={false}
        />

        {hasNext && (
          <button
            type="button"
            className={`${s.navBtn} ${s.navNext}`}
            onClick={goNext}
          >
            <ChevronRight size={20} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Bottom safe area spacer */}
      <div className={s.bottomSpacer} />
    </div>
  );
}
