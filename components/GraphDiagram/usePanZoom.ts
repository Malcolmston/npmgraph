import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

export type PanZoomTransform = { x: number; y: number; k: number };

const IDENTITY: PanZoomTransform = { x: 0, y: 0, k: 1 };
const MIN_K = 0.1;
const MAX_K = 8;
// Pointer travel (px) before a press is treated as a drag rather than a click.
const DRAG_THRESHOLD = 4;

/**
 * Adds drag-to-pan and wheel-to-zoom to an injected SVG diagram.
 *
 * The transform is applied directly to the SVG element (translate + scale,
 * origin 0 0) so it composes with the existing fit-width/fit-height sizing
 * without touching the container's scroll logic. When the transform is the
 * identity (the default), behavior is identical to before.
 */
export default function usePanZoom(
  containerRef: RefObject<HTMLElement | null>,
  svg: SVGSVGElement | undefined,
) {
  const [transform, setTransform] = useState<PanZoomTransform>(IDENTITY);

  // Mirror latest transform into a ref so event handlers (bound once) read
  // fresh values without re-subscribing on every change.
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const reset = useCallback(() => {
    setTransform(IDENTITY);
  }, []);

  // Reset the view whenever a new diagram (new graph) is mounted.
  useEffect(() => {
    setTransform(IDENTITY);
  }, [svg]);

  // Apply the transform to the SVG element.
  //
  // Note: the diagram SVG is parsed as image/svg+xml, so it does NOT expose the
  // `.style` IDL property (it's undefined). We set inline style via the `style`
  // *attribute* instead — the same reason the rest of the app manipulates the
  // svg through attributes rather than `.style`.
  useEffect(() => {
    if (!svg) return;
    svg.setAttribute(
      'style',
      `transform-origin: 0 0; transform: translate(${transform.x}px, ${transform.y}px) scale(${transform.k});`,
    );
  }, [svg, transform]);

  // Wire up pointer + wheel handlers.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !svg) return;

    const localPoint = (event: { clientX: number; clientY: number }) => {
      const rect = container.getBoundingClientRect();
      return { px: event.clientX - rect.left, py: event.clientY - rect.top };
    };

    function onWheel(event: WheelEvent) {
      // Take over the wheel so the page doesn't scroll while zooming the graph.
      event.preventDefault();
      const { x, y, k } = transformRef.current;
      const { px, py } = localPoint(event);
      const factor = Math.exp(-event.deltaY * 0.0015);
      const nk = Math.min(MAX_K, Math.max(MIN_K, k * factor));
      if (nk === k) return;

      // Keep the graph point under the cursor anchored while zooming.
      // screen = pan + content * k  =>  content = (screen - pan) / k
      const cx = (px - x) / k;
      const cy = (py - y) / k;
      setTransform({ x: px - cx * nk, y: py - cy * nk, k: nk });
    }

    // Active pointers (by id) so we can distinguish 1-finger pan from 2-finger
    // pinch. A finger tap jitters more than a mouse, so touch/pen get a larger
    // drag threshold — otherwise every tap is mistaken for a drag and the
    // trailing click (node selection) gets swallowed.
    const pointers = new Map<number, { x: number; y: number }>();
    const dragThresholdFor = (type: string) =>
      type === 'touch' || type === 'pen' ? 12 : DRAG_THRESHOLD;

    let moved = false;
    let panId: number | null = null;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    // Pinch state (2 pointers), anchored on the midpoint at gesture start.
    let pinching = false;
    let startDist = 0;
    let startK = 1;
    let startMidX = 0;
    let startMidY = 0;
    let startTx = 0;
    let startTy = 0;

    function beginPinch() {
      const [a, c] = [...pointers.values()];
      startDist = Math.hypot(a.x - c.x, a.y - c.y) || 1;
      const rect = container!.getBoundingClientRect();
      startMidX = (a.x + c.x) / 2 - rect.left;
      startMidY = (a.y + c.y) / 2 - rect.top;
      const t = transformRef.current;
      startK = t.k;
      startTx = t.x;
      startTy = t.y;
      pinching = true;
      moved = true; // a pinch is never a click
    }

    function beginPan(id: number, x: number, y: number) {
      panId = id;
      moved = false;
      startX = x;
      startY = y;
      originX = transformRef.current.x;
      originY = transformRef.current.y;
    }

    function onPointerDown(event: PointerEvent) {
      // Mouse: left button only. Ignore modifier-clicks (open-in-new-tab).
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.metaKey || event.ctrlKey) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        beginPan(event.pointerId, event.clientX, event.clientY);
      } else if (pointers.size === 2) {
        beginPinch();
      }
    }

    function onPointerMove(event: PointerEvent) {
      const pt = pointers.get(event.pointerId);
      if (!pt) return;
      pt.x = event.clientX;
      pt.y = event.clientY;

      // Two fingers → pinch-zoom, anchored on the initial midpoint.
      if (pinching && pointers.size >= 2) {
        const [a, c] = [...pointers.values()];
        const dist = Math.hypot(a.x - c.x, a.y - c.y) || 1;
        const nk = Math.min(
          MAX_K,
          Math.max(MIN_K, startK * (dist / startDist)),
        );
        const cx = (startMidX - startTx) / startK;
        const cy = (startMidY - startTy) / startK;
        setTransform({ x: startMidX - cx * nk, y: startMidY - cy * nk, k: nk });
        return;
      }

      // One finger → pan.
      if (event.pointerId !== panId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > dragThresholdFor(event.pointerType)) {
        moved = true;
        try {
          container?.setPointerCapture(event.pointerId);
        } catch {
          // Ignore — capture is a nicety, panning still works without it.
        }
        if (container) container.style.cursor = 'grabbing';
      }
      if (moved) {
        setTransform({
          ...transformRef.current,
          x: originX + dx,
          y: originY + dy,
        });
      }
    }

    function onPointerUp(event: PointerEvent) {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);

      // Dropping from 2→1 finger: keep panning with the remaining one.
      if (pinching && pointers.size < 2) {
        pinching = false;
        const remaining = [...pointers.entries()][0];
        if (remaining) {
          beginPan(remaining[0], remaining[1].x, remaining[1].y);
          moved = true; // lifting one finger of a pinch isn't a click
        }
      }

      if (pointers.size > 0) return;

      // Last pointer up.
      panId = null;
      if (container) container.style.cursor = '';
      if (moved) {
        try {
          container?.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore.
        }
        // Swallow the click that fires after a drag/pinch so it doesn't select.
        const swallow = (clickEvent: MouseEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
        };
        container?.addEventListener('click', swallow, {
          capture: true,
          once: true,
        });
      }
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    // Prevent the browser's native pinch/pan so ours is the only handler.
    container.style.touchAction = 'none';

    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
    };
  }, [containerRef, svg]);

  return { transform, reset };
}
