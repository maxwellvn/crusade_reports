import * as React from "react";
import { Download, Hand, ImagePlus, Minus, Plus, RotateCcw, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";

/* The NOTC frame is an opaque JPEG whose photo slot is a solid black circle, so
   the photo is drawn after the frame and clipped to that circle. Measured on the
   1280px artwork: centre (656, 831), radius 177px; the radius carries a small
   bleed so the anti-aliased rim of the slot stays covered. */
const NOTC_FRAME = "/notc-avatar-frame.jpg";
const NOTC_HOLE = { cx: 0.5125, cy: 0.6492, r: 0.1409 };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

function balancedLines(value) {
  const words = value.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words;
  let best = [words.join(" ")];
  let smallestDifference = Infinity;
  for (let index = 1; index < words.length; index += 1) {
    const lines = [words.slice(0, index).join(" "), words.slice(index).join(" ")];
    const difference = Math.abs(lines[0].length - lines[1].length);
    if (difference < smallestDifference) {
      best = lines;
      smallestDifference = difference;
    }
  }
  return best;
}

function drawOverlayLabel(context, canvas, value, box) {
  if (!value || !box) return;
  const x = canvas.width * box.x;
  const y = canvas.height * box.y;
  const width = canvas.width * box.width;
  const height = canvas.height * box.height;

  context.save();
  context.fillStyle = box.background || "#0117cd";
  context.fillRect(x, y, width, height);

  const label = String(value).trim().toUpperCase();
  let lines = [label];
  let fontSize = height * 0.48;
  const setFont = () => { context.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`; };
  setFont();
  if (context.measureText(label).width > width * 0.92) {
    lines = balancedLines(label);
    fontSize = height * 0.34;
    setFont();
  }
  while (Math.max(...lines.map((line) => context.measureText(line).width)) > width * 0.92 && fontSize > 22) {
    fontSize -= 1;
    setFont();
  }

  context.fillStyle = box.color || "#fff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lineHeight = fontSize * 1.02;
  lines.forEach((line, index) => {
    const lineY = y + height / 2 + (index - (lines.length - 1) / 2) * lineHeight;
    context.fillText(line, x + width / 2, lineY, width * 0.92);
  });
  context.restore();
}

// Campaign avatar framer. `frameSrc` is the primary frame artwork and
// `fallbackSrc` is tried if it cannot load. `hole` and `overlayLabelBox` use
// fractions of the canvas, so frames and dynamic labels work at any size.
export function AvatarFramer({ frameSrc = NOTC_FRAME, fallbackSrc = "", hole = NOTC_HOLE, overlayLabel = "", overlayLabelBox = null, downloadName = "notc-avatar.png" }) {
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

  const activeHole = React.useCallback(() => {
    const canvas = canvasRef.current;
    return {
      cx: canvas.width * hole.cx,
      cy: canvas.height * hole.cy,
      r: Math.min(canvas.width, canvas.height) * hole.r,
    };
  }, [hole]);

  const draw = React.useCallback(
    (scalePercent) => {
      const canvas = canvasRef.current;
      const frame = frameRef.current;
      if (!canvas || !frame) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);

      const photo = photoRef.current;
      if (photo) {
        const { cx, cy, r } = activeHole();
        const ratio = scalePercent / 100;
        const maxX = Math.max(0, (photo.width * ratio) / 2 - r);
        const maxY = Math.max(0, (photo.height * ratio) / 2 - r);
        const requested = positionRef.current;
        const position = {
          x: Math.min(maxX, Math.max(-maxX, requested.x)),
          y: Math.min(maxY, Math.max(-maxY, requested.y)),
        };
        positionRef.current = position;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.translate(cx + position.x, cy + position.y);
        ctx.scale(ratio, ratio);
        ctx.drawImage(photo, -photo.width / 2, -photo.height / 2, photo.width, photo.height);
        ctx.restore();
      }

      drawOverlayLabel(ctx, canvas, overlayLabel, overlayLabelBox);
    },
    [activeHole, overlayLabel, overlayLabelBox],
  );

  // Try the primary frame, then the fallback, then give up.
  React.useEffect(() => {
    let cancelled = false;
    setFrameReady(false);
    setError("");
    frameRef.current = null;
    const sources = fallbackSrc ? [frameSrc, fallbackSrc] : [frameSrc];
    (async () => {
      for (const src of sources) {
        try {
          const frame = await loadImage(src);
          if (cancelled) return;
          frameRef.current = frame;
          const canvas = canvasRef.current;
          canvas.width = frame.naturalWidth;
          canvas.height = frame.naturalHeight;
          setFrameReady(true);
          draw(100);
          return;
        } catch {
          /* try the next source */
        }
      }
      if (!cancelled) setError("The campaign frame could not be loaded. Refresh the page to try again.");
    })();
    return () => {
      cancelled = true;
    };
  }, [frameSrc, fallbackSrc, draw]);

  /* The photo starts at the smallest size that still fills the circular slot,
     so no part of the frame's slot shows through. */
  function fitPhoto(photo) {
    const { r } = activeHole();
    const diameter = r * 2;
    const fit = Math.ceil(Math.max(diameter / photo.width, diameter / photo.height) * 100);
    positionRef.current = { x: 0, y: 0 };
    setScaleRange({ min: fit, max: Math.ceil(fit * 4), fit });
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

  /* On mobile, do not steal the gesture immediately — wait for a clear drag intent
     so a vertical finger swipe over the frame still scrolls the page. */
  function startDrag(event) {
    if (!photoRef.current) return;
    setShowHint(false);
    const point = canvasPoint(event);
    dragRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
      start: point,
      origin: { ...positionRef.current },
      active: event.pointerType !== "touch",
    };
    if (dragRef.current.active) {
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.style.touchAction = "none";
    }
  }

  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (!drag.active) {
      const dx = event.clientX - drag.clientX;
      const dy = event.clientY - drag.clientY;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // Vertical swipe → leave the gesture to the browser for page scroll.
      if (Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      drag.active = true;
      drag.start = canvasPoint(event);
      drag.origin = { ...positionRef.current };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.style.touchAction = "none";
    }

    event.preventDefault();
    const point = canvasPoint(event);
    positionRef.current = {
      x: drag.origin.x + (point.x - drag.start.x),
      y: drag.origin.y + (point.y - drag.start.y),
    };
    draw(scale);
  }

  function endDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.style.touchAction = "";
    if (drag.active) event.currentTarget.releasePointerCapture?.(event.pointerId);
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
    link.download = downloadName;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  const zoomPercent = scaleRange.fit ? Math.round((scale / scaleRange.fit) * 100) : 100;

  return (
    <div className="avatar-framer grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div>
        <div className="avatar-preview relative mx-auto w-full max-w-xl overflow-hidden">
          <canvas
            ref={canvasRef}
            width={1280}
            height={1280}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-label="Avatar preview"
            className={`block h-auto w-full select-none ${hasPhoto ? "cursor-grab touch-pan-y active:cursor-grabbing" : ""}`}
          />
          {!frameReady && !error && (
            <div className="absolute inset-0 grid place-items-center text-sm text-[#6b6f8c]">Loading the frame…</div>
          )}
          {showHint && (
            <div className="pointer-events-none absolute inset-0 grid animate-step-in place-items-center bg-[#16194f]/35 motion-reduce:animate-none">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#14163b] shadow-lg">
                <Hand className="size-4 text-[#3035b0]" /> Drag to reposition
              </span>
            </div>
          )}
        </div>
        {error && <p className="mx-auto mt-4 max-w-xl text-sm font-medium text-red-700">{error}</p>}
      </div>

      <div className="lg:sticky lg:top-24">
        <p className="text-sm font-semibold text-[#3035b0]">Step 1</p>
        <h3 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#14163b]">Add your photo.</h3>
        <p className="mt-2 text-sm leading-6 text-[#65677d]">
          Nothing is uploaded. Your photo is composited in your browser and never leaves your device.
        </p>

        <label className="avatar-upload mt-5 flex cursor-pointer flex-col items-center gap-3 px-5 py-8 text-center">
          <input type="file" accept="image/*" onChange={handleFile} className="sr-only" />
          <span className="inline-flex items-center gap-2 rounded-full bg-[#3035b0] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(48,53,176,0.35)] transition hover:brightness-110">
            <ImagePlus className="size-4" /> {hasPhoto ? "Change photo" : "Choose photo"}
          </span>
          <span className="max-w-full truncate text-xs text-[#6b6f8c]">{fileName || "JPG or PNG, no file chosen"}</span>
        </label>

        {hasPhoto && (
          <div className="mt-8 animate-step-in border-y border-[#e4e5f0] py-7 motion-reduce:animate-none">
            <p className="text-sm font-semibold text-[#3035b0]">Step 2</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#14163b]">Frame your face.</h3>
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#14163b]">
                  <ZoomIn className="size-4 text-[#3035b0]" /> Zoom
                </span>
                <span className="text-sm tabular-nums text-[#6b6f8c]">{zoomPercent}%</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => nudge(-5)}
                  aria-label="Zoom out"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-[#d8dae8] text-[#3035b0] hover:bg-[#f4f5fb]"
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
                  className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[#e4e5f0] accent-[#3035b0]"
                />
                <button
                  type="button"
                  onClick={() => nudge(5)}
                  aria-label="Zoom in"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-[#d8dae8] text-[#3035b0] hover:bg-[#f4f5fb]"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            <p className="mt-5 border-l-2 border-[#efe89a] pl-4 text-sm leading-6 text-[#4a4d6a]">
              Drag the preview to move your photo inside the ring.
            </p>
            <Button type="button" variant="outline" onClick={reset} className="mt-6 rounded-full">
              <RotateCcw /> Reset position
            </Button>
          </div>
        )}

        {hasPhoto && (
          <div className="mt-8 animate-step-in motion-reduce:animate-none">
            <p className="text-sm font-semibold text-[#3035b0]">Step 3</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#14163b]">Share it.</h3>
            <Button type="button" onClick={download} className="mt-5 w-full rounded-full">
              <Download /> Download your avatar
            </Button>
            <p className="mt-3 text-xs leading-5 text-[#6b6f8c]">
              Set it as your display picture on KingsChat and every social platform you use.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
