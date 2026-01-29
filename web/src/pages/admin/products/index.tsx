import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { socket } from "../../../lib/socket";
import ProductCard from "./ProductCard";

export type Product = {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  promoPrice?: number | null;
  promoDays?: string | null;
  image?: string | null;
  category?: string | null;
  available: boolean;
  optionGroups?: any[];
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProducts() {
    try {
      setLoading(true);
      const data = await apiFetch<Product[]>("/products");
      setProducts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar produtos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();

    socket.on("products:updated", loadProducts);

    return () => {
      socket.off("products:updated", loadProducts);
    };
  }, []);

  if (loading) return <p>Carregando produtos...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <h1>Produtos</h1>
        <button>+ Novo Produto</button>
      </header>

      {products.length === 0 && <p>Nenhum produto cadastrado.</p>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onEdit={() => console.log("editar", product.id)}
          />
        ))}
      </div>
    </div>
  );
}
