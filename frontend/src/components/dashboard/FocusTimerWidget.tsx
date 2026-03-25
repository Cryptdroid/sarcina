"use client";

import { useEffect } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { useFocus } from "@/lib/FocusContext";

interface FocusTimerWidgetProps {
  setTimerActive?: (active: boolean) => void;
}

export function FocusTimerWidget({ setTimerActive }: FocusTimerWidgetProps) {
  const {
    mode, timeLeft, isRunning, progress,
    workDuration, breakDuration,
    toggleTimer, resetTimer, handleModeSwitch, setWorkDuration, setBreakDuration,
    adjustCurrentTime, setCurrentTimeMinutes, formatTime,
  } = useFocus();

  useEffect(() => {
    setTimerActive?.(isRunning);
  }, [isRunning, setTimerActive]);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <section className="glass-card p-6 flex flex-col items-center gap-4">
      {/* Title */}
      <h3 className="text-lg font-heading font-bold w-full text-center">
        Focus Flow
      </h3>

      {/* Mode toggle — proper block, no absolute positioning */}
      <div className="flex gap-1 p-0.5 bg-black/8 dark:bg-white/10 rounded-full text-xs w-fit">
        <button
          onClick={() => handleModeSwitch("work")}
          className={`px-4 py-1.5 rounded-full font-semibold transition-all ${
            mode === "work" ? "bg-black text-white dark:bg-white dark:text-black" : "text-(--foreground-muted) hover:text-foreground"
          }`}
        >
          Work
        </button>
        <button
          onClick={() => handleModeSwitch("break")}
          className={`px-4 py-1.5 rounded-full font-semibold transition-all ${
            mode === "break" ? "bg-black text-white dark:bg-white dark:text-black" : "text-(--foreground-muted) hover:text-foreground"
          }`}
        >
          Break
        </button>
      </div>

      {/* SVG progress ring */}
      <div className="relative flex items-center justify-center">
        <svg width="140" height="140" className="transform -rotate-90">
          <circle
            cx="70" cy="70" r={radius}
            stroke="currentColor" strokeWidth="6" fill="transparent"
            className="text-(--glass-border)"
          />
          <circle
            cx="70" cy="70" r={radius}
            stroke={mode === "work" ? "url(#fw-gradient)" : "url(#fb-gradient)"}
            strokeWidth="6" fill="transparent" strokeLinecap="round"
            style={{ strokeDasharray: circumference, strokeDashoffset, transition: "stroke-dashoffset 1s linear" }}
          />
          <defs>
            <linearGradient id="fw-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#5a5a5a" />
            </linearGradient>
            <linearGradient id="fb-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9b9b9b" />
              <stop offset="100%" stopColor="#d9d9d9" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-heading font-bold text-foreground tabular-nums">
            {formatTime(timeLeft)}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-(--foreground-muted) mt-1">{mode}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={toggleTimer}
          className={`w-11 h-11 rounded-full flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 shadow-lg ${
            isRunning
              ? "bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
              : mode === "work"
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "bg-black text-white dark:bg-white dark:text-black"
          }`}
        >
          {isRunning ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
        <button
          onClick={resetTimer}
          className="w-11 h-11 rounded-full bg-black/8 dark:bg-white/10 hover:bg-black/12 dark:hover:bg-white/15 flex items-center justify-center text-(--foreground-muted) hover:text-foreground transition-all hover:scale-105 active:scale-95"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="w-full grid grid-cols-1 gap-2 mt-1">
        <div className="grid grid-cols-2 gap-2">
          <label className="rounded-lg border border-(--glass-border) bg-black/5 dark:bg-white/5 px-3 py-2 text-xs">
            <span className="text-(--foreground-muted)">Work (min)</span>
            <input
              type="number"
              min={1}
              max={240}
              value={workDuration}
              onChange={(event) => setWorkDuration(Math.max(1, Math.min(240, Number(event.target.value) || 1)))}
              className="mt-1 w-full bg-transparent text-foreground focus:outline-none"
            />
          </label>
          <label className="rounded-lg border border-(--glass-border) bg-black/5 dark:bg-white/5 px-3 py-2 text-xs">
            <span className="text-(--foreground-muted)">Break (min)</span>
            <input
              type="number"
              min={1}
              max={240}
              value={breakDuration}
              onChange={(event) => setBreakDuration(Math.max(1, Math.min(240, Number(event.target.value) || 1)))}
              className="mt-1 w-full bg-transparent text-foreground focus:outline-none"
            />
          </label>
        </div>

        <div className="rounded-lg border border-(--glass-border) bg-black/5 dark:bg-white/5 px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-(--foreground-muted)">Current {mode} session</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => adjustCurrentTime(-1)}
                className="h-6 w-6 rounded bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={240}
                value={Math.max(1, Math.round(timeLeft / 60))}
                onChange={(event) => setCurrentTimeMinutes(Number(event.target.value) || 1)}
                className="w-14 rounded bg-transparent text-center text-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={() => adjustCurrentTime(1)}
                className="h-6 w-6 rounded bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
