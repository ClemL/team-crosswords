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
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  // Runs once per opening. Parents re-render every poll with a new `onClose`, so this effect must
  // not depend on it: re-running it would pull focus out of the dialog's input on every render.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      const field = dialog.querySelector<HTMLElement>("input, textarea, select");
      (field ?? dialog).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
