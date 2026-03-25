"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Pause, RotateCcw, Settings2 } from "lucide-react";
import { useFocus } from "@/lib/FocusContext";

const INTENTION_KEY = "focus-flow-intention";

function getPhaseCue(progress: number, mode: "work" | "break"): string {
  if (mode === "break") {
    if (progress < 33) return "Drop shoulder tension and reset breath.";
    if (progress < 66) return "Walk, hydrate, and avoid context switching.";
    return "Recharge complete. Prepare next deep-work block.";
  }

  if (progress < 20) return "Warm-up phase: lock distractions and start easy.";
  if (progress < 60) return "Deep zone: one task, no tab hopping.";
  if (progress < 90) return "Final push: finish this block cleanly.";
  return "Landing phase: summarize output before break.";
}

export default function FocusPage() {
  const {
    mode, timeLeft, isRunning, progress, workDuration, breakDuration,
    toggleTimer, resetTimer, handleModeSwitch, setWorkDuration, setBreakDuration, formatTime,
    focusMinutesToday, focusSessionsToday,
  } = useFocus();

  const [showSettings, setShowSettings] = useState(false);
  const [intention, setIntention] = useState("");

  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(INTENTION_KEY);
      if (saved) {
        setIntention(saved);
      }
    } catch {
      // Ignore localStorage read errors.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(INTENTION_KEY, intention);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [intention]);

  const phaseCue = useMemo(() => getPhaseCue(progress, mode), [progress, mode]);

  return (
    <div className="min-h-screen p-4 md:p-8 w-full h-[calc(100dvh-4rem)] md:h-dvh overflow-y-auto overflow-x-hidden pb-24 md:pb-8 relative">
      <div className={`absolute inset-0 blur-[120px] opacity-10 pointer-events-none transition-colors duration-1000 ${mode === "work" ? "bg-violet-600" : "bg-emerald-600"}`} />

      <div className="relative z-10 flex flex-col gap-6 items-center justify-center min-h-[88vh]">
        <div className="flex flex-col items-center p-8 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden w-full max-w-245 min-h-135">
          <div className={`absolute -inset-20 blur-[100px] rounded-full opacity-20 pointer-events-none transition-colors duration-1000 ${mode === "work" ? "bg-violet-600" : "bg-emerald-600"}`} />

          {/* Header */}
          <div className="flex justify-between items-center w-full mb-8 relative z-10">
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-linear-to-r from-white to-white/60">
              Focus Studio
            </h2>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-white/50 hover:text-white transition-colors p-2 rounded-full hover:bg-white/5"
            >
              <Settings2 size={20} />
            </button>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="absolute inset-0 z-20 bg-slate-950/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8 rounded-3xl">
              <h3 className="text-xl font-semibold text-white mb-6">Timer Settings</h3>
              <div className="w-full space-y-6">
                <div className="space-y-2">
                  <label className="text-sm text-white/70 font-medium">Work Duration (min)</label>
                  <input
                    type="number"
                    value={workDuration}
                    onChange={(e) => setWorkDuration(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-white/70 font-medium">Break Duration (min)</label>
                  <input
                    type="number"
                    value={breakDuration}
                    onChange={(e) => setBreakDuration(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  />
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-full mt-4 py-3 rounded-xl bg-white text-slate-950 font-semibold hover:bg-white/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3 mb-7 relative z-10">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Intention</p>
              <input
                value={intention}
                onChange={(event) => setIntention(event.target.value)}
                placeholder="What will you finish in this block?"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              <p className="mt-2 text-[11px] text-white/45">One sentence only. Keep it concrete.</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Session Signal</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-black/20 px-3 py-2">
                  <p className="text-[10px] text-white/45 uppercase">Mode</p>
                  <p className="text-sm text-white font-semibold">{mode === "work" ? "Work" : "Break"}</p>
                </div>
                <div className="rounded-lg bg-black/20 px-3 py-2">
                  <p className="text-[10px] text-white/45 uppercase">Progress</p>
                  <p className="text-sm text-white font-semibold">{Math.round(progress)}%</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-white/60">{phaseCue}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Today Ledger</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-black/20 px-3 py-2">
                  <p className="text-[10px] text-white/45 uppercase">Focused Min</p>
                  <p className="text-sm text-white font-semibold">{focusMinutesToday}</p>
                </div>
                <div className="rounded-lg bg-black/20 px-3 py-2">
                  <p className="text-[10px] text-white/45 uppercase">Sessions</p>
                  <p className="text-sm text-white font-semibold">{focusSessionsToday}</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-white/45">Consistency beats intensity.</p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2 p-1 bg-white/5 rounded-full mb-8 relative z-10 w-full max-w-60">
            <button
              onClick={() => handleModeSwitch("work")}
              className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all ${mode === "work" ? "bg-violet-500 text-white shadow-lg shadow-violet-500/25" : "text-white/50 hover:text-white"}`}
            >
              Work
            </button>
            <button
              onClick={() => handleModeSwitch("break")}
              className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all ${mode === "break" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" : "text-white/50 hover:text-white"}`}
            >
              Break
            </button>
          </div>

          {/* SVG Ring */}
          <div className="relative flex items-center justify-center mb-10 z-10">
            <svg width="280" height="280" className="transform -rotate-90">
              <circle cx="140" cy="140" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
              <circle
                cx="140" cy="140" r={radius}
                stroke={mode === "work" ? "url(#fp-work)" : "url(#fp-break)"}
                strokeWidth="8" fill="transparent" strokeLinecap="round"
                style={{ strokeDasharray: circumference, strokeDashoffset, transition: "stroke-dashoffset 1s linear" }}
              />
              <defs>
                <linearGradient id="fp-work" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#d946ef" />
                </linearGradient>
                <linearGradient id="fp-break" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-6xl font-light tracking-tighter text-white drop-shadow-md">{formatTime(timeLeft)}</span>
              <span className="text-sm font-medium text-white/50 mt-2 uppercase tracking-widest">{mode}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-4 relative z-10 mt-auto">
            <button
              onClick={toggleTimer}
              className={`h-16 w-16 flex items-center justify-center rounded-full text-white transition-all transform hover:scale-105 active:scale-95 shadow-xl ${
                isRunning
                  ? "bg-white/10 hover:bg-white/20 border border-white/10"
                  : mode === "work"
                  ? "bg-linear-to-tr from-violet-600 to-fuchsia-600 shadow-violet-500/30"
                  : "bg-linear-to-tr from-emerald-500 to-blue-500 shadow-emerald-500/30"
              }`}
            >
              {isRunning ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
            </button>
            <button
              onClick={resetTimer}
              className="h-16 w-16 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-white/70 hover:text-white transition-all transform hover:scale-105 active:scale-95"
            >
              <RotateCcw size={24} />
            </button>
          </div>

          <div className="w-full mt-6 relative z-10">
            <div className="flex items-center justify-between text-[11px] text-white/45 mb-2">
              <span>Flow Rail</span>
              <span>{formatTime(timeLeft)} left</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${mode === "work" ? "bg-linear-to-r from-violet-500 to-fuchsia-500" : "bg-linear-to-r from-emerald-500 to-sky-500"}`}
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
