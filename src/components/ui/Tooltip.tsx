"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type TooltipSide = "top" | "bottom" | "left" | "right";

const VIEWPORT_PADDING = 8;
const TOOLTIP_GAP = 8;
const OFFSCREEN_COORDS = { left: -9999, top: -9999 };

function canShowPointerTooltip() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return !window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

function candidateRect(trigger: DOMRect, width: number, height: number, side: TooltipSide) {
  switch (side) {
    case "bottom": {
      const left = trigger.left + trigger.width / 2 - width / 2;
      const top = trigger.bottom + TOOLTIP_GAP;
      return { left, right: left + width, top, bottom: top + height };
    }
    case "left": {
      const left = trigger.left - width - TOOLTIP_GAP;
      const top = trigger.top + trigger.height / 2 - height / 2;
      return { left, right: left + width, top, bottom: top + height };
    }
    case "right": {
      const left = trigger.right + TOOLTIP_GAP;
      const top = trigger.top + trigger.height / 2 - height / 2;
      return { left, right: left + width, top, bottom: top + height };
    }
    case "top":
    default: {
      const left = trigger.left + trigger.width / 2 - width / 2;
      const top = trigger.top - height - TOOLTIP_GAP;
      return { left, right: left + width, top, bottom: top + height };
    }
  }
}

function overflowsViewport(rect: ReturnType<typeof candidateRect>) {
  return (
    rect.left < VIEWPORT_PADDING ||
    rect.top < VIEWPORT_PADDING ||
    rect.right > window.innerWidth - VIEWPORT_PADDING ||
    rect.bottom > window.innerHeight - VIEWPORT_PADDING
  );
}

function positionFor(trigger: DOMRect, width: number, height: number, side: TooltipSide) {
  const rect = candidateRect(trigger, width, height, side);
  let left = rect.left;
  let top = rect.top;

  if (side === "top" || side === "bottom") {
    left = Math.min(
      Math.max(left, VIEWPORT_PADDING),
      Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING),
    );
  } else {
    top = Math.min(
      Math.max(top, VIEWPORT_PADDING),
      Math.max(VIEWPORT_PADDING, window.innerHeight - height - VIEWPORT_PADDING),
    );
  }

  return { left, top };
}

export default function Tooltip({
  content,
  children,
  side = "top",
  className = "",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<{ side: TooltipSide; left: number; top: number }>({
    side,
    ...OFFSCREEN_COORDS,
  });
  const [active, setActive] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const choices = ([side, "bottom", "top", "right", "left"] satisfies TooltipSide[]).filter(
      (value, index, all) => all.indexOf(value) === index,
    );
    let nextSide = choices[0];
    for (const choice of choices) {
      const rect = candidateRect(triggerRect, tooltipRect.width, tooltipRect.height, choice);
      if (!overflowsViewport(rect)) {
        nextSide = choice;
        break;
      }
    }

    setPlacement({ side: nextSide, ...positionFor(triggerRect, tooltipRect.width, tooltipRect.height, nextSide) });
  }, [side]);

  useLayoutEffect(() => {
    if (!active || dismissed) return;
    updatePlacement();
    window.addEventListener("scroll", updatePlacement, true);
    window.addEventListener("resize", updatePlacement);
    return () => {
      window.removeEventListener("scroll", updatePlacement, true);
      window.removeEventListener("resize", updatePlacement);
    };
  }, [active, dismissed, updatePlacement]);

  if (!content) return <>{children}</>;
  const describedChildren = isValidElement<{ "aria-describedby"?: string }>(children)
    ? cloneElement(children, {
        "aria-describedby": [children.props["aria-describedby"], id].filter(Boolean).join(" "),
      })
    : children;

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex group/tooltip ${className}`}
      onBlurCapture={() => {
        setActive(false);
        setDismissed(false);
      }}
      onClickCapture={() => {
        setActive(false);
        setDismissed(true);
      }}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          setActive(false);
          setDismissed(true);
        }
      }}
      onFocusCapture={() => {
        if (!canShowPointerTooltip()) return;
        setDismissed(false);
        setActive(true);
        updatePlacement();
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || !canShowPointerTooltip()) return;
        setDismissed(false);
        setActive(true);
        updatePlacement();
      }}
      onPointerLeave={() => {
        setActive(false);
        setDismissed(false);
      }}
    >
      {describedChildren}
      {mounted && typeof document !== "undefined" &&
        createPortal(
          <span
            ref={tooltipRef}
            id={id}
            role="tooltip"
            data-side={placement.side}
            style={{ left: placement.left, top: placement.top } as CSSProperties}
            className={`pointer-events-none fixed z-[300] min-w-0 max-w-[calc(100vw-1rem)] whitespace-pre-line rounded-md border border-outline-variant/50 bg-surface-container-high px-2.5 py-1.5 text-xs font-medium leading-snug text-on-surface shadow-xl transition-opacity duration-150 sm:min-w-[200px] sm:max-w-[18rem] ${active && !dismissed ? "opacity-100" : "opacity-0"}`}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
