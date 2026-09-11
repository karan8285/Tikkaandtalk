/**
 * EventInvitation — a reverent pop-up invitation to
 * "The Glory of Shree Jagannatha Mahaprabhu" (11 Sept 2026, Jakarta).
 *
 * Shown as a closable overlay when the customer lands on the home page — it does
 * NOT push the home content down (it is position:fixed, out of normal flow).
 * Close (X) returns to the normal home page; "Register to Join" goes to sign-up.
 * Deliberately separate from any promotional/voucher content.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { X } from "lucide-react";

const MAROON_CARD = "linear-gradient(160deg, #7E1327 0%, #5A0E1B 100%)";
const GOLD = "#E6C878";
const GOLD_SOFT = "#C9A24B";
const CREAM = "#F3E4C0";

export function EventInvitation() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"card" | "flyer">("card");

  // Open every time the home page is opened, a beat after it paints.
  // Closing only dismisses it for this view; it returns on the next home visit.
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 450);
    return () => clearTimeout(t);
  }, []);

  const close = () => setOpen(false);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4"
      style={{ background: "rgba(40, 6, 12, 0.92)" }}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Invitation: The Glory of Shree Jagannatha Mahaprabhu"
    >
      {view === "flyer" ? (
        // Full printed invitation
        <div className="relative my-auto w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
          <img
            src="/event/glory-flyer.jpg"
            alt="The Glory of Shree Jagannatha Mahaprabhu — full invitation"
            className="w-full h-auto rounded-lg"
            style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
          />
          <div className="mt-3 flex justify-center gap-2.5">
            <button
              onClick={() => navigate("/signup")}
              className="font-serif rounded-full px-6 py-3 active:scale-[0.98]"
              style={{ background: GOLD, color: "#5A0E1B", fontWeight: 700 }}
            >
              Register to Join
            </button>
            <button
              onClick={() => setView("card")}
              className="font-serif rounded-full px-6 py-3"
              style={{ background: "transparent", color: GOLD, border: `1px solid ${GOLD_SOFT}`, fontWeight: 600 }}
            >
              Back
            </button>
          </div>
          <button
            onClick={close}
            className="absolute -top-2 -right-2 p-2 rounded-full"
            style={{ background: "#5A0E1B", color: GOLD, border: `1px solid ${GOLD_SOFT}` }}
            aria-label="Close invitation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        // Reverent invitation card
        <div
          className="relative my-auto w-full max-w-md rounded-2xl overflow-hidden"
          style={{ background: MAROON_CARD, border: `1px solid ${GOLD_SOFT}`, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* close */}
          <button
            onClick={close}
            className="absolute top-2.5 right-2.5 p-2 rounded-full z-10 transition-colors"
            style={{ background: "rgba(0,0,0,0.28)", color: GOLD }}
            aria-label="Close and return to home"
          >
            <X className="w-5 h-5" />
          </button>

          <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />

          <div className="px-5 sm:px-7 pt-6 pb-6 text-center">
            <p className="font-serif" style={{ color: GOLD, letterSpacing: "0.22em", fontSize: 13, fontWeight: 600 }}>
              🙏 JAI JAGANNATH
            </p>

            <div className="mt-4 flex justify-center">
              <img
                src="/event/jagannatha-deities.jpg"
                alt="Shree Jagannatha Mahaprabhu with Balabhadra and Subhadra"
                className="w-full h-auto rounded-lg"
                style={{ maxWidth: 440, border: `1px solid ${GOLD_SOFT}`, boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }}
              />
            </div>

            <h2
              className="font-serif mt-5"
              style={{ color: GOLD, fontSize: "1.45rem", lineHeight: 1.25, textWrap: "balance", fontWeight: 700 }}
            >
              The Glory of Shree Jagannatha Mahaprabhu
            </h2>

            <p
              className="mt-2 font-serif"
              style={{ color: CREAM, fontSize: 12.5, letterSpacing: "0.12em", textTransform: "uppercase" }}
            >
              A Sacred Evening &middot; 11 September 2026 &middot; Jakarta, Indonesia
            </p>

            <div className="flex items-center justify-center gap-2 my-4" aria-hidden="true">
              <span style={{ height: 1, width: 44, background: GOLD_SOFT, opacity: 0.7 }} />
              <span style={{ color: GOLD, fontSize: 12 }}>✦</span>
              <span style={{ height: 1, width: 44, background: GOLD_SOFT, opacity: 0.7 }} />
            </div>

            <p className="font-serif" style={{ color: CREAM, fontSize: 14.5, lineHeight: 1.7 }}>
              We are deeply honoured to welcome{" "}
              <span style={{ color: GOLD, fontWeight: 600 }}>His Highness Gajapati Maharaja Shree Dibyasingha Deb</span>,{" "}
              <span style={{ fontStyle: "italic" }}>Aadya Sevak of Mahaprabhu Shree Jagannatha</span>, for a special
              interactive session.
            </p>

            <p className="font-serif mt-3" style={{ color: CREAM, fontSize: 13.5, lineHeight: 1.7, opacity: 0.95 }}>
              An evening celebrating the glory, heritage, devotion, and timeless traditions of Mahaprabhu Shree
              Jagannatha — featuring an interactive conversation on His spiritual and cultural significance.
            </p>

            <p className="font-serif mt-3" style={{ color: GOLD, fontSize: 13.5, lineHeight: 1.7, fontStyle: "italic" }}>
              With reverence and devotion, we warmly invite all devotees and well-wishers to be part of this blessed
              gathering.
            </p>

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                onClick={() => navigate("/signup")}
                className="font-serif rounded-full px-6 py-3.5 active:scale-[0.98]"
                style={{ background: GOLD, color: "#5A0E1B", fontWeight: 700, letterSpacing: "0.02em" }}
              >
                Register to Join
              </button>
              <button
                onClick={() => setView("flyer")}
                className="font-serif text-sm py-1"
                style={{ background: "transparent", color: GOLD, opacity: 0.85 }}
              >
                View full invitation
              </button>
            </div>
          </div>

          <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        </div>
      )}
    </div>
  );
}
