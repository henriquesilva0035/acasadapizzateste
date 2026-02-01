import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "./lib/api";
import { useCart } from "./contexts/CartContext";
import { usePromotionsToday, csvToIds } from "./hooks/usePromotionsToday";

// --- TIPOS ---
type ChargeMode = "SUM" | "MAX" | "MIN";

type OptionItem = {
  id: number;
  name: string;
  price: number;
  description?: string | null;
  imageUrl?: string | null;
  available: boolean;
};

type OptionGroup = {
  id: number;
  title: string;
  min: number;
  max: number;
  chargeMode: ChargeMode;
  available: boolean;
  items: OptionItem[];
};

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
  optionGroups: OptionGroup[];
};

type Props = {
  open: boolean;
  productId: number | null;
  onClose: () => void;
  onAdded?: () => void;
};

/**
 * =========================================================
 * ✅ HELPERS (organizados)
 * - moneyToNumber / sum: utilidades gerais
 * - isPromoActive: promo FIXA do produto (promoPrice + promoDays)
 * - Promo engine do modal:
 *   - preço de OPÇÃO: só muda se rewardOptionItemIds incluir a opção
 *   - preço do PRODUTO (base): aplica DISCOUNT_PERCENT quando:
 *       - o produto atual é RECOMPENSA (rewardProductIds/rewardCategory)
 *       - existe GATILHO no carrinho (triggerProductIds/triggerCategory)
 *       - e o produto atual NÃO é o gatilho
 * =========================================================
 */

function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}

function moneyToNumber(v: any) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function isPromoActive(p: Product) {
  const promo = moneyToNumber(p.promoPrice);
  if (!promo || promo <= 0) return false;

  const daysStr = String(p.promoDays ?? "").trim();
  if (!daysStr) return true;

  const allowed = daysStr.split(",").map((x) => Number(String(x).trim()));
  const today = new Date().getDay(); // 0=dom ... 6=sab
  return allowed.includes(today);
}

// --- CORES ---
const C_RED = "#B30000";
const C_GREEN = "#00b894";
const C_DARK = "#2D3436";

