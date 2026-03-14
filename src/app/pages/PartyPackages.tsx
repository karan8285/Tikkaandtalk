import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Header } from "../components/Header";
import { APP_CONFIG } from "../lib/config";
import { formatIDR } from "../lib/currency";
import { getWhatsAppLink } from "../lib/whatsapp";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { MessageCircle, Loader2, PartyPopper } from "lucide-react";
import { Mascot } from "../components/Mascot";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface PackageFeature {
  emoji: string;
  text: string;
}

interface PartyPackage {
  id: number;
  categoryId: number;
  name: string;
  price: number;
  priceNote: string;
  description: string;
  features: PackageFeature[];
  tierColor: string;
  tierGradient: string;
  enabled: boolean;
  displayOrder: number;
}

interface CelebrationCategory {
  id: number;
  title: string;
  subtitle: string;
  buttonText: string;
  image: string;
  gradientStart: string;
  gradientEnd: string;
}

interface PageSettings {
  pageTitle: string;
  pageSubtitle: string;
  bannerImage: string;
  bookingWhatsAppMessage: string;
  enabled: boolean;
}

export default function PartyPackages() {
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();
  const [packages, setPackages] = useState<PartyPackage[]>([]);
  const [category, setCategory] = useState<CelebrationCategory | null>(null);
  const [settings, setSettings] = useState<PageSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const catIdParam = categoryId ? `?categoryId=${categoryId}` : "";
        const fetches: Promise<Response>[] = [
          fetch(`${API_BASE}/party-packages${catIdParam}`, {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
          }),
          fetch(`${API_BASE}/party-packages-settings`, {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
          }),
        ];

        // Also fetch the category details for the header
        if (categoryId) {
          fetches.push(
            fetch(`${API_BASE}/celebration-categories`, {
              headers: { Authorization: `Bearer ${publicAnonKey}` },
            })
          );
        }

        const responses = await Promise.all(fetches);

        if (responses[0].ok) {
          const data = await responses[0].json();
          setPackages(data.items || []);
        }
        if (responses[1].ok) {
          const data = await responses[1].json();
          setSettings(data);
        }
        if (categoryId && responses[2]?.ok) {
          const data = await responses[2].json();
          const found = (data.items || []).find(
            (c: CelebrationCategory) => c.id === parseInt(categoryId)
          );
          if (found) setCategory(found);
        }
      } catch (error) {
        console.error("Failed to fetch party packages:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [categoryId]);

  const handleBookPackage = (pkg: PartyPackage) => {
    const categoryName = category?.title || "Celebration";
    const message = settings?.bookingWhatsAppMessage
      ? `${settings.bookingWhatsAppMessage}\n\nCategory: ${categoryName}\nPackage: ${pkg.name}${pkg.price > 0 ? `\nPrice: ${formatIDR(pkg.price)}` : ""}`
      : `Hi! I'd like to book the ${pkg.name} package from ${categoryName}.`;
    window.open(getWhatsAppLink(message), "_blank");
  };

  const headerTitle = category?.title || "Celebrations";
  const backPath = categoryId ? "/celebrations" : "/";

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: APP_CONFIG.brand.backgroundTint }}>
        <Header title={headerTitle} showBack onBack={() => navigate(backPath)} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FFF8F0" }}>
      <Header title={headerTitle} showBack onBack={() => navigate(backPath)} />

      {/* Hero Banner - uses category image if available, fallback to settings */}
      {(category?.image || settings?.bannerImage) && (
        <div className="relative w-full overflow-hidden" style={{ maxHeight: "200px" }}>
          <img
            src={category?.image || settings?.bannerImage || ""}
            alt={headerTitle}
            className="w-full h-[200px] object-cover"
          />
          {/* Overlay */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
            style={{
              background: category
                ? `linear-gradient(180deg, ${category.gradientStart}80 0%, ${category.gradientEnd}BB 100%)`
                : "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)",
            }}
          >
            <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg leading-tight">
              {category?.title || settings?.pageTitle || "Celebrate Your Special Moments"}
            </h1>
            <p className="text-white/90 text-sm sm:text-base mt-2 drop-shadow">
              {category?.subtitle || settings?.pageSubtitle || "Customizable packages for every occasion"}
            </p>
          </div>
          {/* Bottom curve */}
          <div className="absolute bottom-0 left-0 right-0">
            <svg viewBox="0 0 1440 40" className="w-full" preserveAspectRatio="none">
              <path d="M0,40 L0,20 Q720,0 1440,20 L1440,40 Z" fill="#FFF8F0" />
            </svg>
          </div>
        </div>
      )}

      {/* Mascot */}
      {APP_CONFIG.mascot.enabled && (
        <Mascot page="celebrations" className="pb-2 pt-2" />
      )}

      {/* Packages List */}
      <div className="flex-1 px-4 pb-8 space-y-5 max-w-lg mx-auto w-full">
        {packages.length === 0 ? (
          <div className="text-center py-12">
            <PartyPopper className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 text-lg font-medium">No packages available yet</p>
            <p className="text-gray-400 text-sm mt-1">
              {categoryId
                ? "Packages for this category coming soon!"
                : "Check back soon!"}
            </p>
          </div>
        ) : (
          packages.map((pkg, index) => (
            <div
              key={pkg.id}
              className="relative rounded-2xl overflow-hidden shadow-lg"
              style={{ background: "white" }}
            >
              {/* Tier Header Bar */}
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{ background: pkg.tierGradient }}
              >
                <h2 className="text-xl font-bold text-white drop-shadow-sm flex items-center gap-2">
                  <span className="text-2xl">
                    {index === 0
                      ? "\u{1F948}"
                      : index === 1
                      ? "\u{1F947}"
                      : index === 2
                      ? "\u{1F48E}"
                      : "\u2728"}
                  </span>
                  {pkg.name}
                </h2>
                <div className="text-right">
                  {pkg.price > 0 ? (
                    <>
                      <p className="text-lg font-bold text-white drop-shadow-sm">
                        {formatIDR(pkg.price)}
                      </p>
                      <p className="text-[11px] text-white/80">({pkg.priceNote})</p>
                    </>
                  ) : (
                    <p className="text-sm font-semibold text-white/90">{pkg.priceNote}</p>
                  )}
                </div>
              </div>

              {/* Decorative accent */}
              <div
                className="h-1"
                style={{
                  background: `linear-gradient(90deg, ${pkg.tierColor}40, ${pkg.tierColor}, ${pkg.tierColor}40)`,
                }}
              />

              {/* Features List */}
              <div className="px-5 py-4">
                {pkg.description && (
                  <p className="text-xs text-gray-500 italic mb-3">{pkg.description}</p>
                )}
                <ul className="space-y-2.5">
                  {pkg.features.map((feature, fIdx) => (
                    <li key={fIdx} className="flex items-start gap-2.5">
                      <span className="text-lg leading-none mt-0.5 flex-shrink-0">
                        {feature.emoji}
                      </span>
                      <span className="text-sm text-gray-700 leading-snug">
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Book Button */}
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => handleBookPackage(pkg)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow-md hover:shadow-lg active:scale-95 transition-all duration-200"
                    style={{
                      background: `linear-gradient(135deg, ${BRAND}, ${APP_CONFIG.brand.gradientEnd})`,
                    }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    Book This Package
                  </button>
                </div>
              </div>

              {/* Bottom decorative line */}
              <div
                className="h-0.5"
                style={{
                  background: `linear-gradient(90deg, transparent, ${pkg.tierColor}60, transparent)`,
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
