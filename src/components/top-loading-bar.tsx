"use client";
import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function TopLoadingBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // FIX: Deferred the synchronous state update using setTimeout(..., 0)
    const startTimer = setTimeout(() => {
      setProgress(100);
    }, 0);

    const finishTimer = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(finishTimer);
    };
  }, [pathname, searchParams]);

  useEffect(() => {
    // Intercept clicks on links and cards to start loading animation
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (
        target &&
        target.href &&
        target.href.startsWith(window.location.origin) &&
        !target.getAttribute("download") &&
        target.target !== "_blank"
      ) {
        const url = new URL(target.href);
        // Only trigger if actually navigating to a new path or search param
        if (
          url.pathname !== window.location.pathname ||
          url.search !== window.location.search
        ) {
          setVisible(true);
          setProgress(25);
          setTimeout(() => setProgress((p) => (p === 25 ? 65 : p)), 150);
          setTimeout(() => setProgress((p) => (p === 65 ? 85 : p)), 400);
        }
      }
    };

    window.addEventListener("click", handleClick, { capture: true });
    return () =>
      window.removeEventListener("click", handleClick, { capture: true });
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none transition-opacity duration-300"
      style={{ opacity: visible || progress > 0 ? 1 : 0 }}
      aria-hidden="true"
    >
      <div
        className="h-[2px] bg-primary transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
        }}
      />
    </div>
  );
}
