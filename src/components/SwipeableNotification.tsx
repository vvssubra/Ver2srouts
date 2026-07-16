import { ReactNode, useRef, useState, useEffect } from "react";
import { Check, Trash2 } from "lucide-react";

/**
 * iOS-style swipeable row.
 *  - Swipe LEFT to reveal action buttons (Read + Delete). Full swipe = Delete.
 *  - Swipe RIGHT (when unread) to mark as read.
 *  - Tap invokes `onClick` (unless a swipe rail is open — first tap closes it).
 *
 * Uses Pointer Events with pointer capture so the gesture works reliably on
 * Android Chrome even when the row lives inside a scrollable container.
 */
export function SwipeableNotification({
  isRead,
  onMarkRead,
  onDelete,
  onClick,
  children,
  className = "",
}: {
  isRead: boolean;
  onMarkRead?: () => void;
  onDelete: () => void;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startOffset = useRef(0);
  const axisLocked = useRef<"x" | "y" | null>(null);
  const activePointerId = useRef<number | null>(null);
  const swiped = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);

  // Widths: Read (72) + Delete (72). If already read, only Delete is exposed.
  const actionsWidth = isRead || !onMarkRead ? 84 : 168;
  const OPEN_SNAP = -actionsWidth;
  const FULL_SWIPE = -220; // past this = auto-delete
  const READ_SWIPE = 90; // right swipe past this = mark read

  // Close on outside tap
  useEffect(() => {
    if (offset === 0) return;
    const onDown = (e: PointerEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) setOffset(0);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [offset]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Ignore secondary buttons on mouse
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startOffset.current = offset;
    axisLocked.current = null;
    activePointerId.current = e.pointerId;
    swiped.current = false;
    // Capture the pointer eagerly on touch so Android Chrome can't reclaim
    // this gesture as a page scroll before we detect the horizontal intent.
    // If the user actually wanted to scroll vertically, we release capture
    // in onPointerMove once the axis locks to "y".
    if (e.pointerType !== "mouse") {
      try {
        fgRef.current?.setPointerCapture(e.pointerId);
      } catch {}
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null || startY.current == null) return;
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!axisLocked.current) {
      // Lower the movement threshold so short flicks are detected quickly.
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      // Strong horizontal bias — any drag that's mostly sideways locks to X.
      axisLocked.current = Math.abs(dx) > Math.abs(dy) * 0.7 ? "x" : "y";
      if (axisLocked.current === "y") {
        // Release the eager pointer capture so the page can scroll normally.
        try {
          if (fgRef.current?.hasPointerCapture(e.pointerId)) {
            fgRef.current.releasePointerCapture(e.pointerId);
          }
        } catch {}
      }
    }
    if (axisLocked.current !== "x") return;
    setDragging(true);
    // Prevent the browser from also treating this as a page/vertical scroll.
    if (e.cancelable) e.preventDefault();
    let next = startOffset.current + dx;
    // Right-swipe: allow up to ~120px when unread (to trigger Read), otherwise rubber-band.
    const canReadSwipe = !isRead && !!onMarkRead;
    if (next > 0) {
      const cap = canReadSwipe ? 140 : 24;
      if (next > cap) next = cap + (next - cap) / 4;
    }
    if (next < FULL_SWIPE - 40) next = FULL_SWIPE - 40;
    setOffset(next);
  };
  const onPointerUp = (e?: React.PointerEvent) => {
    if (e && activePointerId.current !== null && e.pointerId !== activePointerId.current) return;
    try {
      if (e && fgRef.current?.hasPointerCapture(e.pointerId)) {
        fgRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {}
    activePointerId.current = null;
    if (!dragging) {
      startX.current = null;
      startY.current = null;
      axisLocked.current = null;
      return;
    }
    setDragging(false);
    startX.current = null;
    startY.current = null;
    axisLocked.current = null;
    swiped.current = true;
    if (offset <= FULL_SWIPE) {
      // Animate off-screen, then delete
      setOffset(-window.innerWidth);
      setTimeout(onDelete, 180);
      return;
    }
    if (offset >= READ_SWIPE && !isRead && onMarkRead) {
      // Animate off to the right, then mark read
      setOffset(window.innerWidth);
      setTimeout(() => {
        onMarkRead();
        setOffset(0);
      }, 180);
      return;
    }
    if (offset <= OPEN_SNAP / 2) setOffset(OPEN_SNAP);
    else setOffset(0);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (swiped.current) {
      swiped.current = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (offset !== 0) {
      e.stopPropagation();
      setOffset(0);
      return;
    }
    onClick?.();
  };

  return (
    <div ref={rowRef} className={`relative overflow-hidden select-none ${className}`}>
      {/* Read hint rail (revealed on swipe right) */}
      {!isRead && onMarkRead && (
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-start pl-4 bg-primary text-primary-foreground text-[11px] font-semibold"
          style={{ width: Math.max(0, offset) }}
          aria-hidden
        >
          <div className="flex items-center gap-1">
            <Check className="h-4 w-4" /> Read
          </div>
        </div>
      )}
      {/* Action rail (revealed on swipe left) */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        {!isRead && onMarkRead && (
          <button
            type="button"
            className="w-[84px] bg-primary text-primary-foreground flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold active:opacity-80"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead();
              setOffset(0);
            }}
          >
            <Check className="h-4 w-4" />
            Read
          </button>
        )}
        <button
          type="button"
          className="w-[84px] bg-destructive text-destructive-foreground flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold active:opacity-80"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
      {/* Foreground content */}
      <div
        ref={fgRef}
        style={{
          transform: `translate3d(${offset}px,0,0)`,
          transition: dragging ? "none" : "transform 180ms cubic-bezier(0.2,0.8,0.2,1)",
          touchAction: "pan-y",
        }}
        className="relative bg-background"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={handleClick}
      >
        {children}
      </div>
    </div>
  );
}

export default SwipeableNotification;