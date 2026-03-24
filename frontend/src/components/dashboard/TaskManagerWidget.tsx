"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

interface Task {
  id: string;
  text: string;
  completed: boolean;
  subTasks: SubTask[];
}

export function TaskManagerWidget() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: "1", text: "Implement AI-driven UI", completed: false, subTasks: [] },
    { id: "2", text: "Design the new logo", completed: true, subTasks: [] },
    { id: "3", text: "Deploy to Vercel", completed: false, subTasks: [] },
  ]);

  const handleBreakDown = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const response = await fetch("/api/ai/breakdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
    });

    if (response.ok) {
      const { subTasks } = await response.json();
      setTasks(
        tasks.map((t) =>
          t.id === taskId ? { ...t, subTasks: [...t.subTasks, ...subTasks] } : t
        )
      );
    }
  };

  return (
    <section className="widget flex-1 min-h-[350px] p-6 flex flex-col relative overflow-hidden group">
      <h3 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[var(--accent-electric-blue)] shadow-[0_0_10px_var(--accent-electric-blue)]"></span>
        Smart Task Manager
      </h3>
      <div className="flex-1 space-y-2">
        {tasks.map((task) => (
          <motion.div key={task.id} layout>
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5">
              <span
                className={`${task.completed ? "line-through text-gray-500" : ""}`}
              >
                {task.text}
              </span>
              <button
                onClick={() => handleBreakDown(task.id)}
                className="text-xs p-1 rounded hover:bg-white/10"
              >
                ✨ AI Break Down
              </button>
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
