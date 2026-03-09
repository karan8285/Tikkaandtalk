import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Clock, Zap } from "lucide-react";

interface FlashSaleTimerProps {
  endTime: string | null;
  variant?: "default" | "compact" | "badge";
  onExpire?: () => void;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

export function FlashSaleTimer({ endTime, variant = "default", onExpire }: FlashSaleTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!endTime) {
      setIsExpired(false);
      setTimeLeft(null);
      return;
    }

    const calculateTimeLeft = (): TimeLeft => {
      const difference = new Date(endTime).getTime() - new Date().getTime();
      
      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
      }

      return {
        total: difference,
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    };

    // Initial calculation
    const initial = calculateTimeLeft();
    setTimeLeft(initial);
    
    if (initial.total <= 0) {
      setIsExpired(true);
      if (onExpire) onExpire();
      return;
    }

    // Update every second
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft();
      setTimeLeft(newTimeLeft);

      if (newTimeLeft.total <= 0) {
        setIsExpired(true);
        clearInterval(timer);
        if (onExpire) onExpire();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [endTime, onExpire]);

  if (!endTime) {
    return null;
  }

  if (isExpired || !timeLeft || timeLeft.total <= 0) {
    return (
      <div className="text-center py-2 px-4 bg-gray-100 rounded-lg">
        <p className="text-sm text-gray-600 font-medium">⏰ Flash Sale Ended</p>
      </div>
    );
  }

  // Compact badge variant (for cart/checkout)
  if (variant === "badge") {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="inline-flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-full text-xs font-semibold shadow-md"
      >
        <Zap className="w-3 h-3 fill-white" />
        <span>
          {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
        </span>
      </motion.div>
    );
  }

  // Compact variant (for item cards)
  if (variant === "compact") {
    return (
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg shadow-lg"
      >
        <Clock className="w-4 h-4" />
        <div className="flex items-center gap-1.5 text-sm font-bold">
          {timeLeft.days > 0 && (
            <>
              <span>{timeLeft.days}d</span>
              <span>:</span>
            </>
          )}
          <span>{String(timeLeft.hours).padStart(2, "0")}</span>
          <span>:</span>
          <span>{String(timeLeft.minutes).padStart(2, "0")}</span>
          <span>:</span>
          <motion.span
            key={timeLeft.seconds}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {String(timeLeft.seconds).padStart(2, "0")}
          </motion.span>
        </div>
      </motion.div>
    );
  }

  // Default full variant (for main page)
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-600 via-rose-600 to-pink-600 rounded-lg shadow-lg px-3 py-2"
    >
      <motion.div
        animate={{ rotate: [0, 15, -15, 0] }}
        transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
      >
        <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
      </motion.div>
      
      <div className="flex items-center gap-1.5 text-white">
        {timeLeft.days > 0 && (
          <>
            <span className="text-lg font-bold">{String(timeLeft.days).padStart(2, "0")}</span>
            <span className="text-xs">d</span>
            <span className="mx-0.5">:</span>
          </>
        )}
        <span className="text-lg font-bold">{String(timeLeft.hours).padStart(2, "0")}</span>
        <span className="text-xs">h</span>
        <span className="mx-0.5">:</span>
        <span className="text-lg font-bold">{String(timeLeft.minutes).padStart(2, "0")}</span>
        <span className="text-xs">m</span>
        <span className="mx-0.5">:</span>
        <motion.span
          key={timeLeft.seconds}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-lg font-bold"
        >
          {String(timeLeft.seconds).padStart(2, "0")}
        </motion.span>
        <span className="text-xs">s</span>
      </div>

      {timeLeft.total < 3600000 && (
        <motion.span
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="text-yellow-300 text-xs font-bold ml-1"
        >
          ⚡
        </motion.span>
      )}
    </motion.div>
  );
}

function TimeBlock({ value, label, animate = false }: { value: number; label: string; animate?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={value}
          initial={animate ? { scale: 1.3, opacity: 0.5 } : false}
          animate={{ scale: 1, opacity: 1 }}
          exit={animate ? { scale: 0.8, opacity: 0 } : false}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-lg shadow-lg px-3 py-2 min-w-[60px] flex items-center justify-center"
        >
          <span className="text-2xl font-bold text-pink-600">
            {String(value).padStart(2, "0")}
          </span>
        </motion.div>
      </AnimatePresence>
      <span className="text-white text-xs font-medium mt-1 uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

function TimeDivider() {
  return (
    <div className="flex items-center pb-6">
      <motion.span
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
        className="text-white text-2xl font-bold"
      >
        :
      </motion.span>
    </div>
  );
}

export default FlashSaleTimer;