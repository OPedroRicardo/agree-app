import { useRef, useState } from 'react';

/**
 * Shows `src` as a frozen first frame by default; the live `<img>` (which
 * plays a GIF non-stop, since browsers give no way to pause one declaratively)
 * only renders while the element is hovered. Used for server logos, which are
 * arbitrary user-supplied URLs — a GIF there would otherwise loop forever in
 * the server rail.
 *
 * The frozen frame is a `<canvas>` painted once on load. `drawImage` never
 * reads pixel data back (unlike `toDataURL`/`getImageData`), so it works even
 * for a cross-origin URL with no CORS headers, which most pasted GIF links are.
 */
export function HoverPlayImage({
  src,
  alt,
  className,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function handleLoad(img: HTMLImageElement) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')?.drawImage(img, 0, 0);
    setFrameReady(true);
  }

  return (
    <div
      className="relative h-full w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* `display: none` (not `visibility: hidden`) so the browser actually
          pauses GIF decoding while not hovered, instead of animating off-screen. */}
      <img
        src={src}
        alt={alt}
        className={className}
        style={{ display: hovered ? undefined : 'none' }}
        onLoad={(e) => handleLoad(e.currentTarget)}
        onError={onError}
      />
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          display: hovered || !frameReady ? 'none' : undefined,
        }}
      />
    </div>
  );
}
