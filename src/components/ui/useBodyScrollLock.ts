"use client";

import { useEffect } from "react";

let lockCount = 0;
let scrollY = 0;
let originalOverflow = "";
let originalPaddingRight = "";
let originalPosition = "";
let originalTop = "";
let originalWidth = "";

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof window === "undefined") return;

    const body = document.body;
    if (lockCount === 0) {
      scrollY = window.scrollY;
      originalOverflow = body.style.overflow;
      originalPaddingRight = body.style.paddingRight;
      originalPosition = body.style.position;
      originalTop = body.style.top;
      originalWidth = body.style.width;

      const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
      if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`;
    }

    lockCount += 1;
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount > 0) return;

      body.style.overflow = originalOverflow;
      body.style.paddingRight = originalPaddingRight;
      body.style.position = originalPosition;
      body.style.top = originalTop;
      body.style.width = originalWidth;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
