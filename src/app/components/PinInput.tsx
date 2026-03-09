import { useState, useRef, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "./ui/button";

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function PinInput({ 
  value, 
  onChange, 
  onComplete, 
  error = false,
  disabled = false,
  autoFocus = false
}: PinInputProps) {
  const [showPin, setShowPin] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Split PIN into individual digits
  const digits = value.padEnd(6, " ").split("").slice(0, 6);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const handleChange = (index: number, digitValue: string) => {
    // Only allow numbers
    if (digitValue && !/^\d$/.test(digitValue)) {
      return;
    }

    const newDigits = [...digits];
    newDigits[index] = digitValue;
    const newValue = newDigits.join("").trim();
    
    onChange(newValue);

    // Auto-focus next input
    if (digitValue && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Call onComplete when all 6 digits are entered
    if (newValue.length === 6 && onComplete) {
      onComplete(newValue);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index].trim() && index > 0) {
      // Move to previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");
    const digitsOnly = pastedData.replace(/\D/g, "").slice(0, 6);
    
    if (digitsOnly.length > 0) {
      onChange(digitsOnly);
      
      // Focus the last filled input or the next empty one
      const nextIndex = Math.min(digitsOnly.length, 5);
      inputRefs.current[nextIndex]?.focus();

      // Call onComplete if 6 digits were pasted
      if (digitsOnly.length === 6 && onComplete) {
        onComplete(digitsOnly);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-2">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type={showPin ? "tel" : "password"}
              inputMode="numeric"
              pattern="[0-9]"
              maxLength={1}
              value={digit.trim()}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              disabled={disabled}
              className={`
                w-12 h-14 text-center text-2xl font-semibold
                border-2 rounded-lg
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-orange-500
                disabled:opacity-50 disabled:cursor-not-allowed
                ${error 
                  ? "border-red-500 bg-red-50" 
                  : "border-gray-300 focus:border-orange-500"
                }
                ${digit.trim() ? "bg-orange-50" : "bg-white"}
              `}
              style={{ 
                WebkitTextSecurity: showPin ? "none" : "disc",
              }}
            />
          ))}
        </div>
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPin(!showPin)}
          disabled={disabled}
          className="ml-2"
        >
          {showPin ? (
            <EyeOff className="h-5 w-5 text-gray-500" />
          ) : (
            <Eye className="h-5 w-5 text-gray-500" />
          )}
        </Button>
      </div>
      
      <p className="text-xs text-gray-500 text-center">
        {showPin ? "PIN visible" : "Enter your 6-digit PIN"}
      </p>
    </div>
  );
}
