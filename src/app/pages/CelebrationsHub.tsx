import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Header } from "../components/Header";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { Loader2, PartyPopper } from "lucide-react";
import { Mascot } from "../components/Mascot";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface CelebrationCategory {
  id: number;
  title: string;
  subtitle: string;
  buttonText: string;
  image: string;
  gradientStart: string;
  gradientEnd: string;
  enabled: boolean;
  displayOrder: number;
}

interface HubSettings {
  pageTitle: string;
  pageTitleHighlight: string;
  pageSubtitle: string;
  enabled: boolean;
}

export default function CelebrationsHub() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<CelebrationCategory[]>([]);
  const [settings, setSettings] = useState<HubSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, settingsRes] = await Promise.all([
          fetch(`${API_BASE}/celebration-categories`, {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
          }),
          fetch(`${API_BASE}/celebrations-hub-settings`, {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
          }),
        ]);

        if (catRes.ok) {
          const data = await catRes.json();
          setCategories(data.items || []);
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSettings(data);
        }
      } catch (error) {
        console.error("Failed to fetch celebrations hub:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: APP_CONFIG.brand.backgroundTint }}>
        <Header title="Celebrations" showBack onBack={() => navigate("/")} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FFF8F0" }}>
      <Header title="Celebrations" showBack onBack={() => navigate("/")} />

      {/* Hero Title Section */}
      <div className="text-center px-6 pt-5 pb-2">
        {/* Decorative confetti emoji */}
        <div className="text-3xl mb-2">
          <span role="img" aria-label="balloon">&#x1F388;</span>
          <span className="mx-1" role="img" aria-label="confetti">&#x1F389;</span>
          <span role="img" aria-label="balloon">&#x1F388;</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 leading-tight">
          {settings?.pageTitle || "Choose Your"}
        </h1>
        <h2
          className="text-xl sm:text-2xl font-extrabold leading-tight mt-0.5"
          style={{ color: BRAND }}
        >
          {settings?.pageTitleHighlight || "Party & Catering Package"}
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          {settings?.pageSubtitle || "Select an option for your next event"}
        </p>
      </div>

      {/* Mascot */}
      {APP_CONFIG.mascot.enabled && (
        <Mascot page="celebrations" className="pb-1 pt-1" />
      )}

      {/* Categories Grid */}
      <div className="flex-1 px-4 pb-8 pt-2 max-w-lg mx-auto w-full">
        {categories.length === 0 ? (
          <div className="text-center py-12">
            <PartyPopper className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 text-lg font-medium">No celebration options yet</p>
            <p className="text-gray-400 text-sm mt-1">Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => navigate(`/celebrations/${cat.id}`)}
                className="relative rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.97] text-left group"
                style={{ minHeight: "220px" }}
              >
                {/* Background Image */}
                <ImageWithFallback
                  src={cat.image}
                  alt={cat.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />

                {/* Gradient Overlay */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(180deg, ${cat.gradientStart}90 0%, ${cat.gradientEnd}CC 100%)`,
                  }}
                />

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-between h-full p-3 sm:p-4" style={{ minHeight: "220px" }}>
                  {/* Title */}
                  <h3 className="text-lg sm:text-xl font-extrabold text-white drop-shadow-lg leading-tight">
                    {cat.title}
                  </h3>

                  {/* Bottom section */}
                  <div>
                    <p className="text-white/90 text-[11px] sm:text-xs leading-snug mb-3 drop-shadow">
                      {cat.subtitle}
                    </p>

                    {/* CTA Button */}
                    <div
                      className="inline-block px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold shadow-md group-hover:shadow-lg transition-shadow"
                      style={{
                        backgroundColor: cat.gradientStart,
                        color: "white",
                        border: "2px solid rgba(255,255,255,0.4)",
                      }}
                    >
                      {cat.buttonText}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
