import React, { useState } from "react";
import { apiFetch } from "../../../lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export default function CategoryModal({ open, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function save() {
    const v = name.trim();
    if (!v) {
      setErr("Digite o nome da categoria");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      await apiFetch("/categories", {
        method: "POST",
        body: JSON.stringify({ name: v }),
      });

      setName("");
      onSaved?.();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar categoria");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "white",
          borderRadius: 14,
          padding: 16,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, marginBottom: 10 }}>➕ Nova Categoria</h2>

        <label style={{ fontWeight: 800, fontSize: 12 }}>Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: PIZZAS"
          style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
        />

        {err && <p style={{ color: "crimson", marginTop: 8 }}>{err}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={onClose} disabled={saving}>Cancelar</button>
          <button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
