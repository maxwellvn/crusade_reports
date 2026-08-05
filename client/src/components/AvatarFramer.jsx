import * as React from "react";
import { Download, Hand, ImagePlus, Minus, Plus, RotateCcw, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";

const FRAME_SRC = "/notc-avatar-frame.jpg";
const DOWNLOAD_NAME = "notc-avatar.png";

/* The frame is an opaque JPEG whose photo slot is a solid black circle, so the
   photo is drawn after the frame and clipped to that circle. Measured on the
   1280px artwork: centre (656, 831), radius 177px; the radius carries a small
   bleed so the anti-aliased rim of the slot stays covered. */
const HOLE = { cx: 0.5125, cy: 0.6492, r: 0.1409 };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

export function AvatarFramer() {
  const canvasRef = React.useRef(null);
  const frameRef = React.useRef(null);
  const photoRef = React.useRef(null);
  const positionRef = React.useRef({ x: 0, y: 0 });
  const dragRef = React.useRef(null);

  const [frameReady, setFrameReady] = React.useState(false);
  const [fileName, setFileName] = React.useState("");
  const [hasPhoto, setHasPhoto] = React.useState(false);
  const [scale, setScale] = React.useState(100);
  const [scaleRange, setScaleRange] = React.useState({ min: 10, max: 200, fit: 100 });
  const [showHint, setShowHint] = React.useState(false);
  const [error, setError] = React.useState("");

  const hole = React.useCallback(() => {
    const canvas = canvasRef.current;
    return {
      cx: canvas.width * HOLE.cx,
      cy: canvas.height * HOLE.cy,
      r: Math.min(canvas.width, canvas.height) * HOLE.r,
    };
  }, []);

  const draw = React.useCallback(
    (scalePercent) => {
      const canvas = canvasRef.current;
      const frame = frameRef.current;
      if (!canvas || !frame) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);

      const photo = photoRef.current;
      if (!photo) return;
      const { cx, cy, r } = hole();
      const { x, y } = positionRef.current;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(cx + x, cy + y);
      ctx.scale(scalePercent / 100, scalePercent / 100);
      ctx.drawImage(photo, -photo.width / 2, -photo.height / 2, photo.width, photo.height);
      ctx.restore();
    },
    [hole],
  );

  React.useEffect(() => {
    let cancelled = false;
    loadImage(FRAME_SRC)
      .then((frame) => {
        if (cancelled) return;
        frameRef.current = frame;
        const canvas = canvasRef.current;
        canvas.width = frame.naturalWidth;
        canvas.height = frame.naturalHeight;
        setFrameReady(true);
        draw(100);
      })
      .catch(() => !cancelled && setError("The campaign frame could not be loaded. Refresh the page to try again."));
    return () => {
      cancelled = true;
    };
  }, [draw]);

  /* The photo starts at the smallest size that still fills the circular slot,
     so no part of the frame's black slot shows through. */
  function fitPhoto(photo) {
    const { r } = hole();
    const diameter = r * 2;
    const fit = Math.ceil(Math.max(diameter / photo.width, diameter / photo.height) * 100);
    positionRef.current = { x: 0, y: 0 };
    setScaleRange({ min: Math.max(5, Math.floor(fit * 0.5)), max: Math.ceil(fit * 4), fit });
    setScale(fit);
    return fit;
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    try {
      const photo = await loadImage(url);
      photoRef.current = photo;
      setHasPhoto(true);
      draw(fitPhoto(photo));
      setShowHint(true);
      window.setTimeout(() => setShowHint(false), 3000);
    } catch {
      setError("That file could not be read as an image. Choose a JPG or PNG.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function canvasPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDrag(event) {
    if (!photoRef.current) return;
    setShowHint(false);
    const point = canvasPoint(event);
    dragRef.current = { start: point, origin: { ...positionRef.current } };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const point = canvasPoint(event);
    positionRef.current = {
      x: drag.origin.x + (point.x - drag.start.x),
      y: drag.origin.y + (point.y - drag.start.y),
    };
    draw(scale);
  }

  function endDrag(event) {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function nudge(step) {
    const next = Math.min(scaleRange.max, Math.max(scaleRange.min, scale + step));
    setScale(next);
    draw(next);
  }

  function reset() {
    positionRef.current = { x: 0, y: 0 };
    setScale(scaleRange.fit);
    draw(scaleRange.fit);
  }

  function download() {
    const link = document.createElement("a");
    link.download = DOWNLOAD_NAME;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  const zoomPercent = scaleRange.fit ? Math.round((scale / scaleRange.fit) * 100) : 100;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div>
        <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
          <canvas
            ref={canvasRef}
            width={1280}
            height={1280}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-label="Avatar preview"
            className={`block h-auto w-full touch-none select-none ${hasPhoto ? "cursor-grab active:cursor-grabbing" : ""}`}
          />
          {!frameReady && !error && (
            <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">Loading the frame…</div>
          )}
          {showHint && (
            <div className="pointer-events-none absolute inset-0 grid animate-step-in place-items-center bg-slate-950/25 motion-reduce:animate-none">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg">
                <Hand className="size-4 text-blue-700" /> Drag to reposition
              </span>
            </div>
          )}
        </div>
        {error && <p className="mx-auto mt-4 max-w-xl text-sm font-medium text-red-700">{error}</p>}
      </div>

      <div className="lg:sticky lg:top-8">
        <p className="text-sm font-semibold text-blue-700">Step 1</p>
        <h3 className="mt-2 text-2xl tracking-[-0.025em] text-slate-950">Add your photo.</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Nothing is uploaded. Your photo is composited in your browser and never leaves your device.
        </p>

        <label className="mt-5 flex cursor-pointer flex-col items-center gap-3 border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/60">
          <input type="file" accept="image/*" onChange={handleFile} className="sr-only" />
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">
            <ImagePlus className="size-4" /> {hasPhoto ? "Change photo" : "Choose photo"}
          </span>
          <span className="max-w-full truncate text-xs text-slate-500">{fileName || "JPG or PNG, no file chosen"}</span>
        </label>

        {hasPhoto && (
          <div className="mt-8 animate-step-in border-y border-slate-200 py-7 motion-reduce:animate-none">
            <p className="text-sm font-semibold text-blue-700">Step 2</p>
            <h3 className="mt-2 text-2xl tracking-[-0.025em] text-slate-950">Frame your face.</h3>
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <ZoomIn className="size-4 text-blue-700" /> Zoom
                </span>
                <span className="text-sm tabular-nums text-slate-500">{zoomPercent}%</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => nudge(-5)}
                  aria-label="Zoom out"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  <Minus className="size-4" />
                </button>
                <input
                  type="range"
                  min={scaleRange.min}
                  max={scaleRange.max}
                  value={scale}
                  aria-label="Zoom"
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setScale(next);
                    draw(next);
                  }}
                  className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-700"
                />
                <button
                  type="button"
                  onClick={() => nudge(5)}
                  aria-label="Zoom in"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            <p className="mt-5 border-l-2 border-blue-600 pl-4 text-sm leading-6 text-slate-700">
              Drag the preview to move your photo inside the ring.
            </p>
            <Button type="button" variant="outline" onClick={reset} className="mt-6 rounded-full">
              <RotateCcw /> Reset position
            </Button>
          </div>
        )}

        {hasPhoto && (
          <div className="mt-8 animate-step-in motion-reduce:animate-none">
            <p className="text-sm font-semibold text-blue-700">Step 3</p>
            <h3 className="mt-2 text-2xl tracking-[-0.025em] text-slate-950">Share it.</h3>
            <Button type="button" onClick={download} className="mt-5 w-full rounded-full">
              <Download /> Download your avatar
            </Button>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Set it as your display picture on KingsChat and every social platform you use.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