export default function ProductBuyModal({ open, productId, onClose, onAdded }: Props) {
  const [product, setProduct] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [qty, setQty] = useState(1);
  const [obs, setObs] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { promos } = usePromotionsToday();
  const { addItem, items } = useCart();

  // ✅ Map p/ descobrir categoria dos itens do carrinho (necessário p/ triggerCategory)
  const [prodMeta, setProdMeta] = useState<Record<number, { category?: string | null }>>({});

  // ✅ refs pra calcular o tamanho real do rodapé e não “passar” por baixo
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [footerH, setFooterH] = useState(110); // fallback

  useLayoutEffect(() => {
    if (!open) return;

    const el = footerRef.current;
    if (!el) return;

    const update = () => {
      const h = Math.ceil(el.getBoundingClientRect().height || 0);
      if (h > 0) setFooterH(h + 16);
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);

    return () => ro.disconnect();
  }, [open, product]);

  // ✅ trava o scroll do site por trás
  useEffect(() => {
    if (!open) return;

    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);

  // ✅ carrega produto quando abre
  useEffect(() => {
    if (!open || !productId) return;

    setProduct(null);
    setLoading(true);
    setErr(null);
    setSelected(new Set());
    setQty(1);
    setObs("");

    apiFetch<Product>(`/products/${productId}`)
      .then((data) => setProduct(data))
      .catch((e: any) => setErr(e.message || "Erro ao carregar produto"))
      .finally(() => setLoading(false));
  }, [open, productId]);

  /**
   * ✅ Carrega meta simples dos produtos (id + category) para:
   * - checar triggerCategory no carrinho (G/GG etc).
   * Se seu endpoint /products já retorna category (mesmo “light”), isso resolve.
   */
  useEffect(() => {
    if (!open) return;

    (async () => {
      try {
        const list = await apiFetch<any[]>(`/products`);
        const map: Record<number, { category?: string | null }> = {};
        for (const p of Array.isArray(list) ? list : []) {
          const id = Number(p?.id);
          if (!Number.isFinite(id)) continue;
          map[id] = { category: p?.category ?? null };
        }
        setProdMeta(map);
      } catch {
        // se falhar, triggerCategory pode não funcionar no modal,
        // mas triggerProductIds continua funcionando.
        setProdMeta({});
      }
    })();
  }, [open]);

  /**
   * =========================================================
   * ✅ PROMO: OPÇÕES (sabores/bordas)
   *
   * Regra:
   * - Só muda preço da opção se ela estiver em rewardOptionItemIds
   * - Assim: promo “G/GG -> P 50%” NÃO mexe em opções do GG
   * =========================================================
   */

  // (opcional) se você usa triggerCategory/triggerProductIds para “marcar” onde a promo de opção aparece
  function promoAppliesToProduct(pr: any, prod: Product) {
    const triggerIds = csvToIds(pr.triggerProductIds);
    const byId = triggerIds.length ? triggerIds.includes(Number(prod.id)) : false;
    const byCat = pr.triggerCategory ? String(pr.triggerCategory) === String(prod.category) : false;
    return byId || byCat;
  }

  function getAdjustedOptionPrice(optionItem: OptionItem, prod: Product) {
    const original = Number(optionItem.price || 0);
    let best = original;

    for (const pr of promos || []) {
      if (!pr?.active) continue;

      // ✅ Opção só muda preço se ela estiver na RECOMPENSA
      const rewardOptIds = csvToIds(pr.rewardOptionItemIds);
      if (rewardOptIds.length === 0) continue;
      if (!rewardOptIds.includes(Number(optionItem.id))) continue;

      // mantém para “escopo” de onde a promo vale (se você quiser)
      if (!promoAppliesToProduct(pr, prod)) continue;

      if (pr.rewardType === "FIXED_PRICE") {
        const fp = Number(pr.fixedPrice || 0);
        if (fp >= 0) best = Math.min(best, fp);
        continue;
      }

      if (pr.rewardType === "DISCOUNT_PERCENT") {
        const pct = Number(pr.discountPercent || 0);
        if (pct > 0 && pct <= 100) {
          const np = Number((original * (100 - pct) / 100).toFixed(2));
          best = Math.min(best, np);
        }
        continue;
      }
    }

    return best;
  }

  /**
   * =========================================================
   * ✅ PROMO: BASE DO PRODUTO (ex: P com 50% OFF)
   *
   * - O cardápio mostra 15 certo porque aplica promo dinâmica
   * - O modal precisa aplicar também (pra salvar unitPrice correto)
   * =========================================================
   */

  function cartHasTrigger(promo: any, cartItems: any[]) {
    const triggerIds = csvToIds(promo.triggerProductIds);

    if (triggerIds.length > 0) {
      return cartItems.some((it: any) => triggerIds.includes(Number(it.productId)));
    }

    if (promo.triggerCategory) {
      return cartItems.some((it: any) => {
        const pid = Number(it.productId);
        const cat = prodMeta?.[pid]?.category ?? null;
        return cat != null && String(cat) === String(promo.triggerCategory);
      });
    }

    return false;
  }

  function productIsReward(promo: any, prod: Product) {
    const rewardIds = csvToIds(promo.rewardProductIds);
    if (rewardIds.length > 0) return rewardIds.includes(Number(prod.id));

    if (promo.rewardCategory) return String(promo.rewardCategory) === String(prod.category);

    return false;
  }

  function productIsTrigger(promo: any, prod: Product) {
    const triggerIds = csvToIds(promo.triggerProductIds);
    if (triggerIds.length > 0 && triggerIds.includes(Number(prod.id))) return true;

    if (promo.triggerCategory && String(prod.category) === String(promo.triggerCategory)) return true;

    return false;
  }

  function applyDynamicProductPromos(prod: Product, base: number, cartItems: any[]) {
    let best = base;

    for (const pr of promos || []) {
      if (!pr?.active) continue;

      // ✅ aqui: só cuidamos do desconto percentual no produto (P)
      if (pr.rewardType !== "DISCOUNT_PERCENT") continue;

      // precisa existir gatilho no carrinho (G/GG)
      if (!cartHasTrigger(pr, cartItems)) continue;

      // produto atual tem que ser recompensa
      if (!productIsReward(pr, prod)) continue;

      // e nunca aplicar se este produto for o gatilho
      if (productIsTrigger(pr, prod)) continue;

      const pct = Number(pr.discountPercent || 0);
      if (pct > 0 && pct <= 100) {
        const np = Number((base * (100 - pct) / 100).toFixed(2));
        best = Math.min(best, np);
      }
    }

    return best;
  }

  // ✅ cálculo de preço/validação
  const calc = useMemo(() => {
    if (!product) return { addons: 0, total: 0, unit: 0, base: 0, errors: [], optionSummary: "" };

    const errors: string[] = [];
    let addons = 0;

    // 1) base normal ou promo fixa do produto (promoPrice/promoDays)
    const promoOn = isPromoActive(product);
    let base = promoOn ? moneyToNumber(product.promoPrice) : moneyToNumber(product.price);

    // 2) ✅ aplica promo dinâmica (ex: 50% OFF na P quando há GG/G no carrinho)
    base = applyDynamicProductPromos(product, base, items || []);

    const summaryParts: string[] = [];

    for (const g of product.optionGroups || []) {
      if (!g.available) continue;

      const picks = (g.items || []).filter((it) => it.available && selected.has(it.id));
      const min = Number(g.min || 0);
      const max = Number(g.max || 999);

      if (picks.length < min) errors.push(`"${g.title}": selecione no mínimo ${min}.`);
      if (picks.length > max) errors.push(`"${g.title}": máximo excedido.`);

      if (picks.length) summaryParts.push(`${g.title}: ${picks.map((x) => x.name).join(", ")}`);

      // ✅ preço das opções com promo (somente se rewardOptionItemIds bater)
      const prices = picks.map((op) => getAdjustedOptionPrice(op, product));
      const mode = String(g.chargeMode || "SUM").toUpperCase();

      if (prices.length) {
        if (mode === "MAX") addons += Math.max(...prices);
        else if (mode === "MIN") addons += Math.min(...prices);
        else addons += sum(prices);
      }
    }

    const unit = Number((base + addons).toFixed(2));
    const total = Number((unit * Math.max(1, qty)).toFixed(2));

    return { addons, base, unit, total, errors, optionSummary: summaryParts.join(" | ") };
  }, [product, selected, qty, promos, items, prodMeta]);

  if (!open) return null;

  function toggleItem(itemId: number, group: OptionGroup) {
    setSelected((prev) => {
      const next = new Set(prev);
      const isChecked = next.has(itemId);

      if (!isChecked) {
        const inGroup = group.items.filter((it) => next.has(it.id));
        const max = Number(group.max || 999);

        if (inGroup.length >= max) {
          if (max === 1) {
            for (const it of inGroup) next.delete(it.id);
          } else {
            return next;
          }
        }
        next.add(itemId);
      } else {
        next.delete(itemId);
      }

      return next;
    });
  }

  function handleAddToCart() {
    if (!product) return;

    if (calc.errors.length) {
      setErr(calc.errors[0]);
      return;
    }

    // ✅ unitPrice já sai com promo dinâmica aplicada, então o carrinho vai mostrar certo
    addItem(
      {
        productId: product.id,
        name: product.name,
        unitPrice: calc.unit,
        notes: obs,
        optionSummary: calc.optionSummary,
        optionIds: Array.from(selected),
      },
      qty
    );

    onAdded?.();
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        height: "100dvh",
        background: "rgba(0,0,0,0.6)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(600px, 100%)",
          maxHeight: "90dvh",
          display: "flex",
          flexDirection: "column",
          background: "#f8f9fa",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        {/* Imagem de Topo */}
        <div style={{ position: "relative", height: 200, background: "#fff", flexShrink: 0 }}>
          {product?.image?.startsWith("http") ? (
            <img src={product.image} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 80,
                background: "#eee",
              }}
            >
              {product?.image || "🍔"}
            </div>
          )}

          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 15,
              right: 15,
              background: "rgba(0,0,0,0.5)",
              color: "white",
              border: "none",
              width: 32,
              height: 32,
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 20,
            paddingBottom: footerH,
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          {loading && <div style={{ textAlign: "center", padding: 20 }}>Carregando...</div>}
          {err && (
            <div style={{ background: "#ff7675", color: "white", padding: 10, borderRadius: 8, marginBottom: 15, fontWeight: "bold" }}>
              ⚠️ {err}
            </div>
          )}

          {product && (
            <>
              <h2 style={{ margin: "0 0 5px 0", color: C_DARK }}>{product.name}</h2>
              <p style={{ margin: "0 0 15px 0", color: "#636e72", fontSize: 14 }}>{product.description}</p>

              {/* ✅ base já aparece com promo dinâmica aplicada */}
              <div style={{ fontSize: 18, color: C_RED, fontWeight: 900, marginBottom: 20 }}>
                R$ {Number(calc.base).toFixed(2)}
              </div>

              {/* Grupos de Opções */}
              {product.optionGroups.map((g) => {
                if (!g.available) return null;

                const pickedCount = (g.items || []).filter((it) => selected.has(it.id)).length;
                const isSatisfied = pickedCount >= g.min && pickedCount <= g.max;

                return (
                  <div key={g.id} style={{ marginBottom: 25 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#eee",
                        padding: "10px 15px",
                        borderRadius: 8,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <strong style={{ color: C_DARK, fontSize: 14 }}>{g.title.toUpperCase()}</strong>
                        <div style={{ fontSize: 11, color: "#636e72", marginTop: 2 }}>
                          {g.max === 1 ? "Escolha 1 opção" : `Escolha de ${g.min} até ${g.max}`}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: 11,
                          background: isSatisfied ? C_GREEN : "#ccc",
                          color: "white",
                          padding: "4px 8px",
                          borderRadius: 4,
                          fontWeight: "bold",
                        }}
                      >
                        {pickedCount}/{g.max}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {g.items
                        .filter((it) => it.available)
                        .map((it) => {
                          const isSelected = selected.has(it.id);

                          return (
                            <div
                              key={it.id}
                              onClick={() => toggleItem(it.id, g)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                background: "white",
                                padding: 12,
                                borderRadius: 12,
                                border: isSelected ? `2px solid ${C_RED}` : "1px solid #e0e0e0",
                                cursor: "pointer",
                                transition: "all 0.2s",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                                {it.imageUrl ? (
                                  <img
                                    src={it.imageUrl}
                                    alt=""
                                    style={{ width: 50, height: 50, borderRadius: 8, objectFit: "cover", background: "#f1f1f1", flexShrink: 0 }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: 50,
                                      height: 50,
                                      borderRadius: 8,
                                      background: "#f1f1f1",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 20,
                                      flexShrink: 0,
                                    }}
                                  >
                                    🍕
                                  </div>
                                )}

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, color: C_DARK, overflowWrap: "break-word" }}>{it.name}</div>

                                  {it.description && (
                                    <div style={{ fontSize: 12, color: "#95a5a6", marginTop: 2, lineHeight: "1.3", wordBreak: "break-word" }}>
                                      {it.description}
                                    </div>
                                  )}

                                  {(() => {
                                    const original = Number(it.price || 0);
                                    if (original <= 0) return null;

                                    const adj = product ? getAdjustedOptionPrice(it, product) : original;
                                    const changed = adj !== original;

                                    return (
                                      <div style={{ marginTop: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                        <div style={{ color: C_GREEN, fontWeight: "bold", fontSize: 13 }}>+ R$ {adj.toFixed(2)}</div>

                                        {changed && (
                                          <div style={{ textDecoration: "line-through", color: "#999", fontSize: 12 }}>+ R$ {original.toFixed(2)}</div>
                                        )}

                                        {changed && (
                                          <span style={{ fontSize: 11, fontWeight: 900, background: "rgba(0,184,148,0.12)", padding: "3px 8px", borderRadius: 999 }}>
                                            PROMO
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>

                              <div
                                style={{
                                  width: 22,
                                  height: 22,
                                  marginLeft: 10,
                                  borderRadius: g.max === 1 ? "50%" : "6px",
                                  border: `2px solid ${isSelected ? C_RED : "#ccc"}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: isSelected ? C_RED : "transparent",
                                  flexShrink: 0,
                                }}
                              >
                                {isSelected && <span style={{ color: "white", fontSize: 14 }}>✓</span>}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}

              {/* Observação */}
              <div style={{ marginTop: 20 }}>
                <label style={{ fontWeight: "bold", fontSize: 13, color: "#636e72" }}>Alguma observação?</label>

                <textarea
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Ex: Tirar cebola, maionese à parte..."
                  className="oc-obs"
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    fontFamily: "inherit",
                    resize: "none",
                    minHeight: 92,
                    maxHeight: 92,
                    overflow: "auto",
                    boxSizing: "border-box",
                  }}
                />

                <style>{`
                  textarea.oc-obs {
                    resize: none !important;
                    overflow: auto !important;
                    box-sizing: border-box !important;
                  }
                `}</style>
              </div>
            </>
          )}
        </div>

        {/* Rodapé */}
        {product && (
          <div
            ref={footerRef}
            style={{
              background: "white",
              padding: "15px 20px",
              borderTop: "1px solid #eee",
              display: "flex",
              gap: 15,
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #ddd", borderRadius: 10, height: 45 }}>
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                style={{ width: 40, height: "100%", background: "none", border: "none", fontSize: 20, color: C_RED, cursor: "pointer" }}
              >
                -
              </button>

              <span style={{ fontSize: 16, fontWeight: "bold", minWidth: 20, textAlign: "center" }}>{qty}</span>

              <button
                onClick={() => setQty(qty + 1)}
                style={{ width: 40, height: "100%", background: "none", border: "none", fontSize: 20, color: C_RED, cursor: "pointer" }}
              >
                +
              </button>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={calc.errors.length > 0}
              style={{
                flex: 1,
                height: 45,
                background: calc.errors.length > 0 ? "#b2bec3" : C_RED,
                color: "white",
                border: "none",
                borderRadius: 10,
                fontWeight: "bold",
                fontSize: 16,
                cursor: calc.errors.length > 0 ? "not-allowed" : "pointer",
                boxShadow: calc.errors.length > 0 ? "none" : "0 4px 10px rgba(179,0,0,0.3)",
              }}
            >
              {calc.errors.length > 0 ? "Selecione os itens" : `Adicionar • R$ ${calc.total.toFixed(2)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
