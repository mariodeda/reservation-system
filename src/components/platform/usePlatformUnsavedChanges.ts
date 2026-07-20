"use client";

import { useEffect } from "react";

const PLATFORM_UNSAVED_MESSAGE = "You have unsaved platform admin changes. Leave without saving?";

declare global {
  interface Window {
    __platformUnsavedChanges?: boolean;
  }
}

export function hasPlatformUnsavedChanges(): boolean {
  return typeof window !== "undefined" && window.__platformUnsavedChanges === true;
}

export function confirmPlatformNavigation(): boolean {
  return !hasPlatformUnsavedChanges() || window.confirm(PLATFORM_UNSAVED_MESSAGE);
}

export function usePlatformUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    window.__platformUnsavedChanges = dirty;
    return () => {
      if (window.__platformUnsavedChanges === dirty) window.__platformUnsavedChanges = false;
    };
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;

    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = PLATFORM_UNSAVED_MESSAGE;
    }

    function clickCapture(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.origin === current.origin
        && destination.pathname === current.pathname
        && destination.search === current.search
      ) return;

      if (!window.confirm(PLATFORM_UNSAVED_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", clickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", clickCapture, true);
    };
  }, [dirty]);
}
