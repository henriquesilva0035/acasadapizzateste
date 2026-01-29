import { io, Socket } from "socket.io-client";

export const API_URL = String((import.meta as any)?.env?.VITE_API_URL || "http://localhost:3333").replace(/\/$/, "");

export async function apiFetch<T = any>(path: string, options: RequestInit = {}) {
  const url = `${API_URL}${path}`;

  const headers = new Headers(options.headers || {});
  const hasBody = options.body !== undefined && options.body !== null;

  // Só seta JSON se realmente houver body "json"
  if (hasBody && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const finalOptions: RequestInit = {
    ...options,
    headers,
  };

  // Se não tem body, remove (evita Fastify 400)
  if (!hasBody) {
    delete (finalOptions as any).body;
  }

  const res = await fetch(url, finalOptions);

  // tenta ler json, mas sem quebrar
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;

  if (!res.ok) {
    const msg = (data as any)?.error || (typeof data === "string" ? data : "Erro na requisição");
    throw new Error(msg);
  }

  return data as T;
}


// Socket global (usa o mesmo host/porta da API)
let socketSingleton: Socket | null = null;

export function getSocket(): Socket {
  if (socketSingleton) return socketSingleton;
  socketSingleton = io(API_URL, { transports: ["websocket", "polling"] });
  return socketSingleton;
}
