"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type TooltipSide = "top" | "bottom" | "left" | "right";

const sideClass: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 mb-2 translate-x-[calc(-50%+var(--tooltip-shift-x,0px))]",
  bottom: "left-1/2 top-full mt-2 translate-x-[calc(-50%+var(--tooltip-shift-x,0px))]",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

const VIEWPORT_PADDING = 8;
const TOOLTIP_GAP = 8;

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
  const [placement, setPlacement] = useState({ side, shiftX: 0 });

  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    let nextSide = side;
    let nextRect = candidateRect(triggerRect, tooltipRect.width, tooltipRect.height, nextSide);

    if (overflowsViewport(nextRect)) {
      nextSide = "bottom";
      nextRect = candidateRect(triggerRect, tooltipRect.width, tooltipRect.height, nextSide);
    }

    let shiftX = 0;
    if (nextSide === "top" || nextSide === "bottom") {
      if (nextRect.left < VIEWPORT_PADDING) {
        shiftX = VIEWPORT_PADDING - nextRect.left;
      } else if (nextRect.right > window.innerWidth - VIEWPORT_PADDING) {
        shiftX = window.innerWidth - VIEWPORT_PADDING - nextRect.right;
      }
    }

    setPlacement({ side: nextSide, shiftX });
  }, [side]);

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
      onFocusCapture={updatePlacement}
      onPointerEnter={updatePlacement}
    >
      {describedChildren}
      <span
        ref={tooltipRef}
        id={id}
        role="tooltip"
        style={{ "--tooltip-shift-x": `${placement.shiftX}px` } as CSSProperties}
        className={`pointer-events-none absolute z-[80] max-w-[18rem] whitespace-pre-line rounded-md border border-outline-variant/50 bg-surface-container-high px-2.5 py-1.5 text-xs font-medium leading-snug text-on-surface shadow-xl opacity-0 transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${sideClass[placement.side]}`}
      >
        {content}
      </span>
    </span>
  );
}
