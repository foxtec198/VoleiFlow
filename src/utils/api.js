const API_URL = import.meta.env.VITE_API_URL || "http://localhost:7000/api";
const firstPathSegment = window.location.pathname.split("/").filter(Boolean)[0];
export const PLACE_SLUG = firstPathSegment && firstPathSegment !== "confirmar" ? firstPathSegment.toLowerCase() : null;

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(PLACE_SLUG ? { "X-Place-Slug": PLACE_SLUG } : {}),
        ...(localStorage.getItem("voleiflow_access_token") ? { "Access-Token": localStorage.getItem("voleiflow_access_token") } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Não foi possível conectar à API. Tente novamente em alguns segundos.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.includes("/auth/login")) window.dispatchEvent(new Event("voleiflow:unauthorized"));
    throw new Error(data.error || "Não foi possível concluir a operação.");
  }
  return data;
}

export const send = (path, method, data) => api(path, { method, body: JSON.stringify(data) });
