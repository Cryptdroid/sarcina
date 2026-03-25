"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TASKS_UPDATED_EVENT,
  type SubTask,
  type Task,
  createTask,
  appendTask,
  getInitialTasks,
  removeTask,
  syncTasks,
  updateTask,
} from "@/lib/tasks";

type UrgencyLevel = "overdue" | "today" | "soon" | "later" | "none";

function toLocalIso(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getUrgency(task: Task): UrgencyLevel {
  if (!task.dueDate) {
    return "none";
  }

  const due = new Date(`${task.dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) {
    return "none";
  }

  const today = new Date(`${toLocalIso(new Date())}T00:00:00`);
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 0) {
    return "overdue";
  }
  if (diffDays === 0) {
    return "today";
  }
  if (diffDays <= 3) {
    return "soon";
  }
  return "later";
}

function urgencyLabel(urgency: UrgencyLevel): string {
  switch (urgency) {
    case "overdue":
      return "Overdue";
    case "today":
      return "Today";
    case "soon":
      return "Soon";
    case "later":
      return "Later";
    default:
      return "No date";
  }
}

function urgencyClass(urgency: UrgencyLevel): string {
  switch (urgency) {
    case "overdue":
      return "text-rose-300 bg-rose-500/10 border-rose-400/30";
    case "today":
      return "text-amber-200 bg-amber-500/10 border-amber-300/30";
    case "soon":
      return "text-electric-blue bg-electric-blue/10 border-electric-blue/30";
    case "later":
      return "text-emerald-300 bg-emerald-500/10 border-emerald-400/30";
    default:
      return "text-(--foreground-muted) bg-white/5 border-white/10";
  }
}

export function TaskManagerWidget() {
  const [tasks, setTasks] = useState<Task[]>(getInitialTasks);
  const [newTask, setNewTask] = useState("");
  const [breakdownLoadingById, setBreakdownLoadingById] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const completedCount = tasks.filter((task) => task.completed).length;
  const completionPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const nextDueTask = tasks
    .filter((task) => Boolean(task.dueDate) && !task.completed)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];

  useEffect(() => {
    const load = async () => {
      try {
        const latest = await syncTasks();
        setTasks(latest);
      } catch {
        setErrorMessage("Could not load tasks from backend.");
      }
    };

    load();
  }, []);

  useEffect(() => {
    const handleTasksUpdated = () => {
      setTasks([...getInitialTasks()]);
    };

    window.addEventListener(TASKS_UPDATED_EVENT, handleTasksUpdated);
    return () => {
      window.removeEventListener(TASKS_UPDATED_EVENT, handleTasksUpdated);
    };
  }, []);

  const handleBreakDown = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || breakdownLoadingById[taskId]) return;

    setErrorMessage(null);
    setBreakdownLoadingById((prev) => ({ ...prev, [taskId]: true }));

    try {
      const response = await fetch("/api/ai/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });

      if (!response.ok) {
        throw new Error("AI breakdown request failed");
      }

      const { subTasks } = (await response.json()) as { subTasks?: SubTask[] };
      const normalizedSubTasks = Array.isArray(subTasks) ? subTasks : [];

      const target = tasks.find((t) => t.id === taskId);
      if (!target) {
        return;
      }

      const merged = [...target.subTasks];
      for (const subTask of normalizedSubTasks) {
        const alreadyExists = merged.some(
          (existing) => existing.id === subTask.id || existing.text === subTask.text
        );
        if (!alreadyExists) {
          merged.push(subTask);
        }
      }

      const optimistic = tasks.map((t) => (t.id === taskId ? { ...t, subTasks: merged } : t));
      setTasks(optimistic);
      await updateTask(taskId, { subTasks: merged });
    } catch {
      setErrorMessage("Could not break down this task right now. Please try again.");
    } finally {
      setBreakdownLoadingById((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const addTask = async () => {
    const trimmed = newTask.trim();
    if (!trimmed) {
      return;
    }

    const optimistic = createTask(trimmed);
    setTasks((prev) => [...prev, optimistic]);
    setNewTask("");

    try {
      const created = await appendTask(trimmed);
      setTasks((prev) => prev.map((t) => (t.id === optimistic.id ? created : t)));
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== optimistic.id));
      setErrorMessage("Could not create task right now.");
    }
  };

  const toggleTask = async (taskId: string) => {
    const snapshot = tasks;
    const optimistic = tasks.map((task) =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );
    setTasks(optimistic);

    try {
      const target = optimistic.find((task) => task.id === taskId);
      if (target) {
        await updateTask(taskId, { completed: target.completed });
      }
    } catch {
      setTasks(snapshot);
      setErrorMessage("Could not update task status right now.");
    }
  };

  const deleteTask = async (taskId: string) => {
    const snapshot = tasks;
    setTasks((prev) => prev.filter((task) => task.id !== taskId));

    try {
      await removeTask(taskId);
    } catch {
      setTasks(snapshot);
      setErrorMessage("Could not delete task right now.");
    }
  };

  return (
    <section className="widget flex-1 min-h-87.5 p-6 flex flex-col relative overflow-hidden group">
      <h3 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-electric-blue shadow-[0_0_10px_var(--accent-electric-blue)]"></span>
        Smart Task Manager
      </h3>
      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTask();
            }
          }}
          className="flex-1 rounded-lg border border-(--glass-border) bg-white/70 dark:bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-(--foreground-muted) focus:outline-none focus:border-foreground"
          placeholder="Add a task"
        />
        <button
          type="button"
          onClick={addTask}
          className="rounded-lg bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-xs font-semibold hover:opacity-90"
        >
          Add
        </button>
      </div>
      {errorMessage ? (
        <p className="mb-2 text-xs text-rose-300">{errorMessage}</p>
      ) : null}
      <div className="mb-3 rounded-xl border border-(--glass-border) bg-black/6 dark:bg-white/6 p-3">
        <div className="flex items-center justify-between text-[11px] text-(--foreground-muted)">
          <span>Mission Pulse</span>
          <span>{completedCount}/{tasks.length} complete</span>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-black/20 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-electric-blue to-(--accent-vibrant-green) transition-all duration-500"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-(--foreground-muted)">Focus score: {completionPercent}%</span>
          <span className="text-foreground/80">
            {nextDueTask?.dueDate ? `Next due ${nextDueTask.dueDate}` : "No upcoming due date"}
          </span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {tasks.map((task) => (
          <motion.div key={task.id} layout>
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
              <button
                type="button"
                onClick={() => toggleTask(task.id)}
                className="flex items-center gap-2 text-left"
              >
                <span className={`h-4 w-4 rounded border border-(--glass-border) ${task.completed ? "bg-black border-black dark:bg-white dark:border-white" : "bg-transparent"}`} />
                <span className={`${task.completed ? "line-through text-(--foreground-muted)" : "text-foreground"}`}>
                  {task.text}
                </span>
              </button>
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${urgencyClass(getUrgency(task))}`}>
                {urgencyLabel(getUrgency(task))}
              </span>
              {task.dueDate ? (
                <span className="text-[11px] text-(--foreground-muted) mr-2">
                  {task.dueDate}
                </span>
              ) : null}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleBreakDown(task.id)}
                  disabled={breakdownLoadingById[task.id]}
                  className="text-xs p-1 rounded text-foreground hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {breakdownLoadingById[task.id] ? "Analyzing..." : "✨ AI Break Down"}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteTask(task.id)}
                  className="text-xs p-1 rounded text-rose-300 hover:bg-rose-500/10"
                >
                  Delete
                </button>
              </div>
            </div>
            <AnimatePresence>
              {task.subTasks.length > 0 && (
                <motion.div
                  className="ml-8 space-y-1 mt-1"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {task.subTasks.map((sub) => (
                    <div key={sub.id} className="flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={sub.completed}
                        readOnly
                        className="mr-2"
                      />
                      <span>{sub.text}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
