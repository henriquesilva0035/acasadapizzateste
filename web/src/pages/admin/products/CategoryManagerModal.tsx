import React, { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Category = { id: number; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

export default function CategoryManagerModal({ open, onClose, onChanged }: Props) {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<Category[]>("/categories");
      setCats(Array.isArray(data) ? data : []);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar categorias");
      setCats([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
  }, [open]);

  async function removeCat(cat: Category) {
    if (!confirm(`Apagar categoria "${cat.name}"?`)) return;

    try {
      await apiFetch(`/categories/${cat.id}`, { method: "DELETE" });
      setCats((prev) => prev.filter((c) => c.id !== cat.id));
      onChanged?.();
    } catch (e: any) {
      alert(e?.message || "Não foi possível apagar (talvez esteja em uso)");
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "white",
          borderRadius: 16,
          padding: 16,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0 }}>📂 Gerenciar Categorias</h3>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}>
            ✕
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {loading ? (
            <p>Carregando...</p>
          ) : cats.length === 0 ? (
            <p style={{ opacity: 0.75 }}>Nenhuma categoria cadastrada.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {cats.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                  }}
                >
                  <strong>{c.name}</strong>

                  <button
                    onClick={() => removeCat(c)}
                    style={{
                      border: "1px solid #d63031",
                      background: "white",
                      color: "#d63031",
                      borderRadius: 10,
                      padding: "8px 10px",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    🗑 Apagar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={load} style={{ borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
            Recarregar
          </button>
        </div>
      </div>
    </div>
  );
}
