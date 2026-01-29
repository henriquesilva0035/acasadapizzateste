import { apiFetch } from "../../../lib/api";
import { Product } from "./index";

type Props = {
  product: Product;
  onEdit: () => void;
};

export default function ProductCard({ product, onEdit }: Props) {
  async function toggleAvailability() {
    await apiFetch(`/products/${product.id}/availability`, {
      method: "PATCH",
      body: JSON.stringify({ available: !product.available }),
    });
  }

  async function deleteProduct() {
    if (!confirm(`Excluir o produto "${product.name}"?`)) return;
    await apiFetch(`/products/${product.id}`, { method: "DELETE" });
  }

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 16,
        background: product.available ? "#fff" : "#f8f8f8",
        opacity: product.available ? 1 : 0.6,
      }}
    >
      <div style={{ fontSize: 48, textAlign: "center" }}>
        {product.image || "🍔"}
      </div>

      <h3>{product.name}</h3>

      <p style={{ margin: "4px 0" }}>
        R$ {Number(product.price).toFixed(2)}
      </p>

      {product.category && (
        <small style={{ opacity: 0.7 }}>{product.category}</small>
      )}

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={product.available}
            onChange={toggleAvailability}
          />
          {product.available ? "Disponível" : "Indisponível"}
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={onEdit}>Editar</button>
        <button onClick={deleteProduct} style={{ color: "red" }}>
          Excluir
        </button>
      </div>
    </div>
  );
}
