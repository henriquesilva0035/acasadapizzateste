// ARQUIVO: src/contexts/CartModal.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";
import { useCart } from "./CartContext";
import { useOrder } from "./OrderContext";
import { apiFetch } from "../lib/api";
import { usePromotionsToday, csvToIds } from "../hooks/usePromotionsToday";


type Props = {
  open: boolean;
  onClose: () => void;
};

type Neighborhood = {
  id: number;
  name: string;
  price: number;
  active: boolean;
};

// --- PALETA DE CORES ---
const THEME = {
  bg: "#F4F7FA",
  card: "#FFFFFF",
  textDark: "#2D3436",
  textGray: "#636E72",
  primary: "#00b894",
  danger: "#d63031",
  border: "#dfe6e9",
  inputBg: "#f1f2f6",
};

function formatBRL(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CartModal({ open, onClose }: Props) {
  const { items, total, setQty, removeItem, clear } = useCart();
  const { createOrder, isLoading } = useOrder();
  const navigate = useNavigate();

  const [step, setStep] = useState<"CART" | "DETAILS">("CART");
  const [deliveryMode, setDeliveryMode] = useState<"DELIVERY" | "TAKEOUT">("DELIVERY");

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairros, setBairros] = useState<Neighborhood[]>([]);
  const [selectedBairroId, setSelectedBairroId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [changeFor, setChangeFor] = useState("");
  const { promos } = usePromotionsToday();
  const [products, setProducts] = useState<any[]>([]);


  // ✅ mede o footer pra dar paddingBottom no scroll e nada ficar “passando”
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [footerH, setFooterH] = useState(160); // fallback

  // ✅ trava scroll do body quando abrir (evita tremedeira no mobile)
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

  useEffect(() => {
  (async () => {
    try {
      const list = await apiFetch<any[]>("/products");
      setProducts(Array.isArray(list) ? list : []);
    } catch {
      setProducts([]);
    }
  })();
}, []);


  function moneyToNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;

  // aceita "10", "10.5", "10,50", "R$ 10,50"
  const cleaned = s.replace(/[^0-9,.-]/g, "");
  const hasComma = cleaned.includes(",");
  const normalized = hasComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function isProductPromoActive(p: any) {
  const promo = moneyToNumber(p?.promoPrice);
  if (!promo || promo <= 0) return false;

  const daysStr = String(p?.promoDays ?? "").trim();
  if (!daysStr) return true;

  const allowed = daysStr
    .split(",")
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n));

  const today = new Date().getDay(); // 0=domingo ... 6=sabado
  return allowed.includes(today);
}









  // ✅ recalcula footer quando abre / muda de step (porque no DETAILS tem taxa etc)
  useLayoutEffect(() => {
    if (!open) return;

    const el = footerRef.current;
    if (!el) return;

    const update = () => {
      const h = Math.ceil(el.getBoundingClientRect().height || 0);
      if (h > 0) setFooterH(h + 16); // + folga
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => ro.disconnect();
  }, [open, step, deliveryMode, paymentMethod, changeFor, total, selectedBairroId]);

  useEffect(() => {
    if (open) {
      apiFetch<Neighborhood[]>("/neighborhoods")
        .then((data) => setBairros(data.filter((b) => b.active)))
        .catch(console.error);
    }
  }, [open]);

  if (!open) return null;

    const cartView = computeCartDisplay(items);

    const bairroObj = bairros.find((b) => String(b.id) === String(selectedBairroId));
    const taxaEntrega = deliveryMode === "DELIVERY" && bairroObj ? bairroObj.price : 0;

    // ✅ usa subtotal calculado com promo
    const finalTotal = cartView.subtotal + taxaEntrega;



  function sendToWhatsApp(orderId: string, addressFull: string, payMethod: string) {
    const LOJA_PHONE = "5551990038803"; // ⚠️ SEU NÚMERO
    let msg = `*Novo Pedido #${orderId.slice(0, 4)}* 🚀\n`;
    msg += `*Cliente:* ${customerName}\n\n`;

    items.forEach((it) => {
      msg += `${it.qty}x ${it.name}`;
      if (it.optionSummary) {
        const opts = it.optionSummary.split(" | ").join("\n   + ");
        msg += `\n   + ${opts}`;
      }
      if (it.notes) msg += `\n   Obs: ${it.notes}`;
      msg += `\n`;
    });

    msg += `\n*Entrega:* ${deliveryMode === "DELIVERY" ? addressFull : "Retirada no Balcão"}\n`;
    msg += `*Pagamento:* ${payMethod}\n`;
    msg += `*Total:* ${formatBRL(finalTotal)}\n`;

    window.open(`https://wa.me/${LOJA_PHONE}?text=${encodeURIComponent(msg)}`, "_blank");
  }


  function getProductById(id: number) {
  return products.find((p) => Number(p.id) === Number(id));
}
function findOptionItem(product: any, optionItemId: number) {
  for (const g of product?.optionGroups || []) {
    for (const it of g.items || []) {
      if (Number(it.id) === Number(optionItemId)) return { group: g, item: it };
    }
  }
  return null;
}


function getAdjustedOptionPrice(optionItem: any, prod: any, cartLines?: any[]) {

  // antes de aplicar qualquer desconto/preço fixo, verifica OPTION_FREr
    // ✅ OPTION_FREE (borda grátis)
  // regra: se houver gatilho (pizza G/GG) no carrinho e a opção estiver na lista grátis -> preço da borda vira 0
  // ✅ OPTION_FREE (borda grátis)
// regra: se houver gatilho no carrinho e a opção estiver na lista grátis -> preço da borda vira 0
const promosList = Array.isArray(promos) ? promos : [];
const linesToCheck = Array.isArray(cartLines) ? cartLines : [];

for (const pr of promosList) {
  if (!pr?.active) continue;
  if (pr.rewardType !== "OPTION_FREE") continue;

  // gatilho por IDs
  const triggerIds = csvToIds(pr.triggerProductIds);
  const hasTriggerById =
    triggerIds.length > 0 && linesToCheck.some((it: any) => triggerIds.includes(Number(it.productId)));

  if (!hasTriggerById) continue;

  // ✅ bordas grátis vem do rewardOptionItemIds (campo certo)
  // bordas grátis (ids de optionItem)
        const freeBorderIds = csvToIds(pr.rewardOptionItemIds);
        if (freeBorderIds.length === 0) continue;

        if (freeBorderIds.includes(Number(optionItem.id))) {
          return 0; // ✅ borda grátis
        }

}







  const base = Number(optionItem?.price || 0);

  // Sem promo carregada, devolve preço normal
  const list = Array.isArray(promos) ? promos : [];
  if (list.length === 0) return base;

  // A promo precisa estar ativa E com FIXED_PRICE e com rewardOptionItemIds contendo esse optionItem.id
  for (const pr of list) {
    if (!pr?.active) continue;
    if (pr.rewardType !== "FIXED_PRICE") continue;

    const rewardOptIds = csvToIds(pr.rewardOptionItemIds);
    if (!rewardOptIds.includes(Number(optionItem.id))) continue;

    // precisa bater gatilho:
    // 1) se tem triggerProductIds -> carrinho precisa ter algum trigger
    // 2) se tem triggerCategory -> carrinho precisa ter categoria trigger
    // 3) se não tiver nada, aplica direto
    const linesToCheck = cartLines || [];

    const hasTrigger =
      (csvToIds(pr.triggerProductIds).length > 0 && cartHasTrigger(pr, linesToCheck)) ||
      (!!pr.triggerCategory && cartHasTrigger(pr, linesToCheck)) ||
      (csvToIds(pr.triggerProductIds).length === 0 && !pr.triggerCategory);

    // fallback: se não passaram cartLines (ex: cálculo isolado), permite aplicar se o produto atual é o gatilho
    const productIsTrigger =
      csvToIds(pr.triggerProductIds).includes(Number(prod?.id)) ||
      (!!pr.triggerCategory && String(prod?.category) === String(pr.triggerCategory));

    if (!hasTrigger && !productIsTrigger) continue;

    const fp = Number(pr.fixedPrice || 0);
    if (fp > 0) return fp;
  }

  return base;
}


function computeUnitFromProductAndOptions(cartItem: any) {
  // ✅ Fonte da verdade: unitPrice salvo no carrinho (RAW).
  // Isso evita recalcular e evita a promoção “vazar” pra outro item.
  const saved = Number(cartItem.unitPrice ?? 0);
  if (saved > 0) return saved;

  // fallback (carrinhos antigos / itens sem unitPrice)
  const prod = getProductById(Number(cartItem.productId));
  if (!prod) return 0;

  // base do produto (se tiver promo própria do produto, aplica aqui)
  const base = isProductPromoActive(prod)
    ? moneyToNumber(prod.promoPrice)
    : Number(prod.price || 0);

  const selectedIds = (cartItem.optionIds || cartItem.optionItemIds || []).map(Number);
  const selectedSet = new Set(selectedIds);

  let addons = 0;

  for (const g of prod.optionGroups || []) {
    if (g.available === false) continue;

    const selectedInGroup = (g.items || []).filter((it: any) => selectedSet.has(Number(it.id)));
    if (!selectedInGroup.length) continue;

    const prices = selectedInGroup.map((it: any) => getAdjustedOptionPrice(it, prod, items));
    const mode = String(g.chargeMode || "SUM").toUpperCase();

    let groupAdd = 0;
    if (mode === "MAX") groupAdd = Math.max(...prices);
    else if (mode === "MIN") groupAdd = Math.min(...prices);
    else groupAdd = prices.reduce((a: number, b: number) => a + b, 0);

    addons += groupAdd;
  }

  return Number((base + addons).toFixed(2));
}





function cartHasTrigger(promo: any, cartItems: any[]) {
  const triggerIds = csvToIds(promo.triggerProductIds);

  if (triggerIds.length > 0) {
    return cartItems.some((it: any) => triggerIds.includes(Number(it.productId)));
  }

  if (promo.triggerCategory) {
    // ✅ tenta pelo que foi salvo no carrinho
    const bySavedCategory = cartItems.some((it: any) => String(it.productCategory) === String(promo.triggerCategory));
    if (bySavedCategory) return true;

    // fallback antigo
    return cartItems.some((it: any) => {
      const prod = getProductById(Number(it.productId));
      return prod?.category === promo.triggerCategory;
    });
  }

  return false;
}


function cartItemIsTrigger(promo: any, cartItem: any) {
  const pid = Number(cartItem.productId);

  // ✅ prioridade total pra gatilho por produto (IDs)
  const triggerIds = csvToIds(promo.triggerProductIds);
  if (triggerIds.length > 0) {
    return triggerIds.includes(pid);
  }

  // fallback: gatilho por categoria só quando NÃO houver IDs
  if (promo.triggerCategory) {
    const prod = getProductById(pid);
    if (prod && String(prod.category) === String(promo.triggerCategory)) {
      return true;
    }
  }

  return false;
}

function promoTargetsItem(promo: any, cartItem: any) {
  // 🚫 NUNCA aplicar recompensa no gatilho
  if (cartItemIsTrigger(promo, cartItem)) return false;

  const pid = Number(cartItem.productId);

  // reward por produto
  const rewardIds = csvToIds(promo.rewardProductIds);
  if (rewardIds.length > 0) {
    return rewardIds.includes(pid);
  }

  // reward por categoria
  if (promo.rewardCategory) {
    const prod = getProductById(pid);
    if (!prod) return false;
    return String(prod.category) === String(promo.rewardCategory);
  }

  return false;
}











// ✅ calcula preço exibido no carrinho (aplica 1 grátis)

  function computeCartDisplay(items: any[]) {
  const lines = items.map((it) => ({ ...it }));

  const baseUnit = (it: any) => computeUnitFromProductAndOptions(it);

  // subtotal sem promo (pra calcular economia)
  let baseSubtotal = 0;

  for (const it of lines) {
    const unit = baseUnit(it);
    const tot = Number((unit * Number(it.qty || 1)).toFixed(2));

    it.__baseUnit = unit;
    it.__baseTotal = tot;

    it.__displayUnit = unit;
    it.__displayTotal = tot;

    it.__promoLabel = null;
    it.__promoFreeQty = 0;

    baseSubtotal += tot;
  }

  const promoNotes: string[] = [];

  for (const pr of (promos || [])) {
    if (!pr?.active) continue;
    if (!cartHasTrigger(pr, lines)) continue;

    // alvos
    const targets = lines.filter((it) => promoTargetsItem(pr, it));
    if (targets.length === 0) continue;

    // ✅ DISCOUNT_PERCENT
    if (pr.rewardType === "DISCOUNT_PERCENT") {
      const pct = Number(pr.discountPercent || 0);
      if (pct <= 0) continue;

      for (const it of targets) {
        const newUnit = Number((it.__baseUnit * (100 - pct) / 100).toFixed(2));
        it.__displayUnit = newUnit;
        it.__displayTotal = Number((newUnit * Number(it.qty || 1)).toFixed(2));
        it.__promoLabel = `🔥 ${pct}% OFF (${pr.name})`;
      }

      promoNotes.push(`${pr.name} (${pct}% OFF)`);
      continue;
    }

    // ✅ FIXED_PRICE
    if (pr.rewardType === "FIXED_PRICE") {
      const fp = Number(pr.fixedPrice || 0);
      if (fp <= 0) continue;

      for (const it of targets) {
        it.__displayUnit = Number(fp.toFixed(2));
        it.__displayTotal = Number((it.__displayUnit * Number(it.qty || 1)).toFixed(2));
        it.__promoLabel = `🔥 Preço fixo ${formatBRL(fp)} (${pr.name})`;
      }

      promoNotes.push(`${pr.name} (fixo)`);
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

        if (freeQty === q) {
          it.__displayUnit = 0;
          it.__displayTotal = 0;
        } else {
          it.__displayUnit = it.__baseUnit;
          it.__displayTotal = Number((it.__baseUnit * (q - freeQty)).toFixed(2));
        }

        it.__promoFreeQty = freeQty;
        it.__promoLabel = `🎁 ${freeQty} grátis (${pr.name})`;

        remainingFree -= freeQty;
      }

      promoNotes.push(`${pr.name} (brinde)`);
      continue;
    }

    // ✅ OPTION_FREE (borda grátis)
// Regra: com gatilho no carrinho, se o item tem UMA borda elegível, zera o preço dela
// ✅ OPTION_FREE (borda grátis) — aqui é SÓ label (o desconto já foi aplicado em getAdjustedOptionPrice)
if (pr.rewardType === "OPTION_FREE") {
  const freeBorderIds = csvToIds(pr.rewardOptionItemIds);
  if (freeBorderIds.length === 0) continue;

  for (const it of lines) {
    const selectedIds = (it.optionIds || it.optionItemIds || []).map(Number);
    if (selectedIds.length === 0) continue;

    const prod = getProductById(Number(it.productId));
    if (!prod) continue;

    // acha qual borda foi escolhida (grupo "borda")
    let pickedBorder: any = null;

    for (const g of (prod.optionGroups || [])) {
      const title = String(g.title || "").toLowerCase();
      if (!title.includes("borda")) continue;

      for (const opt of (g.items || [])) {
        const oid = Number(opt.id);
        if (selectedIds.includes(oid)) {
          pickedBorder = opt;
          break;
        }
      }
      if (pickedBorder) break;
    }

    if (!pickedBorder) continue;

    if (freeBorderIds.includes(Number(pickedBorder.id))) {
      it.__promoLabel = `🎁 Borda grátis: ${pickedBorder.name} (${pr.name})`;
      promoNotes.push(`${pr.name} (borda grátis)`);
    }
  }

  continue;
}






    // OPTION_FREE: deixamos pro próximo passo (borda grátis)
  }

  const subtotal = lines.reduce((acc, it) => acc + Number(it.__displayTotal || 0), 0);
  const promoSubtotal = Number(subtotal.toFixed(2));
  const economy = Number((baseSubtotal - promoSubtotal).toFixed(2));

  return {
    lines,
    subtotal: promoSubtotal,
    baseSubtotal: Number(baseSubtotal.toFixed(2)),
    economy: economy > 0 ? economy : 0,
    promoNotes,
  };
}





  async function handleFinish() {
    if (!customerName.trim()) return alert("Digite seu nome.");
    if (!phone.trim()) return alert("Digite seu telefone.");

    if (deliveryMode === "DELIVERY") {
      if (!selectedBairroId) return alert("Selecione o Bairro.");
      if (!rua.trim() || !numero.trim()) return alert("Preencha o endereço.");
    }

    if (paymentMethod === "MONEY") {
      const val = Number(changeFor.replace(",", "."));
      if (changeFor && val < finalTotal) return alert("Troco inválido.");
    }


    const nomeBairro = bairroObj?.name || "";
    const addressFull = deliveryMode === "DELIVERY" ? `${rua}, ${numero} - ${nomeBairro}` : "Retirada";
    const payLabel = paymentMethod === "MONEY" && changeFor ? `Dinheiro (Troco p/ ${changeFor})` : paymentMethod;

    const payload = {
      origin: "APP_DELIVERY",
      customerName,
      customerPhone: phone,
      customerAddress: addressFull,
      isTakeout: deliveryMode === "TAKEOUT",
      deliveryFee: taxaEntrega,
      paymentMethod: payLabel,
      items: items.map((it) => ({
        productId: it.productId,
        quantity: it.qty,
        optionItemIds: it.optionIds || [],
        observation: it.notes || "",
      })),
    };

    try {
      const newOrder = await createOrder(payload);
      sendToWhatsApp(newOrder.idString, addressFull, payLabel);
      clear();
      setStep("CART");
      onClose();
      navigate(`/acompanhar/${newOrder.idString}`);
    } catch (e) {
      alert("Erro ao enviar pedido.");
    }
  }
  


  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        height: "100dvh", // ✅ evita pulo no mobile
        background: "rgba(0,0,0,0.6)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 10,
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: "min(450px, 100%)",
          maxHeight: "90dvh", // ✅
          background: THEME.bg,
          borderRadius: 24,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px rgba(0,0,0,0.2)",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            background: "white",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${THEME.border}`,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, color: THEME.textDark }}>
            {step === "CART" ? "Sua Sacola" : "Finalizar Pedido"}
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 24, color: "#999", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* CONTEÚDO */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 20,
            paddingBottom: footerH, // ✅ aqui resolve o “passando”
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          {step === "CART" && (
            <>
              {items.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, opacity: 0.6 }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🛍️</div>
                  <p>Sua sacola está vazia.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                  {cartView.lines.map((it: any, idx: number) => (

                    <div
                      key={idx}
                      style={{
                        background: "white",
                        borderRadius: 16,
                        padding: 16,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                      }}
                    >
                      {/* Nome e Preço */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <strong style={{ fontSize: 15, color: THEME.textDark }}>{it.name}</strong>
                        <strong style={{ fontSize: 15, color: THEME.textDark }}>{formatBRL(Number(it.__displayTotal || 0))}</strong>
                        {Number(it.__displayUnit) === 0 && (
                          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, color: THEME.primary }}>
                            🎁 Item grátis (promoção)
                          </div>
                        )}

                      </div>

                      {/* ✅ LISTA DE OPÇÕES FORMATADA */}
                      {it.optionSummary && (
                        <div style={{ marginBottom: 10, padding: "8px", background: "#f8f9fa", borderRadius: 8, fontSize: 12 }}>
                          {it.optionSummary.split(" | ").map((opt: string, i: number) => (
                            <div key={i} style={{ marginBottom: 4, color: THEME.textGray }}>
                              {opt.includes(":") ? (
                                <>
                                  <span style={{ fontWeight: "bold", color: "#2d3436" }}>{opt.split(":")[0]}:</span>
                                  {opt.split(":")[1]}
                                </>
                              ) : (
                                <span>• {opt}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Obs */}
                      {it.notes && (
                        <div style={{ fontSize: 12, color: "#d63031", background: "#fff0f0", padding: "6px 10px", borderRadius: 6, marginBottom: 12 }}>
                          <strong>Obs:</strong> {it.notes}
                        </div>
                      )}

                      {it.__promoLabel && (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              fontWeight: 900,
                              color: THEME.primary,
                              background: "rgba(0,184,148,0.10)",
                              border: "1px solid rgba(0,184,148,0.18)",
                              padding: "6px 10px",
                              borderRadius: 10,
                              width: "fit-content",
                              maxWidth: "100%",
                            }}
                          >
                            {it.__promoLabel}
                          </div>
                        )}



                      {/* Botões */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${THEME.bg}`, paddingTop: 12 }}>
                        <button
                          onClick={() => removeItem(it.productId, it.optionSummary)}
                          style={{ color: THEME.danger, background: "none", border: "none", fontWeight: "bold", fontSize: 12, cursor: "pointer" }}
                        >
                          Remover
                        </button>
                        <div style={{ display: "flex", alignItems: "center", background: "#f1f2f6", borderRadius: 8 }}>
                          <button
                            onClick={() => setQty(it.productId, it.optionSummary, Math.max(1, it.qty - 1))}
                            style={{ padding: "4px 12px", border: "none", background: "transparent", cursor: "pointer" }}
                          >
                            -
                          </button>
                          <span style={{ fontSize: 13, fontWeight: "bold", minWidth: 20, textAlign: "center" }}>{it.qty}</span>
                          <button
                            onClick={() => setQty(it.productId, it.optionSummary, it.qty + 1)}
                            style={{ padding: "4px 12px", border: "none", background: "transparent", cursor: "pointer" }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "DETAILS" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              <button
                onClick={() => setStep("CART")}
                style={{ alignSelf: "flex-start", background: "none", border: "none", color: THEME.textGray, cursor: "pointer", fontSize: 13 }}
              >
                ← Voltar para itens
              </button>

              <div style={{ background: "white", padding: 5, borderRadius: 12, display: "flex", border: `1px solid ${THEME.border}` }}>
                <button
                  onClick={() => setDeliveryMode("DELIVERY")}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 8,
                    border: "none",
                    background: deliveryMode === "DELIVERY" ? "#e6fffa" : "transparent",
                    color: deliveryMode === "DELIVERY" ? THEME.primary : "#999",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  🛵 Entrega
                </button>
                <button
                  onClick={() => setDeliveryMode("TAKEOUT")}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 8,
                    border: "none",
                    background: deliveryMode === "TAKEOUT" ? "#e6fffa" : "transparent",
                    color: deliveryMode === "TAKEOUT" ? THEME.primary : "#999",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  🥡 Retirada
                </button>
              </div>

              <div style={{ background: "white", padding: 16, borderRadius: 16 }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>Seus Dados</h4>
                <input placeholder="Seu Nome" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={inputStyle} />
                <input placeholder="Seu Telefone (WhatsApp)" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...inputStyle, marginTop: 10 }} />
              </div>

              {deliveryMode === "DELIVERY" && (
                <div style={{ background: "white", padding: 16, borderRadius: 16 }}>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>Endereço</h4>
                  <select value={selectedBairroId} onChange={(e) => setSelectedBairroId(e.target.value)} style={{ ...inputStyle, background: "white" }}>
                    <option value="">Selecione o Bairro...</option>
                    {bairros.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (+ {formatBRL(b.price)})
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 10, marginTop: 10 }}>
                    <input placeholder="Rua / Av" value={rua} onChange={(e) => setRua(e.target.value)} style={inputStyle} />
                    <input placeholder="Nº" value={numero} onChange={(e) => setNumero(e.target.value)} style={inputStyle} />
                  </div>
                </div>
              )}

              <div style={{ background: "white", padding: 16, borderRadius: 16 }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>Pagamento</h4>
                <div style={{ display: "flex", gap: 8 }}>
                  {["PIX", "CARD", "MONEY"].map((m) => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 8,
                        border: `1px solid ${paymentMethod === m ? "#fab1a0" : THEME.border}`,
                        background: paymentMethod === m ? "#fff0e6" : "white",
                        color: paymentMethod === m ? "#d63031" : "#666",
                        fontWeight: "bold",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {m === "MONEY" ? "Dinheiro" : m === "CARD" ? "Cartão" : "Pix"}
                    </button>
                  ))}
                </div>
                {paymentMethod === "MONEY" && (
                  <input placeholder="Troco para quanto?" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} style={{ ...inputStyle, marginTop: 10 }} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div ref={footerRef} style={{ background: "white", padding: 20, borderTop: `1px solid ${THEME.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 13, color: THEME.textGray }}>
            <span>Subtotal</span>
            <span>{formatBRL(cartView.subtotal)}</span>
          </div>

            {cartView.economy > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 13, color: THEME.primary, fontWeight: 900 }}>
                <span>Promoções</span>
                <span>- {formatBRL(cartView.economy)}</span>
              </div>
            )}
            {cartView.promoNotes?.length > 0 && (
              <div style={{ marginBottom: 10, fontSize: 12, color: THEME.textGray }}>
                {cartView.promoNotes.slice(0, 2).map((t: string, i: number) => (
                  <div key={i}>• {t}</div>
                ))}
              </div>
            )}



          {step === "DETAILS" && deliveryMode === "DELIVERY" && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 13, color: THEME.danger }}>
              <span>Taxa de Entrega</span>
              <span>{formatBRL(taxaEntrega)}</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 15, fontSize: 20, fontWeight: "900", color: THEME.textDark }}>
            <span>TOTAL</span>
            <span>{formatBRL(finalTotal)}</span>
          </div>

          <button
            onClick={() => (step === "CART" ? setStep("DETAILS") : handleFinish())}
            disabled={items.length === 0 || isLoading}
            style={{
              width: "100%",
              padding: 16,
              borderRadius: 14,
              border: "none",
              background: THEME.primary,
              color: "white",
              fontSize: 16,
              fontWeight: "800",
              cursor: items.length === 0 || isLoading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 12px rgba(0, 184, 148, 0.3)",
            }}
          >
            {isLoading ? "Enviando..." : step === "CART" ? "Confirmar Itens" : "✅ FINALIZAR PEDIDO"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "87%",
  padding: "11px",
  borderRadius: 10,
  border: "1px solid #dfe6e9",
  background: "#fdfdfd",
  fontSize: 14,
  outline: "none",
};
