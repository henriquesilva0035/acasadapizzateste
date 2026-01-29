// ARQUIVO: src/pages/admin/AdminNeighborhoods.tsx
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type Neighborhood = {
  id: number;
  name: string;
  price: number;
  active: boolean;
};

export default function AdminNeighborhoods() {
  const [bairros, setBairros] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const THEME = {
    primary: "#B30000",
    bg: "#f8f9fa",
    card: "#fff",
    border: "#ddd"
  };

  async function load() {
    setLoading(true);
    try {
        const data = await apiFetch<Neighborhood[]>("/neighborhoods");
        setBairros(data);
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function addBairro() {
    if(!newName.trim()) return alert("Digite o nome");
    await apiFetch("/neighborhoods", {
        method: "POST",
        body: JSON.stringify({ name: newName, price: Number(newPrice.replace(',','.')) })
    });
    setNewName("");
    setNewPrice("");
    load();
  }

  async function deleteBairro(id: number) {
    if(!confirm("Excluir bairro?")) return;
    await apiFetch(`/neighborhoods/${id}`, { method: "DELETE" });
    load();
  }

  async function toggleActive(b: Neighborhood) {
    await apiFetch(`/neighborhoods/${b.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !b.active })
    });
    load();
  }

  return (
    <div style={{ padding: 20, background: THEME.bg, minHeight: "100vh" }}>
      <h1 style={{ color: "#2d3436" }}>🛵 Taxas de Entrega</h1>

      {/* CARD ADICIONAR */}
      <div style={{ background: "white", padding: 20, borderRadius: 10, boxShadow: "0 2px 5px rgba(0,0,0,0.05)", marginBottom: 20, display:'flex', gap: 10, flexWrap:'wrap' }}>
         <input 
           placeholder="Nome do Bairro (Ex: Centro)" 
           value={newName} onChange={e => setNewName(e.target.value)}
           style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8, flex: 2 }}
         />
         <input 
           placeholder="Taxa (Ex: 5.00)" 
           value={newPrice} onChange={e => setNewPrice(e.target.value)}
           type="number"
           style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8, flex: 1 }}
         />
         <button onClick={addBairro} style={{ padding: "10px 20px", background: "#00b894", color: "white", border: "none", borderRadius: 8, fontWeight: "bold", cursor:"pointer" }}>
            + Adicionar
         </button>
      </div>

      {/* LISTA */}
      <div style={{ display: "grid", gap: 10 }}>
        {bairros.map(b => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", padding: 15, borderRadius: 8, borderLeft: `5px solid ${b.active ? '#00b894' : '#ccc'}` }}>
                <div>
                    <strong style={{ fontSize: 16 }}>{b.name}</strong>
                    <div style={{ color: "#636e72" }}>Taxa: <b>R$ {b.price.toFixed(2)}</b></div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => toggleActive(b)} style={{ padding: "5px 10px", cursor: "pointer" }}>
                        {b.active ? "Desativar" : "Ativar"}
                    </button>
                    <button onClick={() => deleteBairro(b.id)} style={{ padding: "5px 10px", background: "#d63031", color:"white", border:"none", borderRadius: 5, cursor: "pointer" }}>
                        🗑️
                    </button>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
}