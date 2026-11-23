import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

type SidebarResizeOptions = {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  contentWidth: number | ((available: number) => number);
  side?: "left" | "right";
  enabled?: boolean;
  storageKey?: string;
};

export function useSidebarResize({
  defaultWidth,
  minWidth,
  maxWidth,
  contentWidth,
  side = "left",
  enabled = true,
  storageKey,
}: SidebarResizeOptions) {
  const panelRef = useRef<HTMLElement>(null);
  const [preferred, setPreferred] = useState(defaultWidth);
  const [available, setAvailable] = useState<number>();
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    pointerId: number;
    start: number;
    x: number;
    preferred: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved === null ? defaultWidth : Number(saved);
      setPreferred(Number.isFinite(parsed) ? Math.max(minWidth, Math.min(maxWidth, parsed)) : defaultWidth);
    } catch {
      setPreferred(defaultWidth);
    }
  }, [storageKey, defaultWidth, minWidth, maxWidth]);

  useEffect(() => {
    if (!enabled) return;
    const parent = panelRef.current?.parentElement;
    if (!parent) return;
    const measure = () => setAvailable(parent.clientWidth);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [enabled]);

  const maximum = available === undefined || available === 0 ? maxWidth : Math.max(
    minWidth,
    Math.min(maxWidth, available - (typeof contentWidth === "function" ? contentWidth(available) : contentWidth)),
  );
  const clamp = (width: number) => Math.round(Math.max(minWidth, Math.min(maximum, width)));
  const width = clamp(preferred);
  const direction = side === "left" ? 1 : -1;

  function save(value: number) {
    setPreferred(value);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, String(value));
    } catch {
      // Resizing is available when browser storage is disabled.
    }
  }

  function finish(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (commit && current.width !== current.start) save(clamp(current.width));
    else setPreferred(current.preferred);
  }

  return {
    panelRef,
    style: { "--sidebar-width": `${width}px` } as CSSProperties,
    handle: {
      side,
      width,
      minimum: minWidth,
      maximum,
      dragging,
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (!enabled || event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, start: width, width, preferred };
        setDragging(true);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const current = drag.current;
        if (current?.pointerId !== event.pointerId) return;
        current.width = clamp(current.start + (event.clientX - current.x) * direction);
        setPreferred(current.width);
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => finish(event, false),
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => finish(event, false),
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const step = event.shiftKey ? 32 : 16;
        const keys = { ArrowLeft: width - step * direction, ArrowRight: width + step * direction, Home: minWidth, End: maximum };
        if (!Object.hasOwn(keys, event.key)) return;
        event.preventDefault();
        if (enabled) save(clamp(keys[event.key as keyof typeof keys]));
      },
    },
  };
}

type SidebarResizeHandleProps = ReturnType<typeof useSidebarResize>["handle"] & {
  label: string;
  controls: string;
  className?: string;
};

export function SidebarResizeHandle({
  side, label, controls, width, minimum, maximum, dragging, className, ...events
}: SidebarResizeHandleProps) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={width}
      aria-valuetext={`${width}px`}
      data-slot="sidebar-resize-handle"
      data-dragging={dragging || undefined}
      className={[
        "absolute inset-y-0 z-10 w-3 touch-none cursor-col-resize select-none",
        "before:absolute before:inset-y-0 before:w-px before:bg-border before:content-['']",
        "hover:before:w-0.5 hover:before:bg-accent data-[dragging=true]:before:w-0.5 data-[dragging=true]:before:bg-accent",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        side === "left" ? "right-0 before:right-0" : "left-0 before:left-0",
        className,
      ].filter(Boolean).join(" ")}
      {...events}
    />
  );
}
