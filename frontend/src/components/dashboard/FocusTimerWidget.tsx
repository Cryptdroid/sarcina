"use client";
import { useState, useEffect } from "react";
import { Glow } from "../ui/Glow";
import { AnimatePresence } from "framer-motion";

type TimerState = "Idle" | "Focus" | "Break";

interface FocusTimerWidgetProps {
  setTimerActive: (isActive: boolean) => void;
}

export function FocusTimerWidget({ setTimerActive }: FocusTimerWidgetProps) {
  const [timerState, setTimerState] = useState<TimerState>("Idle");
  const [seconds, setSeconds] = useState(25 * 60);

  useEffect(() => {
    setTimerActive(timerState === 'Focus');
    if (timerState === "Focus") {
      const interval = setInterval(() => {
        setSeconds((s) => s > 0 ? s - 1 : 0);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timerState, setTimerActive]);

  const formatTime = (s: number) => {
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const glowColor =
    timerState === "Focus" ? "rgba(139, 92, 246, 0.5)" : "rgba(16, 185, 129, 0.5)";

  return (
    <section className="widget min-h-[250px] p-6 flex flex-col relative group justify-center items-center overflow-hidden">
      <AnimatePresence>
        {timerState === 'Focus' && <Glow color={glowColor} />}
      </AnimatePresence>
      <h3 className="text-lg font-heading font-bold mb-6 flex items-center gap-2 text-center w-full justify-center absolute top-6 z-10">
         Focus Flow
      </h3>
      <div
        className="w-48 h-48 border-[6px] border-dashed border-white/10 rounded-full flex flex-col items-center justify-center text-[var(--foreground-muted)] text-sm text-center p-4 mt-8 group-hover:border-[var(--accent-neon-purple)] group-hover:shadow-[0_0_30px_rgba(176,38,255,0.2)] transition-all duration-500 z-10"
        onClick={() => setTimerState(timerState === "Focus" ? "Idle" : "Focus")}
      >
        <span className="text-3xl font-heading font-bold text-white mb-2">
          {formatTime(seconds)}
        </span>
        <p className="text-xs uppercase tracking-widest">{timerState}</p>
      </div>
    </section>
  );
}
