export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  subTasks: SubTask[];
  dueDate?: string;
  dueTime?: string;
}

export const TASKS_UPDATED_EVENT = "SARCINA:tasks-updated";

import { taskApi, type ApiTask } from "@/lib/backendApi";

let taskCache: Task[] = [];

function notifyTaskListeners(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(TASKS_UPDATED_EVENT));
}

function toTask(apiTask: ApiTask): Task {
  return {
    id: apiTask.id,
    text: apiTask.text,
    completed: apiTask.completed,
    subTasks: Array.isArray(apiTask.subTasks) ? apiTask.subTasks : [],
    dueDate: apiTask.dueDate ?? undefined,
    dueTime: apiTask.dueTime ?? undefined,
  };
}

export function getInitialTasks(): Task[] {
  return taskCache;
}

export async function syncTasks(): Promise<Task[]> {
  const tasks = await taskApi.list();
  taskCache = tasks.map(toTask);
  notifyTaskListeners();
  return taskCache;
}

export function createTask(text: string, dueDate?: string, dueTime?: string): Task {
  return {
    id: crypto.randomUUID(),
    text,
    completed: false,
    subTasks: [],
    dueDate,
    dueTime,
  };
}

export async function appendTask(text: string, dueDate?: string, dueTime?: string): Promise<Task> {
  const created = await taskApi.create({ text, dueDate, dueTime });
  const normalized = toTask(created);
  taskCache = [...taskCache, normalized];
  notifyTaskListeners();
  return normalized;
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<Task> {
  const updated = await taskApi.patch(id, patch);
  const normalized = toTask(updated);
  taskCache = taskCache.map((task) => (task.id === id ? normalized : task));
  notifyTaskListeners();
  return normalized;
}

export async function removeTask(id: string): Promise<void> {
  await taskApi.remove(id);

  try {
    const latest = await taskApi.list();
    taskCache = latest.map(toTask);
  } catch {
    // Keep local UI responsive even if refresh fails; remove from cache optimistically.
    taskCache = taskCache.filter((task) => task.id !== id);
  }

  notifyTaskListeners();
}
