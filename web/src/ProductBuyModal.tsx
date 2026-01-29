import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "./lib/api";
import { useCart } from "./contexts/CartContext";

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

// --- HELPERS ---
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
  const today = new Date().getDay();
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

  const { addItem } = useCart();

  // ✅ refs pra calcular o tamanho real do rodapé e não “passar” por baixo
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [footerH, setFooterH] = useState(110); // fallback

  useLayoutEffect(() => {
    if (!open) return;

    const el = footerRef.current;
    if (!el) return;

    const update = () => {
      const h = Math.ceil(el.getBoundingClientRect().height || 0);
      if (h > 0) setFooterH(h + 16); // +16 de folga
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);

    return () => ro.disconnect();
  }, [open, product]);

  // ✅ trava o scroll do site por trás (evita "puxar" e tremer)
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

  // ✅ cálculo de preço/validação
  const calc = useMemo(() => {
    if (!product) return { addons: 0, total: 0, unit: 0, base: 0, errors: [], optionSummary: "" };

    const errors: string[] = [];
    let addons = 0;

    const promoOn = isPromoActive(product);
    const base = promoOn ? moneyToNumber(product.promoPrice) : moneyToNumber(product.price);

    const summaryParts: string[] = [];

    for (const g of product.optionGroups || []) {
      if (!g.available) continue;

      const picks = (g.items || []).filter((it) => it.available && selected.has(it.id));
      const min = Number(g.min || 0);
      const max = Number(g.max || 999);

      if (picks.length < min) errors.push(`"${g.title}": selecione no mínimo ${min}.`);
      if (picks.length > max) errors.push(`"${g.title}": máximo excedido.`);

      if (picks.length) summaryParts.push(`${g.title}: ${picks.map((x) => x.name).join(", ")}`);

      const prices = picks.map((p) => Number(p.price || 0));
      const mode = String(g.chargeMode || "SUM").toUpperCase();

      if (prices.length) {
        if (mode === "MAX") addons += Math.max(...prices);
        else if (mode === "MIN") addons += Math.min(...prices);
        else addons += sum(prices);
      }
    }

    const unit = base + addons;
    const total = unit * Math.max(1, qty);

    return { addons, base, unit, total, errors, optionSummary: summaryParts.join(" | ") };
  }, [product, selected, qty]);

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
            paddingBottom: footerH, // ✅ agora é calculado pelo footer real
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

                                  {it.price > 0 && <div style={{ color: C_GREEN, fontWeight: "bold", fontSize: 13, marginTop: 2 }}>+ R$ {it.price.toFixed(2)}</div>}
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

                    // ✅ travas reais
                    resize: "none",
                    minHeight: 92,
                    maxHeight: 92,
                    overflow: "auto",
                    boxSizing: "border-box",
                  }}
                />

                {/* ✅ CSS inline anti-!important global */}
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

              <button onClick={() => setQty(qty + 1)} style={{ width: 40, height: "100%", background: "none", border: "none", fontSize: 20, color: C_RED, cursor: "pointer" }}>
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
