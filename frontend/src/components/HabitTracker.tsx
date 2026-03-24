"use client";

import React, { useState } from "react";
import { Plus, Check, Trash2, Flame } from "lucide-react";
import { useHabits } from "@/lib/HabitContext";

export default function HabitTracker() {
  const { habits, mounted, addHabit, toggleHabit, deleteHabit, todayStr } = useHabits();
  const [newHabitName, setNewHabitName] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addHabit(newHabitName);
    setNewHabitName("");
  };

  if (!mounted) return <div className="animate-pulse bg-slate-900/50 rounded-3xl h-[500px] w-full max-w-[400px] mx-auto"></div>;

  return (
    <div className="flex flex-col p-8 bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-[400px] mx-auto h-[500px]">
      <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-6">Daily Habits</h2>

      <form onSubmit={handleAdd} className="relative mb-6">
        <input
          type="text" value={newHabitName} onChange={(e) => setNewHabitName(e.target.value)}
          placeholder="Add a new habit..."
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 transition-all font-medium"
        />
        <button type="submit" disabled={!newHabitName.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-fuchsia-500 text-white rounded-lg hover:bg-fuchsia-400 disabled:opacity-50 disabled:hover:bg-fuchsia-500 transition-colors">
          <Plus size={18} />
        </button>
      </form>

      <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-3 custom-scrollbar">
        {habits.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white/30 space-y-4">
            <div className="w-16 h-16 rounded-full border border-dashed border-white/20 flex items-center justify-center"><Plus size={32} /></div>
            <p className="text-sm">No habits yet. Start small.</p>
          </div>
        ) : (
          habits.map((habit) => {
            const isCompletedToday = habit.lastCompletedDate === todayStr;
            return (
              <div key={habit.id} className={`group flex items-center justify-between p-4 rounded-xl border transition-all duration-300 ${isCompletedToday ? "bg-white/10 border-white/20" : "bg-white/5 border-transparent hover:bg-white/[0.07]"}`}>
                <div className="flex items-center gap-4 flex-1">
                  <button onClick={() => toggleHabit(habit.id)}
                    className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isCompletedToday ? "bg-emerald-500 border-emerald-500 text-white" : "border-white/30 text-transparent hover:border-white/50"}`}>
                    <Check size={14} className={`transition-all duration-300 ${isCompletedToday ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} />
                  </button>
                  <span className={`text-base font-medium transition-all ${isCompletedToday ? "text-white/50 line-through" : "text-white/90"}`}>{habit.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {habit.streak > 0 && (
                    <div className="flex items-center gap-1 text-orange-400 font-semibold text-sm bg-orange-400/10 px-2.5 py-1 rounded-lg">
                      <Flame size={14} className={habit.streak >= 3 ? "animate-pulse" : ""} />
                      {habit.streak}
                    </div>
                  )}
                  <button onClick={() => deleteHabit(habit.id)} className="opacity-0 group-hover:opacity-100 p-2 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
