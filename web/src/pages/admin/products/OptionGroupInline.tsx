import OptionItemInline from "./OptionItemRow"
import { apiFetch } from "../../../lib/api"

export default function OptionGroupInline({ group, onChange }: any) {
  async function toggleGroup() {
    await apiFetch(`/option-groups/${group.id}/availability`, {
      method: "PATCH",
      body: JSON.stringify({ available: !group.available }),
    })
    onChange()
  }

  async function deleteGroup() {
    if (!confirm("Excluir grupo?")) return
    await apiFetch(`/option-groups/${group.id}`, { method: "DELETE" })
    onChange()
  }

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 14,
        marginTop: 16,
        background: "#fff",
        opacity: group.available ? 1 : 0.5,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>
          {group.title} (min {group.min} / max {group.max})
        </strong>

        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={toggleGroup}>
            {group.available ? "Desativar" : "Ativar"}
          </button>
          <button onClick={deleteGroup}>🗑️</button>
        </div>
      </div>

      <small style={{ opacity: 0.7 }}>
        Cobrança: {group.chargeMode}
      </small>

      <div style={{ marginTop: 12 }}>
        {group.items?.map((item: any) => (
          <OptionItemInline
            key={item.id}
            item={item}
            onChange={onChange}
          />
        ))}

        <button
          style={{ marginTop: 10 }}
          onClick={() => alert("Criar opção")}
        >
          ➕ Nova Opção
        </button>
      </div>
    </div>
  )
}
