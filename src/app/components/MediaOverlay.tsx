import { useState, useRef, useEffect, useCallback } from "react";
import { Play, X, Pause, Maximize2 } from "lucide-react";

interface MediaOverlayProps {
  /** The image URL (used as poster / background) */
  image: string;
  /** The video URL — if empty, no play button is shown */
  video?: string;
  /** Alt text for the image */
  alt?: string;
  /** Additional className for the container */
  className?: string;
  /** Height class (default: h-72) */
  heightClass?: string;
  /** Children rendered on top of the image (badges, arrows, etc.) */
  children?: React.ReactNode;
}

/**
 * MediaOverlay renders an image with a transparent play button overlay if a video exists.
 * Tapping the play button opens a fullscreen video modal that auto-plays.
 * The overlay elements sit directly on the image — no external controls.
 */
export function MediaOverlay({
  image,
  video,
  alt = "",
  className = "",
  heightClass = "h-72",
  children,
}: MediaOverlayProps) {
  const [showVideo, setShowVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const hasVideo = !!video?.trim();

  // Auto-play when modal opens
  useEffect(() => {
    if (showVideo && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay blocked — user will manually tap play
      });
    }
  }, [showVideo]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showVideo) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [showVideo]);

  // Close on Escape key
  useEffect(() => {
    if (!showVideo) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowVideo(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showVideo]);

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowVideo(true);
  }, []);

  const handleClose = useCallback(() => {
    setShowVideo(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, []);

  return (
    <>
      {/* Image with overlay */}
      <div className={`relative ${heightClass} overflow-hidden ${className}`}>
        <img
          src={image}
          alt={alt}
          className="w-full h-full object-cover"
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Transparent Play Button — only if video exists */}
        {hasVideo && (
          <button
            onClick={handlePlayClick}
            className="absolute inset-0 flex items-center justify-center z-[5] group/play"
            aria-label="Play video"
          >
            <div className="w-16 h-16 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center transition-all duration-200 group-hover/play:bg-white/40 group-hover/play:scale-110 group-active/play:scale-95 shadow-lg">
              <Play className="w-7 h-7 text-white fill-white ml-1 drop-shadow-md" />
            </div>
          </button>
        )}

        {/* Children (badges, arrows, share buttons) render on top */}
        {children}
      </div>

      {/* Fullscreen Video Modal */}
      {showVideo && hasVideo && (
        <div
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          onClick={handleClose}
        >
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
            aria-label="Close video"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {/* Video Player */}
          <video
            ref={videoRef}
            src={video}
            className="max-w-full max-h-full w-full"
            controls
            autoPlay
            playsInline
            poster={image}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
