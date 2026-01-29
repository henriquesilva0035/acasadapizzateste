import { apiFetch } from "../../../lib/api"

export default function OptionItemInline({ item, onChange }: any) {
  async function toggle() {
    await apiFetch(`/option-items/${item.id}/availability`, {
      method: "PATCH",
      body: JSON.stringify({ available: !item.available }),
    })
    onChange()
  }

  async function remove() {
    if (!confirm("Excluir opção?")) return
    await apiFetch(`/option-items/${item.id}`, { method: "DELETE" })
    onChange()
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: 8,
        borderBottom: "1px dashed #ddd",
        opacity: item.available ? 1 : 0.5,
      }}
    >
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          style={{ width: 48, height: 48, borderRadius: 6 }}
        />
      )}

      <div style={{ flex: 1 }}>
        <strong>{item.name}</strong>
        <div style={{ fontSize: 13, color: "#555" }}>
          Ingredientes: {item.description || "—"}
        </div>
        <div>+ R$ {item.price.toFixed(2)}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <button onClick={toggle}>
          {item.available ? "Off" : "On"}
        </button>
        <button onClick={remove}>🗑️</button>
      </div>
    </div>
  )
}
