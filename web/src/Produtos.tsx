import { useEffect, useMemo, useState } from "react";
import { apiFetch, API_URL, getSocket } from "./lib/api";

type Product = {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  promoPrice?: number | null;
  promoDays?: string | null;
  image?: string | null;
  category?: string | null;
  available?: boolean;
  optionGroups?: any[];
};

type Props = {
  products?: Product[];
  onEdit?: (p: Product) => void;
};

export default function Produtos({ products, onEdit }: Props) {
  const [localProducts, setLocalProducts] = useState<Product[]>(Array.isArray(products) ? products : []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const json = await apiFetch<Product[]>("/products");
      setLocalProducts(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar produtos");
      setLocalProducts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (Array.isArray(products)) setLocalProducts(products);
  }, [products]);

  useEffect(() => {
    if (Array.isArray(products)) return;

    load();

    const socket = getSocket();
    const onUpdate = () => load();
    socket.on("products:updated", onUpdate);
    return () => {
      socket.off("products:updated", onUpdate);
    };
  }, [products]);

  async function toggleAvailability(p: Product) {
    // 1. Descobre se o produto está visível agora (trata undefined como true)
    const isVisible = p.available !== false; 
    
    // 2. Define o novo estado (o inverso do atual)
    const newStatus = !isVisible;

    // 3. Atualização Otimista (na tela)
    setLocalProducts((prev) => 
      prev.map((x) => (x.id === p.id ? { ...x, available: newStatus } : x))
    );

    try {
      // 4. Envio para API
      await apiFetch(`/products/${p.id}/availability`, {
        method: "PATCH",
        body: JSON.stringify({ available: newStatus }), // Manda o novo valor
      });
      // o socket vai disparar e atualizar a lista
    } catch (e: any) {
      alert(e?.message || "Falha ao atualizar disponibilidade");
      // rollback (volta ao estado original se der erro)
      setLocalProducts((prev) => 
        prev.map((x) => (x.id === p.id ? { ...x, available: isVisible } : x))
      );
    }
  }

  if (loading) return <p>Carregando...</p>;
  if (err) return <p style={{ color: "crimson" }}>{err}</p>;
  if (!localProducts.length) return <p>Nenhum produto para mostrar.</p>;

  return (
    <div>
      <h1>Produtos</h1>
      <small style={{ opacity: 0.7 }}>API: {API_URL}</small>

      <ul>
        {localProducts.map((p) => (
          <li key={p.id} style={{ marginBottom: 10 }}>
            <div>
              <b style={{ opacity: p.available === false ? 0.5 : 1 }}>{p.name}</b> — R$ {Number(p.price || 0).toFixed(2)}{" "}
              {p.category ? `(${p.category})` : ""}
            </div>

            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={p.available !== false} onChange={() => toggleAvailability(p)} />
              {p.available !== false ? "Disponível (clique p/ desligar)" : "Indisponível (clique p/ ligar)"}
            </label>

            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              {onEdit && <button onClick={() => onEdit(p)}>Editar</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
