import { send } from "./api";

const KEY = "voleiflow_offline_queue";
const read = () => JSON.parse(localStorage.getItem(KEY) || "[]");
const write = (items) => {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("voleiflow:queue", { detail: items.length }));
};

export function queueOperation(type, payload) {
  const operation = { id: crypto.randomUUID(), type, payload, attempts: 0, queued_at: new Date().toISOString() };
  write([...read(), operation]);
  return operation;
}

export function queueSize() { return read().length; }

export async function flushQueue() {
  if (!navigator.onLine || !read().length) return;
  const pending = read();
  try {
    const result = await send("/offline/sync", "POST", { operations: pending });
    const completed = new Set(result.operations.filter((item) => item.status === "synced").map((item) => item.id));
    write(pending.filter((item) => !completed.has(item.id)).map((item) => ({ ...item, attempts: item.attempts + 1 })));
    const conflicts = result.operations.filter((item) => item.status === "conflict");
    if (conflicts.length) window.dispatchEvent(new CustomEvent("voleiflow:conflict", { detail: conflicts }));
  } catch {
    write(pending.map((item) => ({ ...item, attempts: item.attempts + 1 })));
  }
}
