import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_URL } from "./config";

import { CartProvider, useCart } from "./contexts/CartContext";
import ProductBuyModal from "./ProductBuyModal";
import { usePromotionsToday, csvToIds } from "./hooks/usePromotionsToday";
import { buildPromoText, isRewardPromoActiveForProduct, isTriggerProductInCart } from "./utils/promoText";

type Product = {
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

type Category = { id: number; name: string };

function money(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isFoto(txt: any) {
  const s = String(txt || "");
  return s.startsWith("data:image") || s.startsWith("http");
}

function PedidoMesaInner({ tableId }: { tableId: string }) {
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("TODOS");

  // Modal de compra (igual online)
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyProductId, setBuyProductId] = useState<number | null>(null);

  // Resumo (carrinho da mesa)
  const [resumeOpen, setResumeOpen] = useState(false);

  // Checkbox Viagem
  const [isTakeout, setIsTakeout] = useState(false);

  const { items, total, removeItem, clear } = useCart();

  // Promoções do dia (mesma fonte do online)
  const { promos } = usePromotionsToday();

  const itemsCount = items.reduce((acc, it) => acc + (it.qty || 1), 0);

  async function fetchProducts() {
    const r = await fetch(`${API_URL}/products`);
    const data = await r.json();
    setProducts((Array.isArray(data) ? data : []).filter((p: any) => p?.available));
  }

  async function fetchCategories() {
    try {
      const r = await fetch(`${API_URL}/categories`);
      const data = await r.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]);
    }
  }

  // ✅ polling (igual você já fazia), pra refletir produto desativado sem sair da tela
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        await Promise.all([fetchProducts(), fetchCategories()]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load().catch(() => {});
    const t = setInterval(() => {
      fetchProducts().catch(() => {});
      fetchCategories().catch(() => {});
    }, 8000);

    return () => {
      mounted = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // Se entrar numa mesa nova, garante carrinho "limpo" dessa mesa só (o storageKey já separa, mas evita estado antigo em memória)
  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const categoriasDinamicasFallback = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category).filter(Boolean)))
      .map((c) => String(c))
      .sort((a, b) => a.localeCompare(b));
  }, [products]);

  const categorias = useMemo(() => {
    const apiCats = (categories || [])
      .map((c) => c?.name)
      .filter(Boolean)
      .map((c) => String(c));

    const list = apiCats.length > 0 ? apiCats : categoriasDinamicasFallback;
    return ["TODOS", ...Array.from(new Set(list))];
  }, [categories, categoriasDinamicasFallback]);

  const filtered = useMemo(() => {
    if (selectedCategory === "TODOS") return products;
    return products.filter((p) => String(p.category || "") === selectedCategory);
  }, [products, selectedCategory]);

  const productNameById = (id: number) => {
    const p = products.find((x) => x.id === id);
    return p?.name || `#${id}`;
  };

  function openBuyModal(productId: number) {
    setBuyProductId(productId);
    setBuyOpen(true);
  }

  function getPromoBadgeForProduct(product: Product) {
    if (!promos || promos.length === 0) return null;

    // 1) se for recompensa e o gatilho está no carrinho
    const rewardPromo = promos.find((p) =>
      isRewardPromoActiveForProduct({
        promo: p,
        productId: product.id,
        cartItems: items,
      })
    );
    if (rewardPromo) {
      return buildPromoText(rewardPromo as any, productNameById, product.category || undefined);
    }

    // 2) se o próprio produto é gatilho e já está no carrinho (reforça a promo ativa)
    const triggerPromo = promos.find((p) =>
      isTriggerProductInCart({
        promo: p,
        productId: product.id,
        cartItems: items,
      })
    );
    if (triggerPromo) {
      return buildPromoText(triggerPromo as any, productNameById, product.category || undefined);
    }

    // 3) caso não esteja ativa ainda, mostra uma dica "tem promo" quando o produto participa
    const participates = promos.find((p) => {
      const trigIds = csvToIds((p as any).triggerProductIds);
      const rewIds = csvToIds((p as any).rewardProductIds);
      if (trigIds.includes(product.id)) return true;
      if (rewIds.includes(product.id)) return true;
      if ((p as any).triggerCategory && (p as any).triggerCategory === product.category) return true;
      if ((p as any).rewardCategory && (p as any).rewardCategory === product.category) return true;
      return false;
    });

    if (participates) {
      return `🎁 Tem promoção hoje`;
    }

    return null;
  }

  async function enviarPedido() {
    if (items.length === 0) return;

    const waiterName = localStorage.getItem(`atendente_mesa_${tableId}_nome`);

    const payloadItems = items.map((it) => ({
      productId: Number(it.productId),
      name: it.name,
      quantity: Number(it.qty || 1),
      optionItemIds: Array.isArray(it.optionIds) ? it.optionIds : [],
      observation: it.notes || "",
    }));

    const res = await fetch(`${API_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: Number(tableId),
        waiterName: waiterName || "Garçom",
        origin: "LOCAL",
        items: payloadItems,
        isTakeout,
      }),
    });

    if (res.ok) {
      alert("Pedido Enviado com Sucesso! 🚀");
      clear();
      navigate("/mesas");
    } else {
      const erro = await res.json().catch(() => ({}));
      alert("Erro: " + (erro.error || "Falha ao enviar"));
    }
  }

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: items.length > 0 ? 120 : 20, background: "#f6f7fb" }}>
      {/* Top */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, padding: 14, background: "white", borderBottom: "1px solid #eee" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <button
            onClick={() => navigate("/mesas")}
            style={{ border: "1px solid #ddd", background: "white", borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}
          >
            ← Mesas
          </button>
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            Mesa #{tableId}
          </div>
          <button
            onClick={() => setResumeOpen(true)}
            disabled={items.length === 0}
            style={{
              border: "none",
              background: items.length === 0 ? "#ddd" : "#ff6b6b",
              color: "white",
              borderRadius: 10,
              padding: "10px 12px",
              cursor: items.length === 0 ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            🧾 {itemsCount}
          </button>
        </div>

        {/* Categorias (pills estilo online) */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingTop: 12 }}>
          {categorias.map((c) => {
            const active = c === selectedCategory;
            return (
              <button
                key={c}
                onClick={() => setSelectedCategory(c)}
                style={{
                  whiteSpace: "nowrap",
                  border: active ? "1px solid #b30000" : "1px solid #eaeaea",
                  background: active ? "#b30000" : "white",
                  color: active ? "white" : "#2d3436",
                  borderRadius: 999,
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: 14 }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "#636e72" }}>Carregando produtos...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#636e72" }}>Nenhum produto nessa categoria.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {filtered.map((p) => {
              const badge = getPromoBadgeForProduct(p);

              return (
                <button
                  key={p.id}
                  onClick={() => openBuyModal(p.id)}
                  style={{
                    textAlign: "left",
                    border: "1px solid #eee",
                    background: "white",
                    borderRadius: 16,
                    padding: 12,
                    cursor: "pointer",
                    display: "flex",
                    gap: 12,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 14,
                      background: "#f1f2f6",
                      overflow: "hidden",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {p.image && isFoto(p.image) ? (
                      <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ fontSize: 28 }}>🍽️</div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.2 }}>{p.name}</div>
                      <div style={{ fontWeight: 900, color: "#2d3436" }}>{money(p.price)}</div>
                    </div>

                    {p.description ? (
                      <div style={{ marginTop: 6, color: "#636e72", fontSize: 12, lineHeight: 1.25 }}>
                        {p.description}
                      </div>
                    ) : null}

                    {badge ? (
                      <div
                        style={{
                          marginTop: 10,
                          display: "inline-block",
                          background: "#fff3cd",
                          border: "1px solid #ffeeba",
                          color: "#8a6d3b",
                          padding: "6px 8px",
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {badge}
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal compra - mesmo do online */}
      <ProductBuyModal
        open={buyOpen}
        productId={buyProductId}
        onClose={() => setBuyOpen(false)}
        onAdded={() => {}}
      />

      {/* Resumo */}
      {resumeOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => setResumeOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 720,
              background: "white",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              padding: 14,
              maxHeight: "82dvh",
              overflow: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>🧾 Resumo da Mesa</div>
              <button
                onClick={() => setResumeOpen(false)}
                style={{ border: "1px solid #eee", background: "white", borderRadius: 12, padding: "10px 12px", cursor: "pointer" }}
              >
                Fechar
              </button>
            </div>

            {/* takeout */}
            <div style={{ marginTop: 12, background: "#fff5f5", border: "1px solid #fab1a0", padding: 10, borderRadius: 14, display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={isTakeout}
                onChange={(e) => setIsTakeout(e.target.checked)}
                style={{ width: 22, height: 22, cursor: "pointer" }}
              />
              <div style={{ fontWeight: 900, color: "#d63031" }}>🛍️ Pedido para viagem?</div>
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((it, idx) => (
                <div key={`${it.productId}-${it.optionSummary}-${idx}`} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{it.qty}x {it.name}</div>
                      {it.optionSummary ? (
                        <div style={{ color: "#636e72", fontSize: 12, marginTop: 4 }}>
                          {it.optionSummary}
                        </div>
                      ) : null}
                      {it.notes ? (
                        <div style={{ color: "#636e72", fontSize: 12, marginTop: 4 }}>
                          Obs: {it.notes}
                        </div>
                      ) : null}
                      <div style={{ marginTop: 6, fontWeight: 900 }}>
                        {money(Number(it.unitPrice || 0) * Number(it.qty || 1))}
                      </div>
                    </div>

                    <button
                      onClick={() => removeItem(Number(it.productId), it.optionSummary)}
                      style={{ background: "#d63031", color: "white", border: "none", borderRadius: 12, padding: "10px 12px", cursor: "pointer", fontWeight: 900 }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 12, borderRadius: 14, background: "#f6f7fb", border: "1px solid #eee" }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>Total</div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{money(total)}</div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  if (confirm("Limpar itens desta mesa?")) clear();
                }}
                style={{ flex: 1, padding: 14, borderRadius: 14, border: "1px solid #eee", background: "white", cursor: "pointer", fontWeight: 900 }}
              >
                Limpar
              </button>

              <button
                onClick={enviarPedido}
                style={{ flex: 2, padding: 14, borderRadius: 14, border: "none", background: "#0984e3", color: "white", cursor: "pointer", fontWeight: 900 }}
              >
                ✅ Enviar para Cozinha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer fixo */}
      {items.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "white",
            padding: 12,
            borderTop: "1px solid #eee",
            boxShadow: "0 -4px 16px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 10 }}>
            <button
              onClick={() => setResumeOpen(true)}
              style={{ flex: 1, padding: 14, background: "#e17055", color: "white", border: "none", borderRadius: 14, fontWeight: 900, cursor: "pointer" }}
            >
              📝 Conferir ({itemsCount})
            </button>
            <button
              onClick={enviarPedido}
              style={{ flex: 1.2, padding: 14, background: "#0984e3", color: "white", border: "none", borderRadius: 14, fontWeight: 900, cursor: "pointer" }}
            >
              ✅ Enviar ({money(total)})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PedidoMesa() {
  const { tableId } = useParams();
  if (!tableId) return null;

  // ✅ Carrinho separado por mesa (não mistura com o online nem com outra mesa)
  return (
    <CartProvider storageKey={`cart_mesa_${tableId}`}>
      <PedidoMesaInner tableId={tableId} />
    </CartProvider>
  );
}
