// ARQUIVO: src/Cardapio.tsx
// ---------------------------------------------------------
// RESPONSABILIDADE:
// 1. Vitrine de Produtos (Cardápio).
// 2. Carrinho de Compras.
// 3. Histórico de Pedidos por Telefone (ícone boneco).
// 4. Categorias vindas do cadastro (/categories) com design pill bonito.
// ---------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./lib/api";
import { useCart } from "./contexts/CartContext";
import { useOrder } from "./contexts/OrderContext";
import ProductBuyModal from "./ProductBuyModal";
import CartModal from "./contexts/CartModal";
import { usePromotionsToday, csvToIds } from "./hooks/usePromotionsToday";
import { buildPromoText } from "./utils/promoText";


// Tipagem
type Product = {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  promoPrice?: number | null;
  image?: string | null;
  category?: string | null;
  available: boolean;
};

type Category = { id: number; name: string };

// Cores
const THEME = {
  primary: "#B30000",
  accent: "#F2B705",
  dark: "#2D3436",
  bg: "#F4F7FA",
  white: "#FFFFFF",
  gray: "#636E72",
  green: "#00b894",
};

export default function Cardapio() {

 
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Categorias do cadastro
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("TODOS");

  // Modais Principais
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  // Histórico
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searchPhone, setSearchPhone] = useState("");
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const { items, total } = useCart();
  const { order } = useOrder();
  const itemsCount = items.reduce((acc, it) => acc + (it.qty || 1), 0);

  //Promoções do dia
  const { promos } = usePromotionsToday();

function computeCartSubtotalWithPromos() {
  if (!promos || promos.length === 0) return total;

  const lines = items.map((it: any) => ({ ...it }));

  const baseUnit = (it: any) => Number(it.unitPrice ?? it.price ?? 0);

  // total base
  for (const it of lines) {
    it.__baseUnit = baseUnit(it);
    it.__displayTotal = Number((it.__baseUnit * Number(it.qty || 1)).toFixed(2));
  }

  const hasTrigger = (pr: any) => {
    const triggerIds = csvToIds(pr.triggerProductIds);
    if (triggerIds.length > 0) {
      return lines.some((it: any) => triggerIds.includes(Number(it.productId)));
    }
    // (no botão flutuante vamos ignorar categoria por enquanto)
    return false;
  };

  const isReward = (pr: any, it: any) => {
    const rewardIds = csvToIds(pr.rewardProductIds);
    if (rewardIds.length > 0) {
      return rewardIds.includes(Number(it.productId));
    }
    return false;
  };

  for (const pr of promos) {
    if (!pr?.active) continue;
    if (!hasTrigger(pr)) continue;

    const targets = lines.filter((it: any) => isReward(pr, it));
    if (targets.length === 0) continue;

    // ✅ DISCOUNT_PERCENT
    if (pr.rewardType === "DISCOUNT_PERCENT") {
      const pct = Number(pr.discountPercent || 0);
      if (pct <= 0) continue;

      for (const it of targets) {
        const newUnit = Number((it.__baseUnit * (100 - pct) / 100).toFixed(2));
        it.__displayTotal = Number((newUnit * Number(it.qty || 1)).toFixed(2));
      }
      continue;
    }

    // ✅ FIXED_PRICE
    if (pr.rewardType === "FIXED_PRICE") {
      const fp = Number(pr.fixedPrice || 0);
      if (fp <= 0) continue;

      for (const it of targets) {
        it.__displayTotal = Number((fp * Number(it.qty || 1)).toFixed(2));
      }
      continue;
    }

    // ✅ ITEM_FREE (1 grátis)
    if (pr.rewardType === "ITEM_FREE") {
      let remainingFree = Number(pr.maxRewardQty || 1);

      const rewardLines = [...targets].sort((a, b) => a.__baseUnit - b.__baseUnit);

      for (const it of rewardLines) {
        if (remainingFree <= 0) break;

        const q = Number(it.qty || 1);
        const freeQty = Math.min(q, remainingFree);

        if (freeQty === q) it.__displayTotal = 0;
        else it.__displayTotal = Number((it.__baseUnit * (q - freeQty)).toFixed(2));

        remainingFree -= freeQty;
      }
      continue;
    }
  }

  const subtotal = lines.reduce((acc, it) => acc + Number(it.__displayTotal || 0), 0);
  return Number(subtotal.toFixed(2));
}


