import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SwipeableNotification } from "../SwipeableNotification";

// jsdom doesn't implement pointer capture. Stub it so the component doesn't throw.
beforeEach(() => {
  (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = vi.fn();
  (Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = vi.fn();
  (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = vi.fn(() => false);
});

function getForeground(): HTMLElement {
  // The foreground is the element wrapping children with the onClick handler.
  return screen.getByTestId("row-content").parentElement as HTMLElement;
}

function pointerSequence(el: HTMLElement, path: Array<[number, number]>, opts: { pointerType?: string } = {}) {
  const pointerType = opts.pointerType ?? "touch";
  const [x0, y0] = path[0];
  fireEvent.pointerDown(el, { pointerId: 1, pointerType, clientX: x0, clientY: y0, button: 0 });
  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i];
    fireEvent.pointerMove(el, { pointerId: 1, pointerType, clientX: x, clientY: y });
  }
  const [xl, yl] = path[path.length - 1];
  fireEvent.pointerUp(el, { pointerId: 1, pointerType, clientX: xl, clientY: yl });
}

function renderRow(props: Partial<React.ComponentProps<typeof SwipeableNotification>> = {}) {
  const onDelete = vi.fn();
  const onMarkRead = vi.fn();
  const onClick = vi.fn();
  const utils = render(
    <SwipeableNotification
      isRead={props.isRead ?? false}
      onDelete={onDelete}
      onMarkRead={onMarkRead}
      onClick={onClick}
      {...props}
    >
      <div data-testid="row-content" style={{ padding: 16 }}>
        Notification body
      </div>
    </SwipeableNotification>
  );
  return { onDelete, onMarkRead, onClick, ...utils };
}

describe("SwipeableNotification", () => {
  it("swipe-left reveals Read and Delete action buttons", () => {
    const { onDelete, onMarkRead } = renderRow();
    const fg = getForeground();

    // Drag left ~120px in small steps.
    pointerSequence(fg, [
      [300, 40],
      [290, 41],
      [260, 42],
      [220, 42],
      [180, 43],
    ]);

    // Rail buttons are always in the DOM; after a partial swipe the row should be
    // snapped open (translated). Verify by translateX being negative.
    expect(fg.style.transform).toMatch(/translate3d\(-\d+/);
    // Action buttons visible/clickable.
    const readBtn = screen.getByRole("button", { name: /read/i });
    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    fireEvent.click(readBtn);
    expect(onMarkRead).toHaveBeenCalledTimes(1);
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("full swipe-left past threshold triggers delete", () => {
    vi.useFakeTimers();
    const { onDelete } = renderRow();
    const fg = getForeground();
    pointerSequence(fg, [
      [300, 40],
      [200, 41],
      [100, 42],
      [40, 42],
      [10, 42],
    ]);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("swipe-right past threshold marks unread notification as read", () => {
    vi.useFakeTimers();
    const { onMarkRead } = renderRow({ isRead: false });
    const fg = getForeground();
    pointerSequence(fg, [
      [40, 40],
      [80, 41],
      [130, 42],
      [170, 42],
    ]);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onMarkRead).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("swipe-right does nothing when already read", () => {
    const { onMarkRead } = renderRow({ isRead: true });
    const fg = getForeground();
    pointerSequence(fg, [
      [40, 40],
      [130, 42],
      [200, 42],
    ]);
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("vertical drag does not trigger swipe actions (scroll wins)", () => {
    const { onDelete, onMarkRead, onClick } = renderRow();
    const fg = getForeground();
    pointerSequence(fg, [
      [200, 40],
      [200, 90],
      [200, 160],
      [200, 220],
    ]);
    expect(onDelete).not.toHaveBeenCalled();
    expect(onMarkRead).not.toHaveBeenCalled();
    // A pure vertical drag isn't a tap either.
    expect(onClick).not.toHaveBeenCalled();
    // Row stayed put.
    expect(fg.style.transform).toMatch(/translate3d\(0px/);
  });

  it("tap without drag invokes onClick", () => {
    const { onClick } = renderRow();
    const fg = getForeground();
    fireEvent.pointerDown(fg, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 40, button: 0 });
    fireEvent.pointerUp(fg, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 40 });
    fireEvent.click(fg);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("completed swipe suppresses the row's onClick", () => {
    const { onClick } = renderRow();
    const fg = getForeground();
    pointerSequence(fg, [
      [300, 40],
      [260, 42],
      [200, 42],
      [170, 42],
    ]);
    fireEvent.click(fg);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("small horizontal flick still locks to horizontal axis (Android reliability)", () => {
    const { onDelete } = renderRow();
    const fg = getForeground();
    // Only ~6px of motion before axis lock — should still be treated as horizontal.
    pointerSequence(fg, [
      [300, 40],
      [294, 41],
      [270, 42],
      [230, 43],
      [180, 43],
    ]);
    // Row moved left => axis locked to X on a short initial displacement.
    expect(fg.style.transform).toMatch(/translate3d\(-\d+/);
    // Buttons available.
    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});