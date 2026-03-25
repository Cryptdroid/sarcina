"use client";

import { useState } from "react";
import { Check, Flame, Plus, Trash2 } from "lucide-react";
import { useHabits } from "@/lib/HabitContext";

type CoachIdea = {
  text: string;
  reason: string;
};

type CoachSource = "puter" | "gemini" | "free-model" | "fallback";

type PuterIdeasResult = {
  ideas: CoachIdea[];
  error: string | null;
};

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function localFallbackIdeas(goal: string, habits: Array<{ name: string }>): CoachIdea[] {
  const q = normalize(goal);
  const existingNames = habits.map((habit) => normalize(habit.name));
  const ideas: CoachIdea[] = [];

  const addIfMissing = (idea: CoachIdea) => {
    const normalizedIdea = normalize(idea.text);
    const existsAlready = existingNames.some((name) => normalizedIdea.includes(name) || name.includes(normalizedIdea));
    const duplicateInIdeas = ideas.some((entry) => normalize(entry.text) === normalizedIdea);
    if (!existsAlready && !duplicateInIdeas) {
      ideas.push(idea);
    }
  };

  addIfMissing({ text: `Do one 15-minute focused drill for ${q || "your goal"}`, reason: "Short sessions are easier to repeat daily." });
  addIfMissing({ text: "Review one mistake and note one improvement", reason: "Fast feedback compounds progress." });
  addIfMissing({ text: "Track one metric after practice", reason: "Measurement keeps improvement visible." });
  addIfMissing({ text: "Set a fixed daily time for this habit", reason: "Time cues make consistency easier." });

  return ideas.slice(0, 4);
}

function parseSuggestionPayload(raw: unknown): CoachIdea[] {
  const payload = raw as { suggestions?: unknown };
  const rawSuggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  return rawSuggestions
    .map((item: unknown) => {
      const candidate = item as { text?: unknown; reason?: unknown };
      return {
        text: typeof candidate.text === "string" ? candidate.text.trim() : "",
        reason: typeof candidate.reason === "string" ? candidate.reason.trim() : "",
      };
    })
    .filter((item: CoachIdea) => item.text.length > 0 && item.reason.length > 0)
    .slice(0, 4);
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1];
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  return null;
}

async function waitForPuterReady(maxMs = 2500): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }
  if (window.puter?.ai?.chat) {
    return true;
  }

  const started = Date.now();
  while (Date.now() - started < maxMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    if (window.puter?.ai?.chat) {
      return true;
    }
  }

  return false;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Timed out")), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function puterResponseToText(response: unknown): Promise<string | null> {
  if (typeof response === "string") {
    return response;
  }

  if (!response || typeof response !== "object") {
    return null;
  }

  const maybeAsyncIterable = response as AsyncIterable<{ text?: unknown }>;
  if (typeof maybeAsyncIterable[Symbol.asyncIterator] === "function") {
    let combined = "";
    for await (const part of maybeAsyncIterable) {
      if (typeof part?.text === "string") {
        combined += part.text;
      }
    }
    return combined.trim() || null;
  }

  const raw = response as {
    text?: unknown;
    content?: unknown;
    output?: unknown;
    message?: unknown;
  };

  if (typeof raw.text === "string") {
    return raw.text;
  }
  if (typeof raw.content === "string") {
    return raw.content;
  }
  if (typeof raw.output === "string") {
    return raw.output;
  }

  if (raw.message && typeof raw.message === "object") {
    const msg = raw.message as { content?: unknown; text?: unknown };
    if (typeof msg.content === "string") {
      return msg.content;
    }
    if (typeof msg.text === "string") {
      return msg.text;
    }
  }

  return null;
}

