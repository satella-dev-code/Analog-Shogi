// Only retain the current immutable position and board orientation.
export function createRenderCache() {
  let position, orientation;
  const values = new Map();
  return (nextPosition, nextOrientation, key, compute) => {
    if (position !== nextPosition || orientation !== nextOrientation) {
      position = nextPosition; orientation = nextOrientation; values.clear();
    }
    if (!values.has(key)) values.set(key, compute());
    return values.get(key);
  };
}

// Coalesce pointer updates; read the latest coordinates when the frame runs.
export function createFrameScheduler(draw, request, cancel) {
  let frame = null;
  const stop = () => { if (frame !== null) cancel(frame); frame = null; };
  return {
    schedule() {
      if (frame !== null) return;
      frame = request(() => { frame = null; draw(); });
    },
    cancel: stop,
  };
}
