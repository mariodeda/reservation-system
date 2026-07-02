"use client";

import { cloneElement, isValidElement, useId, type ReactNode } from "react";

type TooltipSide = "top" | "bottom" | "left" | "right";

const sideClass: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "left-1/2 top-full mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

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
  if (!content) return <>{children}</>;
  const describedChildren = isValidElement<{ "aria-describedby"?: string }>(children)
    ? cloneElement(children, {
        "aria-describedby": [children.props["aria-describedby"], id].filter(Boolean).join(" "),
      })
    : children;

  return (
    <span className={`relative inline-flex group/tooltip ${className}`}>
      {describedChildren}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute z-[80] max-w-[18rem] whitespace-pre-line rounded-md border border-outline-variant/50 bg-surface-container-high px-2.5 py-1.5 text-xs font-medium leading-snug text-on-surface shadow-xl opacity-0 transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${sideClass[side]}`}
      >
        {content}
      </span>
    </span>
  );
}