async function fetchPuterIdeas(goal: string, habits: Array<{ name: string }>): Promise<PuterIdeasResult> {
  if (!(await waitForPuterReady())) {
    return { ideas: [], error: "Puter SDK not loaded (possibly blocked by browser shield/extension)." };
  }
  const puter = window.puter;
  if (!puter?.ai?.chat) {
    return { ideas: [], error: "Puter AI API is unavailable in this tab." };
  }

  const existing = habits.map((habit) => habit.name).filter(Boolean);
  const prompt = [
    "Return only strict JSON with this schema:",
    '{"suggestions":[{"text":"string","reason":"string"}]}.',
    "Generate exactly 4 practical micro-habits for the goal.",
    "Each habit must be specific, short, and doable today.",
    `Avoid duplicates and avoid these existing habits: ${existing.length ? existing.join(", ") : "none"}.`,
    `goal=${goal}`,
  ].join("\n");

  let response: unknown;
  try {
    response = await withTimeout(
      puter.ai.chat(prompt, {
        model: "gemini-3-flash-preview",
      }),
      12000
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Puter request error.";
    return { ideas: [], error: `Puter request failed: ${message}` };
  }

  const responseText = await puterResponseToText(response);
  if (!responseText) {
    return { ideas: [], error: "Puter returned empty or unsupported response format." };
  }

  const jsonText = extractJsonObject(responseText);
  if (!jsonText) {
    return { ideas: [], error: "Puter response did not contain valid JSON." };
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return { ideas: parseSuggestionPayload(parsed), error: null };
  } catch {
    return { ideas: [], error: "Puter JSON parse failed." };
  }
}

export function HabitTrackerWidget() {
  const { habits, mounted, addHabit, toggleHabit, deleteHabit, todayStr } = useHabits();
  const [newHabit, setNewHabit] = useState("");
  const [coachPrompt, setCoachPrompt] = useState("");
  const [coachIdeas, setCoachIdeas] = useState<CoachIdea[]>([]);
  const [coachMessage, setCoachMessage] = useState<string>("Tell AI your goal to get 3 micro-habits.");
  const [coachLoading, setCoachLoading] = useState(false);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addHabit(newHabit);
    setNewHabit("");
  };

  const runCoach = async () => {
    const trimmedGoal = coachPrompt.trim();
    if (trimmedGoal.length < 3) {
      setCoachMessage("Add a clearer goal like 'improve Valorant aim' or 'sleep better'.");
      setCoachIdeas([]);
      return;
    }

    setCoachLoading(true);

    let ideas: CoachIdea[] = [];
    let source: CoachSource = "fallback";
    let backendMessage: string | null = null;
    let puterError: string | null = null;

    try {
      const puterResult = await fetchPuterIdeas(trimmedGoal, habits);
      puterError = puterResult.error;
      if (puterResult.ideas.length > 0) {
        ideas = puterResult.ideas;
        source = "puter";
      } else {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"}/api/agent/habit-suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goal: trimmedGoal,
            existing_habits: habits.map((habit) => habit.name),
            count: 4,
            local_only: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`Habit suggestions failed with ${response.status}`);
        }

        const payload = await response.json();
        ideas = parseSuggestionPayload(payload);
        source = payload?.source === "gemini" || payload?.source === "free-model" ? payload.source : "fallback";
        backendMessage = typeof payload?.message === "string" ? payload.message : null;
      }
    } catch (error) {
      ideas = localFallbackIdeas(trimmedGoal, habits);
      source = "fallback";
      const errorMessage = error instanceof Error ? error.message : "Unknown backend error.";
      backendMessage = `Could not reach backend model. ${puterError ? `Puter: ${puterError}. ` : ""}Backend: ${errorMessage}.`;
    }

    setCoachIdeas(ideas);

    const atRisk = habits.filter((habit) => habit.streak > 0 && habit.lastCompletedDate !== todayStr).length;
    const doneToday = habits.filter((habit) => habit.lastCompletedDate === todayStr).length;
    const sourceLabel = source === "puter" ? "Puter" : source === "gemini" ? "Gemini" : source === "free-model" ? "Free API" : "Local fallback";
    if (ideas.length === 0) {
      setCoachMessage("Add a goal like 'sleep better' or 'study consistently'.");
      setCoachLoading(false);
      return;
    }

    if (atRisk > 0) {
      setCoachMessage(`${atRisk} active streak${atRisk > 1 ? "s" : ""} need rescue today. Pick one easy win first. Source: ${sourceLabel}.`);
      setCoachLoading(false);
      return;
    }

    if (doneToday === 0 && habits.length > 0) {
      setCoachMessage(`No habits completed yet today. Start with the easiest suggestion to build momentum. Source: ${sourceLabel}.`);
      setCoachLoading(false);
      return;
    }

    setCoachMessage(
      source !== "fallback"
        ? `Good momentum. Suggestions are AI-generated for your goal; start with the easiest one and repeat for 7 days. Source: ${sourceLabel}.`
        : (backendMessage ? `${backendMessage} Source: ${sourceLabel}.` : `Good momentum. Start with the easiest habit and repeat daily for 7 days. Source: ${sourceLabel}.`)
    );
    setCoachLoading(false);
  };

  const completedToday = habits.filter((habit) => habit.lastCompletedDate === todayStr).length;
  const atRiskCount = habits.filter((habit) => habit.streak > 0 && habit.lastCompletedDate !== todayStr).length;
  const avgStreak = habits.length
    ? Math.round(habits.reduce((sum, habit) => sum + habit.streak, 0) / habits.length)
    : 0;

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
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-md border border-(--glass-border) bg-black/6 dark:bg-white/6 px-2 py-1">
              <p className="text-[10px] text-(--foreground-muted)">Done Today</p>
              <p className="text-xs font-semibold text-foreground">{completedToday}/{habits.length}</p>
            </div>
            <div className="rounded-md border border-(--glass-border) bg-black/6 dark:bg-white/6 px-2 py-1">
              <p className="text-[10px] text-(--foreground-muted)">Streaks at Risk</p>
              <p className="text-xs font-semibold text-foreground">{atRiskCount}</p>
            </div>
            <div className="rounded-md border border-(--glass-border) bg-black/6 dark:bg-white/6 px-2 py-1">
              <p className="text-[10px] text-(--foreground-muted)">Avg Streak</p>
              <p className="text-xs font-semibold text-foreground">{avgStreak}d</p>
            </div>
          </div>

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
              disabled={coachLoading}
              className="rounded-lg bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {coachLoading ? "Thinking..." : "Suggest"}
            </button>
          </div>

          <p className="mt-2 text-[11px] text-(--foreground-muted)">{coachMessage}</p>

          {coachIdeas.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {coachIdeas.map((idea) => (
                <div key={idea.text} className="rounded-lg border border-(--glass-border) bg-black/6 dark:bg-white/6 px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-foreground truncate">{idea.text}</p>
                    <p className="text-[10px] text-(--foreground-muted) truncate">{idea.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addHabit(idea.text)}
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
