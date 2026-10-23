"use client";

import { useEffect, useRef } from "react";
import ui from "./ui.module.css";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={ui.backdrop} onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`${ui.card} ${ui.modal}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={ui.modalHeader}>
          <h2 className={ui.modalTitle}>{title}</h2>
          {onClose && (
            <button type="button" className={ui.btn} onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
