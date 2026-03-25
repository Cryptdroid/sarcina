"use client";

import { useState } from "react";
import { Check, Flame, Plus, Trash2 } from "lucide-react";
import { useHabits } from "@/lib/HabitContext";

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function aiHabitIdeas(goal: string): string[] {
  const q = normalize(goal);
  if (!q) {
    return [];
  }

  if (/sleep|bed|wake|morning/.test(q)) {
    return [
      "No phone for 20 minutes before sleep",
      "Wake up at the same time daily",
      "Get 10 minutes of morning sunlight",
    ];
  }

  if (/fit|workout|gym|exercise|health/.test(q)) {
    return [
      "Do a 10-minute movement session",
      "Take a 20-minute walk after lunch",
      "Prepare workout clothes the night before",
    ];
  }

  if (/study|learn|exam|course|read/.test(q)) {
    return [
      "Study in one 25-minute focus block",
      "Write 3 key takeaways after each session",
      "Review yesterday's notes for 10 minutes",
    ];
  }

  if (/focus|productiv|deep work|distraction/.test(q)) {
    return [
      "Start one 25-minute no-distraction sprint",
      "Plan top 1 priority before 10 AM",
      "Do a 2-minute desk reset before work block",
    ];
  }

  return [
    "Drink water right after waking up",
    "Take one 10-minute reset walk",
    "Write tomorrow's top priority before bed",
  ];
}

export function HabitTrackerWidget() {
  const { habits, mounted, addHabit, toggleHabit, deleteHabit, todayStr } = useHabits();
  const [newHabit, setNewHabit] = useState("");
  const [coachPrompt, setCoachPrompt] = useState("");
  const [coachIdeas, setCoachIdeas] = useState<string[]>([]);
  const [coachMessage, setCoachMessage] = useState<string>("Tell AI your goal to get 3 micro-habits.");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addHabit(newHabit);
    setNewHabit("");
  };

  const runCoach = () => {
    const ideas = aiHabitIdeas(coachPrompt);
    setCoachIdeas(ideas);

    const atRisk = habits.filter((habit) => habit.streak > 0 && habit.lastCompletedDate !== todayStr).length;
    if (ideas.length === 0) {
      setCoachMessage("Add a goal like 'sleep better' or 'study consistently'.");
      return;
    }

    if (atRisk > 0) {
      setCoachMessage(`${atRisk} active streak${atRisk > 1 ? "s" : ""} need rescue today. Pick one easy win first.`);
      return;
    }

    setCoachMessage("Good momentum. Start with the easiest habit and repeat daily for 7 days.");
  };

  if (!mounted) return (
    <section className="glass-card min-h-62.5 p-6 flex flex-col">
      <div className="animate-pulse flex flex-col gap-3">
        <div className="h-6 bg-white/5 rounded w-1/3" />
        <div className="h-10 bg-white/5 rounded" />
        <div className="h-10 bg-white/5 rounded" />
        <div className="h-10 bg-white/5 rounded" />
      </div>
    </section>
  );

  return (
    <section className="glass-card min-h-62.5 p-6 flex flex-col relative group">
      <h3 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-neon-purple shadow-[0_0_10px_var(--accent-neon-purple)]"></span>
        Habit Tracker
      </h3>
      <div className="flex-1 flex flex-col gap-3">
        <form onSubmit={handleAdd} className="relative mb-2">
          <input
            type="text"
            value={newHabit}
            onChange={(e) => setNewHabit(e.target.value)}
            placeholder="Add a new habit..."
            className="w-full bg-white/70 dark:bg-white/5 border border-(--glass-border) rounded-xl pl-4 pr-10 py-2.5 text-sm text-foreground placeholder-(--foreground-muted) focus:outline-none focus:border-foreground transition-all"
          />
          <button
            type="submit"
            disabled={!newHabit.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-90 transition-colors disabled:opacity-50"
          >
            <Plus size={14} />
          </button>
        </form>

        <div className="rounded-xl border border-(--glass-border) bg-black/6 dark:bg-white/6 p-3 mb-2">
          <p className="text-[11px] uppercase tracking-[0.16em] text-(--foreground-muted)">AI Habit Coach</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={coachPrompt}
              onChange={(e) => setCoachPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runCoach();
                }
              }}
              placeholder="Example: sleep better, be fit, study daily"
              className="flex-1 rounded-lg border border-(--glass-border) bg-white/70 dark:bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-(--foreground-muted) focus:outline-none focus:border-foreground"
            />
            <button
              type="button"
              onClick={runCoach}
              className="rounded-lg bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-xs font-semibold hover:opacity-90"
            >
              Suggest
            </button>
          </div>

          <p className="mt-2 text-[11px] text-(--foreground-muted)">{coachMessage}</p>

          {coachIdeas.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {coachIdeas.map((idea) => (
                <div key={idea} className="rounded-lg border border-(--glass-border) bg-black/6 dark:bg-white/6 px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs text-foreground truncate">{idea}</p>
                  <button
                    type="button"
                    onClick={() => addHabit(idea)}
                    className="text-[11px] rounded-md px-2 py-1 bg-white/10 hover:bg-white/20 text-foreground"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto max-h-40 pr-1">
          {habits.length === 0 && (
            <p className="text-center text-(--foreground-muted) text-sm py-4">No habits yet. Start small.</p>
          )}
          {habits.map((habit) => {
            const isCompletedToday = habit.lastCompletedDate === todayStr;
            return (
              <div
                key={habit.id}
                className={`group/habit min-h-10 rounded-xl flex items-center px-4 justify-between transition-all cursor-pointer border ${isCompletedToday ? "bg-black/8 dark:bg-white/10 border-(--glass-border)" : "bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/8 dark:hover:bg-white/8"}`}
                onClick={() => toggleHabit(habit.id)}
              >
                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                  <div className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${isCompletedToday ? "bg-black border-black text-white dark:bg-white dark:border-white dark:text-black" : "border-(--glass-border) text-transparent"}`}>
                    <Check size={12} className={`transition-all ${isCompletedToday ? "opacity-100 scale-100" : "opacity-0 scale-50"}`} />
                  </div>
                  <span className={`text-sm truncate transition-all ${isCompletedToday ? "text-(--foreground-muted) line-through" : "text-foreground"}`}>
                    {habit.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {habit.streak > 0 && (
                    <div className="flex items-center gap-1 bg-black/10 dark:bg-white/10 text-foreground px-2 py-0.5 rounded-lg text-xs font-bold">
                      <Flame size={11} className={habit.streak >= 3 ? "animate-pulse" : ""} />
                      <span>{habit.streak}</span>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteHabit(habit.id); }}
                    className="opacity-0 group-hover/habit:opacity-100 p-1 text-(--foreground-muted) hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