// ✅ DECLARA A VARIÁVEL AQUI (fora de funções)
const dynamicTotal = computeCartSubtotalWithPromos();


  //Nome por id

  const productNameById = (id: number) => {
    const prod = products.find((x: any) => x.id === id);
    return prod?.name || `#${id}`;
  };



  // Helpers
  const norm = (s?: string | null) => (s ?? "").trim();
  const normalizeCategory = (p: Product) => {
    const c = norm(p.category);
    return c ? c : "Outros";
  };


  
  // Carrega categorias (cadastro)
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<Category[]>("/categories");
        setCategories(Array.isArray(data) ? data : []);
      } catch (e) {
        console.log("Erro ao carregar categorias", e);
        setCategories([]);
      }
    })();
  }, []);

  // Carrega produtos
  useEffect(() => {
    apiFetch<Product[]>("/products")
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setProducts(list.filter((p) => p.available));
      })
      .catch((err) => console.error("Erro cardapio:", err))
      .finally(() => setLoading(false));
  }, []);

  // Se a categoria selecionada não existe mais (foi apagada), volta pra TODOS
  useEffect(() => {
    if (selectedCategory === "TODOS") return;

    const existsInCategories = categories.some((c) => c.name === selectedCategory);
    const existsInProducts = products.some((p) => normalizeCategory(p) === selectedCategory);

    if (!existsInCategories && !existsInProducts) {
      setSelectedCategory("TODOS");
    }
  }, [categories, products, selectedCategory]);

  // Busca pedidos por telefone
  async function handleBuscarPedidos() {
    if (!searchPhone.trim()) return alert("Digite o telefone");

    setLoadingHistory(true);
    try {
      const res = await apiFetch<any[]>("/orders");
      const cleanSearch = searchPhone.replace(/\D/g, "");

      const meusPedidos = (Array.isArray(res) ? res : []).filter((o: any) => {
        const phoneDb = String(o.customerPhone || "").replace(/\D/g, "");
        return phoneDb.includes(cleanSearch);
      });

      meusPedidos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setHistoryOrders(meusPedidos);
    } catch (error) {
      alert("Erro ao buscar pedidos.");
    } finally {
      setLoadingHistory(false);
    }
  }

  // Helper de Status
  const getStatusInfo = (status: string) => {
    switch (status) {
      case "PENDING":
        return { label: "Aguardando Confirmação", color: "#e67e22", icon: "🕒" };
      case "PREPARING":
        return { label: "Em Preparo", color: "#3498db", icon: "👨‍🍳" };
      case "DELIVERY":
        return { label: "Saiu para Entrega", color: "#9b59b6", icon: "🛵" };
      case "DONE":
        return { label: "Finalizado", color: "#27ae60", icon: "✅" };
      case "CANCELED":
        return { label: "Cancelado", color: "#e74c3c", icon: "❌" };
      default:
        return { label: "Desconhecido", color: "#95a5a6", icon: "?" };
    }
  };

  // Categorias para exibir:
  // - Sempre mostra TODAS do cadastro
  // - Opcional: adiciona também categorias encontradas nos produtos (ex: "Outros")
  const categoriesToShow = useMemo(() => {
  return ["TODOS", ...categories.map((c) => c.name)];
}, [categories]);


  // Produtos filtrados
  const filteredProducts =
    selectedCategory === "TODOS"
      ? products
      : products.filter((p) => normalizeCategory(p) === selectedCategory);

  // Estilos reaproveitáveis
  const pillBase: React.CSSProperties = {
    appearance: "none",
    WebkitAppearance: "none",
    border: "none",
    outline: "none",
    padding: "10px 18px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
    transition: "transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease, color 0.12s ease",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const pillActive: React.CSSProperties = {
    background: THEME.dark,
    color: THEME.white,
    boxShadow: "0 10px 25px rgba(45, 52, 54, 0.25)",
  };

  const pillInactive: React.CSSProperties = {
    background: THEME.white,
    color: THEME.gray,
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",

  };


  // ✅ Lógica Inteligente de Preço para o Cardápio
  function getDisplayPrice(p: any) {
    // 1. Se tiver Promoção ativa, ela ganha de tudo
    if (p.promoPrice && p.promoPrice > 0) {
      return { 
        label: `R$ ${Number(p.promoPrice).toFixed(2)}`, 
        isPromo: true, 
        original: p.price 
      };
    }

    const base = Number(p.price || 0);

    // 2. Se o produto tem preço fixo (maior que 0), usa ele
    if (base > 0) {
      return { label: `R$ ${base.toFixed(2)}`, isPromo: false };
    }

    // 3. Se for R$ 0.00, busca o menor preço dentro dos grupos de opções
    const optionPrices: number[] = [];
    if (p.optionGroups && Array.isArray(p.optionGroups)) {
      for (const g of p.optionGroups) {
        if (g.available === false) continue;
        for (const it of g.items || []) {
           const pr = Number(it.price || 0);
           if (pr > 0) optionPrices.push(pr);
        }
      }
    }

    // Achou algum preço nos opcionais? Pega o menor (A partir de...)
    if (optionPrices.length > 0) {
      const min = Math.min(...optionPrices);
      return { label: `A partir de R$ ${min.toFixed(2)}`, isPromo: false, isFrom: true };
    }

    // 4. Se não achou nada, mostra zero mesmo
    return { label: 'R$ 0.00', isPromo: false };
  }

  function cartHasTrigger(promo: any, cartItems: any[]) {
  const triggerIds = csvToIds(promo.triggerProductIds);

  // Se promo foi por produtos específicos:
  if (triggerIds.length > 0) {
    return cartItems.some((it: any) => triggerIds.includes(Number(it.productId || it.id)));
  }

  // Se foi por categoria:
  if (promo.triggerCategory) {
    return cartItems.some((it: any) => {
      const prod = products.find((p) => p.id === Number(it.productId || it.id));
      return prod?.category === promo.triggerCategory;
    });
  }

  return false;








}

function promoTargetsProduct(promo: any, product: any) {
  const rewardIds = csvToIds(promo.rewardProductIds);

  if (rewardIds.length > 0) return rewardIds.includes(product.id);
  if (promo.rewardCategory) return promo.rewardCategory === product.category;

  return false;
}

function computePriceWithActivePromos(product: any, base: number, promosToday: any[], cartItems: any[]) {
  let price = base;
  let appliedLabel: string | null = null;

  for (const pr of promosToday) {
    if (!promoTargetsProduct(pr, product)) continue;
    if (!cartHasTrigger(pr, cartItems)) continue; // só ativa se gatilho no carrinho

    if (pr.rewardType === "DISCOUNT_PERCENT") {
      const pct = Number(pr.discountPercent || 0);
      const factor = (100 - pct) / 100;
      price = Number((price * factor).toFixed(2));
      appliedLabel = `✅ Desconto ativado (${pct}% OFF)`;
    }

    if (pr.rewardType === "FIXED_PRICE") {
      const fp = Number(pr.fixedPrice || 0);
      price = Number(fp.toFixed(2));
      appliedLabel = `✅ Preço fixo ativado`;
    }

    if (pr.rewardType === "ITEM_FREE") {
      appliedLabel = `✅ Grátis ao finalizar (se cumprir a regra)`;
      // preço do cardápio não vira 0 aqui, porque pode ser "1 grátis e o resto pago"
      // quem garante o grátis de verdade é o backend no pedido
    }
  }

  return { price, appliedLabel };
}







  return (
    <div
      style={{
        fontFamily: "'Segoe UI', sans-serif",
        background: THEME.bg,
        minHeight: "100vh",
        paddingBottom: 120,
      }}
    >
      {/* HEADER */}
      <header
        style={{
          background: THEME.white,
          padding: "15px 20px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 45,
                height: 45,
                borderRadius: 12,
                overflow: "hidden",
                background: THEME.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img src="/logo.jpg" alt="OC" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 18, color: THEME.dark, fontWeight: 800 }}>A'Casa da Pizza</h1>
              <div style={{ fontSize: 12, color: THEME.green, fontWeight: 600 }}>● Aberto Agora</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 15, alignItems: "center" }}>
            {/* ÍCONE DE USUÁRIO (HISTÓRICO) */}
            <div
              onClick={() => setHistoryOpen(true)}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "#f1f2f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
              }}
              title="Meus pedidos"
            >
              <span style={{ fontSize: 20 }}>👤</span>
            </div>

            {/* ÍCONE CARRINHO */}
            {itemsCount > 0 && (
              <div onClick={() => setCartOpen(true)} style={{ position: "relative", cursor: "pointer" }} title="Abrir sacola">
                <span style={{ fontSize: 24 }}>🛍️</span>
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    background: THEME.primary,
                    color: "white",
                    fontSize: 10,
                    fontWeight: "bold",
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 8px 18px rgba(179,0,0,0.25)",
                  }}
                >
                  {itemsCount}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* BANNER */}
      <div style={{ padding: 20 }}>
        <div
          style={{
            background: `linear-gradient(135deg, ${THEME.primary}, #800000)`,
            borderRadius: 20,
            padding: 24,
            color: "white",
            boxShadow: "0 10px 30px rgba(179, 0, 0, 0.25)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Bateu a fome? 😋</h2>
          <p style={{ margin: "5px 0 15px", opacity: 0.9 }}>Peça agora e receba quentinho!</p>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: THEME.accent,
              color: THEME.dark,
              padding: "8px 16px",
              borderRadius: 999,
              fontWeight: 900,
              fontSize: 12,
              boxShadow: "0 10px 25px rgba(242,183,5,0.25)",
            }}
          >
            <span>ENTREGA RÁPIDA</span> <span>🚀</span>
          </div>

          <div style={{ position: "absolute", right: -20, bottom: -20, fontSize: 100, opacity: 0.2 }}>🍔</div>
        </div>
      </div>

      {/* CATEGORIAS (pill bonito) */}
      <div style={{ padding: "0 20px 18px" }}>
        <div
          style={{
            overflowX: "auto",
            whiteSpace: "nowrap",
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
            paddingBottom: 2,
          }}
        >
          <style>{`::-webkit-scrollbar { display: none; }`}</style>

          {categoriesToShow.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  ...pillBase,
                  ...(isActive ? pillActive : pillInactive),
                  marginRight: 10,
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* PRODUTOS */}
      <div style={{ padding: "0 20px", display: "grid", gap: 15 }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#999" }}>Carregando delícias...</p>
        ) : filteredProducts.length === 0 ? (
          <div
            style={{
              background: THEME.white,
              borderRadius: 18,
              padding: 14,
              border: "1px solid rgba(0,0,0,0.06)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.04)",
              color: THEME.gray,
              fontWeight: 800,
              textAlign: "center",
            }}
          >
            Nenhum produto nessa categoria.
          </div>
        ) : (
          filteredProducts.map((p) => {
            // ✅ Chama a função nova para decidir o preço
            const priceInfo = getDisplayPrice(p);
            const basePrice = Number(p.price || 0);

            // se o produto tem promoPrice próprio (antigo), mantém como está
            const isBasePromo = !!priceInfo.isPromo;

            // só calcula promo dinâmica se NÃO for promoPrice antigo
            let dynamicLabel: string | null = null;
            let dynamicPrice: number | null = null;

            if (!isBasePromo && basePrice > 0) {
              const dyn = computePriceWithActivePromos(p, basePrice, promos || [], items || []);
              dynamicLabel = dyn.appliedLabel;
              dynamicPrice = dyn.price !== basePrice ? dyn.price : null;
            }


            return (
              <div
                key={p.id}
                onClick={() => setSelectedProduct(p)}
                style={{
                  background: THEME.white,
                  borderRadius: 18,
                  padding: 15,
                  display: "flex",
                  gap: 15,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
                  cursor: "pointer",
                  border: "1px solid rgba(0,0,0,0.05)",
                  transition: "transform 0.12s ease, box-shadow 0.12s ease",
                  alignItems: "center",
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", fontSize: 16, color: THEME.dark, marginBottom: 4 }}>
                    {p.name}
                  </strong>

                  <div
                    style={{
                      fontSize: 12,
                      color: "#999",
                      marginBottom: 12,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {p.description || "Sem descrição"}
                  </div>  

                      {/* LINHA DO PREÇO */}
<div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
  <span
    style={{
      color: dynamicPrice !== null ? THEME.green : priceInfo.isPromo ? THEME.green : THEME.dark,
      fontWeight: 900,
      fontSize: 16,
    }}
  >
    {dynamicPrice !== null ? `R$ ${dynamicPrice.toFixed(2)}` : priceInfo.label}
  </span>

  {/* preço original riscado quando promo dinâmica ativar */}
  {dynamicPrice !== null && (
    <span style={{ textDecoration: "line-through", color: "#bbb", fontSize: 12 }}>
      R$ {basePrice.toFixed(2)}
    </span>
  )}

  {/* preço original riscado quando for promoPrice antigo */}
  {priceInfo.isPromo && priceInfo.original && priceInfo.original > 0 && (
    <span style={{ textDecoration: "line-through", color: "#bbb", fontSize: 12 }}>
      R$ {Number(priceInfo.original).toFixed(2)}
    </span>
  )}

  {/* etiqueta PROMO só do promoPrice antigo */}
  {priceInfo.isPromo && (
    <span
      style={{
        marginLeft: 6,
        fontSize: 11,
        fontWeight: 900,
        color: THEME.dark,
        background: "rgba(242,183,5,0.22)",
        padding: "3px 8px",
        borderRadius: 999,
      }}
    >
      PROMO
    </span>
  )}
</div>

{/* ✅ LABEL “ATIVADO” (CAMADA 2) */}
{dynamicLabel && (
  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, color: THEME.green }}>
    {dynamicLabel}
  </div>
)}

{/* ✅ MENSAGENS DE PROMOÇÃO DO DIA (CAMADA 1) */}
{(() => {
  const promosForProduct = (promos || []).filter((pr: any) => {
    if (!pr?.showOnMenu) return false;

    const rewardIds = csvToIds(pr.rewardProductIds);
    const triggerIds = csvToIds(pr.triggerProductIds);

    const isReward =
      rewardIds.includes(p.id) ||
      (pr.rewardCategory && pr.rewardCategory === p.category);

    const isTrigger =
      triggerIds.includes(p.id) ||
      (pr.triggerCategory && pr.triggerCategory === p.category);

    return isReward || isTrigger;
  });

  if (promosForProduct.length === 0) return null;

  







  return (
    <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
      {promosForProduct.slice(0, 2).map((pr: any) => (
        <div
          key={pr.id}
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: THEME.green,
            background: "rgba(0,184,148,0.10)",
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid rgba(0,184,148,0.18)",
            width: "fit-content",
            maxWidth: "100%",
          }}
        >
          🔥 {buildPromoText(pr, productNameById)}
        </div>
      ))}
    </div>
  );
})()}



                  
                </div>

                <div
                  style={{
                    width: 100,
                    height: 90,
                    borderRadius: 14,
                    background: "#f8f8f8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    border: "1px solid rgba(0,0,0,0.05)",
                  }}
                >
                  {p.image?.startsWith("http") ? (
                    <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 40 }}>{p.image || "🍔"}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      

      {/* BOTÕES FLUTUANTES (SACOLA + RASTREIO) */}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          left: 20,
          right: 20,
          zIndex: 900,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {order && !["CLOSED", "CANCELED"].includes(order.status) && (
          <button
            onClick={() => navigate(`/acompanhar/${order.idString}`)}
            style={{
              width: "100%",
              background: "#FF7F00",
              color: "white",
              padding: "14px 24px",
              borderRadius: 20,
              border: "none",
              fontSize: 14,
              fontWeight: 800,
              boxShadow: "0 10px 30px rgba(255, 127, 0, 0.3)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
              animation: "pulse 2s infinite",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>🕒 Pedido em andamento...</span>
            </div>
            <span>Acompanhar →</span>
          </button>
        )}

        {itemsCount > 0 && (
          <button
            onClick={() => setCartOpen(true)}
            style={{
              width: "100%",
              background: THEME.dark,
              color: "white",
              padding: "16px 24px",
              borderRadius: 20,
              border: "none",
              fontSize: 16,
              fontWeight: 800,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  background: THEME.accent,
                  color: THEME.dark,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                }}
              >
                {itemsCount}
              </div>
              <span>Ver sacola</span>
            </div>
            <span>R$ {dynamicTotal.toFixed(2)}</span>
          </button>
        )}
      </div>

      {/* MODAL: MEUS PEDIDOS */}
      {historyOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setHistoryOpen(false);
          }}
        >
          <div
            style={{
              width: "min(400px, 100%)",
              background: "white",
              borderRadius: 20,
              padding: 20,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: THEME.dark }}>📜 Meus Pedidos</h3>
              <button onClick={() => setHistoryOpen(false)} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}>
                ✕
              </button>
            </div>

            <div style={{ background: "#f8f9fa", padding: 15, borderRadius: 12, marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: "bold", color: "#666", marginBottom: 5, display: "block" }}>
                DIGITE SEU CELULAR PARA VER SEUS PEDIDOS
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  placeholder="Ex: 81988887777"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #ddd", fontSize: 16 }}
                />
                <button
                  onClick={handleBuscarPedidos}
                  disabled={loadingHistory}
                  style={{ background: THEME.dark, color: "white", border: "none", borderRadius: 10, padding: "0 15px", cursor: "pointer" }}
                >
                  {loadingHistory ? "..." : "🔍"}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {historyOrders.length === 0 && !loadingHistory ? (
                <div style={{ textAlign: "center", padding: 20, color: "#999", fontSize: 14 }}>
                  Nenhum pedido encontrado. <br /> Digite o telefone usado na compra.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {historyOrders.map((p) => {
                    const status = getStatusInfo(p.status);
                    return (
                      <div
                        key={p.idString}
                        onClick={() => {
                          setHistoryOpen(false);
                          navigate(`/acompanhar/${p.idString}`);
                        }}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: 12,
                          padding: 15,
                          cursor: "pointer",
                          background: "white",
                          boxShadow: "0 2px 5px rgba(0,0,0,0.03)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <strong style={{ color: THEME.dark }}>{p.customerName}</strong>
                          <strong style={{ color: THEME.dark }}>R$ {Number(p.total).toFixed(2)}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 12, color: "#666" }}>
                            {new Date(p.createdAt).toLocaleDateString()} às {new Date(p.createdAt).toLocaleTimeString().slice(0, 5)}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              background: status.color + "20",
                              color: status.color,
                              padding: "4px 8px",
                              borderRadius: 20,
                              fontWeight: "bold",
                            }}
                          >
                            {status.icon} {status.label}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modais */}
      <ProductBuyModal open={!!selectedProduct} productId={selectedProduct?.id || null} onClose={() => setSelectedProduct(null)} />
      <CartModal open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
