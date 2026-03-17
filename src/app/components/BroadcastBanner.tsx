/**
 * BroadcastBanner — Displays active broadcast messages on the Home page.
 * Shows as a carousel with auto-scroll when multiple broadcasts exist.
 * Positioned between logo/tagline and greeting section.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { ChevronRight } from "lucide-react";
import { APP_CONFIG } from "../lib/config";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface Broadcast {
  id: string;
  message: string;
  icon: string;
  bgColor: string;
  textColor: string;
  url?: string;
  startAt: string;
  endAt: string;
  priority: number;
}

export function BroadcastBanner() {
  const navigate = useNavigate();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [scrollInterval, setScrollInterval] = useState(7);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const autoScrollRef = useRef<ReturnType<typeof setInterval>>();

  // Fetch active broadcasts
  useEffect(() => {
    const fetchBroadcasts = async () => {
      try {
        const res = await fetch(`${API_BASE}/broadcasts/active`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          setBroadcasts(data.broadcasts || []);
          setScrollInterval(data.scrollInterval || 7);
        }
      } catch {
        // Silently fail
      }
    };
    fetchBroadcasts();
    // Refresh every 60 seconds to pick up new broadcasts
    const interval = setInterval(fetchBroadcasts, 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll carousel
  useEffect(() => {
    if (broadcasts.length <= 1) return;
    autoScrollRef.current = setInterval(() => {
      setIsTransitioning(true);
      setCurrentIndex((prev) => (prev + 1) % broadcasts.length);
    }, scrollInterval * 1000);
    return () => {
      if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    };
  }, [broadcasts.length, scrollInterval]);

  // Reset transition flag
  useEffect(() => {
    if (isTransitioning) {
      const t = setTimeout(() => setIsTransitioning(false), 500);
      return () => clearTimeout(t);
    }
  }, [isTransitioning, currentIndex]);

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    // Pause auto-scroll on touch
    if (autoScrollRef.current) clearInterval(autoScrollRef.current);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      setIsTransitioning(true);
      if (diff > 0) {
        // Swipe left - next
        setCurrentIndex((prev) => (prev + 1) % broadcasts.length);
      } else {
        // Swipe right - prev
        setCurrentIndex((prev) => (prev - 1 + broadcasts.length) % broadcasts.length);
      }
    }
    // Resume auto-scroll
    if (broadcasts.length > 1) {
      autoScrollRef.current = setInterval(() => {
        setIsTransitioning(true);
        setCurrentIndex((prev) => (prev + 1) % broadcasts.length);
      }, scrollInterval * 1000);
    }
  }, [broadcasts.length, scrollInterval]);

  const handleClick = (broadcast: Broadcast) => {
    if (broadcast.url) {
      if (broadcast.url.startsWith("http")) {
        window.open(broadcast.url, "_blank");
      } else {
        navigate(broadcast.url);
      }
    }
  };

  if (broadcasts.length === 0) return null;

  const current = broadcasts[currentIndex];

  // Parse message for **bold** syntax
  const renderMessage = (msg: string) => {
    const parts = msg.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <span key={i} className="font-bold">
            {part.slice(2, -2)}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="px-4 sm:px-7 pb-2">
      <div className="max-w-lg mx-auto">
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-2xl shadow-sm"
          style={{ backgroundColor: current?.bgColor || "#FFF0F5" }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Banner Content */}
          <button
            onClick={() => handleClick(current)}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-all duration-500 ${
              current?.url ? "cursor-pointer active:scale-[0.98]" : "cursor-default"
            } ${isTransitioning ? "animate-fade-in" : ""}`}
            style={{ color: current?.textColor || "#9B1B5A" }}
          >
            {/* Icon */}
            <span className="text-2xl flex-shrink-0">{current?.icon || "📢"}</span>

            {/* Message */}
            <p className="text-sm font-medium text-left flex-1 leading-snug">
              {renderMessage(current?.message || "")}
            </p>

            {/* Arrow if has URL */}
            {current?.url && (
              <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-60" />
            )}
          </button>

          {/* Dots indicator */}
          {broadcasts.length > 1 && (
            <div className="flex justify-center gap-1.5 pb-2 -mt-0.5">
              {broadcasts.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setIsTransitioning(true);
                    setCurrentIndex(idx);
                  }}
                  className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: current?.textColor || "#9B1B5A",
                    opacity: idx === currentIndex ? 1 : 0.3,
                    transform: idx === currentIndex ? "scale(1.3)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inline keyframes for fade animation */}
      <style>{`
        @keyframes broadcastFadeIn {
          0% { opacity: 0; transform: translateX(20px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in {
          animation: broadcastFadeIn 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
