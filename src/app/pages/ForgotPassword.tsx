import { useNavigate } from "react-router";
import { MessageCircle, Lock } from "lucide-react";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";

// Forgot Password - WhatsApp Contact Page
export default function ForgotPassword() {
  const navigate = useNavigate();

  const handleWhatsAppClick = () => {
    const phoneNumber = "628192515550"; // 0819-2515-550 in international format
    const message = encodeURIComponent("Hi, I need help to reset my password for Tikka N Talk app. Please help me reset my account password.");
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    window.open(whatsappUrl, "_blank");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showBack title="Forgot Password" />

      <main className="max-w-md mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-3">Need to Reset Your Password?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Please contact us via WhatsApp to reset your password. Our team will help you regain access to your account quickly.
            </p>

            <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-foreground mb-2">
                <strong>Contact Support:</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                WhatsApp: 0819-2515-550
              </p>
            </div>

            <Button
              onClick={handleWhatsAppClick}
              className="w-full h-12 bg-[#25D366] hover:bg-[#20BA5A] text-white flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              Contact via WhatsApp
            </Button>

            <Button
              variant="ghost"
              className="w-full mt-4"
              onClick={() => navigate("/login")}
            >
              Back to Login
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}