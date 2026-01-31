import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";
import ProductModal from "./ProductModal";
import CategoryModal from "./CategoryModal";
import CategoryManagerModal from "./CategoryManagerModal";


type Product = {
  id: number;
  name: string;
  price: number;
  category: string;
  image?: string;
  available: boolean;
  optionGroups?: any[];
};

export default function AdminProductsPage() {
  // =========================
  // STATE
  // =========================
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [manageCatsOpen, setManageCatsOpen] = useState(false);
  const [catsVersion, setCatsVersion] = useState(0);



  // =========================
  // THEME (cores da logo)
  // =========================
  const THEME = {
    red: "#B80F0A", // vermelho forte
    red2: "#E17055", // vermelho/laranja (botões)
    yellow: "#F4B400", // amarelo da logo
    dark: "#111827",
    muted: "#6B7280",
    bg: "#F8FAFC",
    card: "#FFFFFF",
    border: "#E5E7EB",
    blue: "#0984e3",
    danger: "#d63031",
    green: "#2ecc71",
  };

  // =========================
  // FUNÇÕES
  // =========================
  async function loadProducts() {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<Product[]>("/products");
      setProducts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar produtos");
    } finally {
      setLoading(false);
    }
  }

  async function toggleAvailability(product: Product) {
    try {
      await apiFetch(`/products/${product.id}/availability`, {
        method: "PATCH",
        body: JSON.stringify({ available: !product.available }),
      });

      // update instantâneo
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, available: !p.available } : p))
      );
    } catch (e: any) {
      alert(e?.message || "Erro ao alterar disponibilidade");
    }
  }

  async function deleteProduct(id: number) {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    try {
      await apiFetch(`/products/${id}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      alert(e?.message || "Erro ao excluir produto");
    }
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  

  async function migrateCategories() {
  if (!confirm("Migrar categorias dos produtos? Isso vai padronizar tudo (UPPERCASE) e criar as categorias faltantes.")) return;

  try {
    const res = await apiFetch("/admin/migrate-categories", {
        method: "POST",
        body: JSON.stringify({}), // 👈 ESSA LINHA
      });
    alert(
      `✅ Migração concluída!\n` +
      `Categorias criadas: ${res.createdCategories}\n` +
      `Produtos atualizados: ${res.updatedProducts}\n` +
      `Total categorias finais: ${res.totalFinalCategories}`
    );

    // recarrega tudo e força refresh do select
    await loadProducts();
    setCatsVersion((v) => v + 1);
  } catch (e: any) {
    alert(e?.message || "Erro ao migrar categorias");
  }
}


 

async function openEdit(p: Product) {
  try {
    const full = await apiFetch(`/products/${p.id}`) // precisa existir no server GET /products/:id
    setEditing(full)
    setModalOpen(true)
  } catch (e: any) {
    alert(e?.message || "Erro ao carregar produto para editar")
  }
}





  // =========================
  // EFFECTS
  // =========================
  useEffect(() => {
    loadProducts();
  }, []);

  // =========================
  // AGRUPAR CATEGORIAS
  // =========================
  const productsByCategory = useMemo(() => {
    return products.reduce((acc: Record<string, Product[]>, product) => {
      const cat = product.category || "Outros";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(product);
      return acc;
    }, {});
  }, [products]);

  if (loading) return <p style={{ padding: 20 }}>Carregando produtos...</p>;
  if (error) return <p style={{ padding: 20, color: THEME.danger }}>{error}</p>;




  // ============================================================
  // ====================== JSX START ============================
  // ============================================================
  return (
    <div style={{ background: THEME.bg, minHeight: "100vh" }}>
      {/* HEADER */}
      <div
        style={{
          background: THEME.red,
          padding: "18px 20px",
          color: "white",
          boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.3 }}>A’Casa da Pizza • ADMIN</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>Produtos • Categorias • Disponibilidade</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  
                   <button
                    onClick={openCreate}
                    style={{
                      padding: "10px 14px",
                      background: THEME.yellow,
                      color: THEME.dark,
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 900,
                      boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
                    }}
                  >
                    ➕ Novo Produto
                  </button>
                  
                  
                  
                  
                  <button
                    onClick={() => setCategoryModalOpen(true)}
                    style={{
                      padding: "10px 14px",
                      background: THEME.blue,
                      color: "white",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 900,
                      boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
                    }}
                  >
                    ➕ Nova Categoria
                  </button>



                  <button
                    onClick={() => setManageCatsOpen(true)}
                    style={{
                      padding: "10px 14px",
                      background: "white",
                      color: THEME.dark,
                      border: `1px solid ${THEME.border}`,
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 900,
                      boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
                    }}
                  >
                    📂 Gerenciar Categorias
                  </button>


                    


                </div>
            </div>
        
      </div>

      {/* MODAL */}
      <ProductModal
        open={modalOpen}
        mode={editing ? "edit" : "create"}
        product={editing}
        catsVersion={catsVersion}
        onClose={() => setModalOpen(false)}
        onSaved={() => loadProducts()}
      />
      <CategoryModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onSaved={() => setCatsVersion((v) => v + 1)}
      />
      <CategoryManagerModal
        open={manageCatsOpen}
        onClose={() => setManageCatsOpen(false)}
        onChanged={() => setCatsVersion((v) => v + 1)}
      />





      {/* CONTEÚDO */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
        {products.length === 0 && (
          <div
            style={{
              background: THEME.card,
              border: `1px solid ${THEME.border}`,
              borderRadius: 14,
              padding: 16,
            }}
          >
            <b>Nenhum produto cadastrado.</b>
          </div>
        )}

        {Object.entries(productsByCategory).map(([category, items]) => (
          <div key={category} style={{ marginBottom: 28 }}>
            {/* TÍTULO CATEGORIA */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, color: THEME.dark }}>📂 {category}</div>
              <div
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "white",
                  border: `1px solid ${THEME.border}`,
                  color: THEME.muted,
                }}
              >
                {items.length} itens
              </div>
              <div style={{ flex: 1, height: 1, background: THEME.border }} />
            </div>

            {/* GRID */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 14,
              }}
            >
              {items.map((product) => {
                const isOn = product.available;
                return (
                  <div
                    key={product.id}
                    style={{
                      background: THEME.card,
                      border: `1px solid ${THEME.border}`,
                      borderRadius: 14,
                      padding: 14,
                      boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
                      opacity: isOn ? 1 : 0.6,
                    }}
                  >
                    {/* topo card */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 900, color: THEME.dark, lineHeight: 1.1 }}>{product.name}</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: THEME.muted }}>
                          R$ {Number(product.price || 0).toFixed(2)}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          padding: "5px 10px",
                          borderRadius: 999,
                          background: isOn ? "rgba(46, 204, 113, 0.12)" : "rgba(214, 48, 49, 0.10)",
                          color: isOn ? THEME.green : THEME.danger,
                          border: `1px solid ${THEME.border}`,
                          whiteSpace: "nowrap",
                        }}
                        title={isOn ? "Produto disponível" : "Produto indisponível"}
                      >
                        {isOn ? "ATIVO" : "OFF"}
                      </div>
                    </div>

                    {/* ações */}
                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <button
                        onClick={() => toggleAvailability(product)}
                        style={{
                          flex: 1,
                          padding: "9px 10px",
                          border: "none",
                          borderRadius: 10,
                          cursor: "pointer",
                          background: isOn ? THEME.red2 : THEME.green,
                          color: "white",
                          fontWeight: 900,
                        }}
                      >
                        {isOn ? "Desativar" : "Ativar"}
                      </button>

                      <button
                        onClick={() => openEdit(product)}
                        style={{
                          width: 44,
                          borderRadius: 10,
                          border: `1px solid ${THEME.blue}`,
                          background: "white",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                        title="Editar"
                      >
                        ✏️
                      </button>

                      <button
                        onClick={() => deleteProduct(product.id)}
                        style={{
                          width: 44,
                          borderRadius: 10,
                          border: `1px solid ${THEME.danger}`,
                          background: "white",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                        title="Excluir"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  // ============================================================
  // ======================= JSX END =============================
  // ============================================================
}
