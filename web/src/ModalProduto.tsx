import React, { useEffect, useMemo, useRef, useState } from "react";

type OptionItem = {
  id: number;
  name: string;
  price: number;
  description?: string | null;
};

type OptionGroup = {
  id: number;
  title: string;
  min: number;
  max: number;
  items: OptionItem[];
};

type Produto = {
  id: number;
  name: string;
  description?: string;
  price: number;
  promoPrice?: number;
  promoDays?: string;
  image?: string;
  category?: string;
  optionGroups?: OptionGroup[];
};

type QuoteItemResult = {
  productId: number;
  product: string;
  category: string;
  quantity: number;
  basePrice: number;
  addonsTotal: number;
  unit: number;
  total: number;
  additions: string;
  flavors: string;
  border: string;
  extras: string;
  pickedItems: Array<{ groupTitle: string; name: string; price: number }>;
};

type QuoteResponse = {
  ok: boolean;
  dow: number;
  itemsTotal: number;
  deliveryFee: number;
  total: number;
  items: QuoteItemResult[];
  error?: string;
};

type Props = {
  selectedProduct: Produto | null;
  onClose: () => void;
  onConfirm: (produto: any, quantity: number, observation: string, adicionais: string) => void;
};

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

function formatMoney(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function lower(s: any) {
  return String(s || "").toLowerCase();
}

function buildAddonsText(pickedItems: Array<{ groupTitle: string; name: string }>) {
  // Mantém compatibilidade com seu layout atual (borda/sabores/adicionais/extras).
  const flavors = pickedItems
    .filter((p) => lower(p.groupTitle).includes("sabor"))
    .map((p) => p.name)
    .join(", ");

  const border = pickedItems
    .filter((p) => lower(p.groupTitle).includes("borda"))
    .map((p) => p.name)
    .join(", ");

  const additions = pickedItems
    .filter((p) => lower(p.groupTitle).includes("adicional") || lower(p.groupTitle).includes("acréscimo") || lower(p.groupTitle).includes("acrescimo"))
    .map((p) => p.name)
    .join(", ");

  const extras = pickedItems
    .filter(
      (p) =>
        !lower(p.groupTitle).includes("sabor") &&
        !lower(p.groupTitle).includes("borda") &&
        !lower(p.groupTitle).includes("adicional") &&
        !lower(p.groupTitle).includes("acréscimo") &&
        !lower(p.groupTitle).includes("acrescimo")
    )
    .map((p) => p.name)
    .join(", ");

  // Texto único que você já usa em algumas telas (ex.: "Catupiry, Bacon")
  const flat = pickedItems.map((p) => p.name).join(", ");

  return { flavors, border, additions, extras, flat };
}

export default function ModalProduto({ selectedProduct, onClose, onConfirm }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [observation, setObservation] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const lastReqId = useRef(0);

  const optionGroups: OptionGroup[] = useMemo(
    () => selectedProduct?.optionGroups ?? [],
    [selectedProduct]
  );

  const itemIdToGroup = useMemo(() => {
    const map = new Map<number, OptionGroup>();
    for (const g of optionGroups) {
      for (const it of g.items || []) map.set(it.id, g);
    }
    return map;
  }, [optionGroups]);

  const selectedPickedItems = useMemo(() => {
    const picked: Array<{ groupTitle: string; name: string; price: number }> = [];
    const sel = new Set(selectedOptions);
    for (const g of optionGroups) {
      for (const it of g.items || []) {
        if (sel.has(it.id)) picked.push({ groupTitle: g.title, name: it.name, price: Number(it.price || 0) });
      }
    }
    return picked;
  }, [selectedOptions, optionGroups]);

  const addonsText = useMemo(() => buildAddonsText(selectedPickedItems), [selectedPickedItems]);

  // Reset quando trocar de produto
  useEffect(() => {
    setQuantity(1);
    setObservation("");
    setSelectedOptions([]);
    setQuote(null);
  }, [selectedProduct?.id]);

  // ====== Validação local (min/max) ======
  const validateMinMax = () => {
    const sel = new Set(selectedOptions);
    for (const g of optionGroups) {
      const count = (g.items || []).filter((it) => sel.has(it.id)).length;
      const min = Number(g.min || 0);
      const max = Number(g.max || 999);
      if (count < min) {
        alert(`Seleção inválida: "${g.title}" exige no mínimo ${min}.`);
        return false;
      }
      if (count > max) {
        alert(`Seleção inválida: "${g.title}" permite no máximo ${max}.`);
        return false;
      }
    }
    return true;
  };

  // ====== Quote no backend (preço 100% confiável) ======
  useEffect(() => {
    if (!selectedProduct?.id) return;

    // Monta payload do quote para 1 item
    const payload = {
      deliveryFee: 0,
      items: [
        {
          productId: selectedProduct.id,
          quantity,
          optionItemIds: selectedOptions,
        },
      ],
    };

    const reqId = ++lastReqId.current;
    setLoadingQuote(true);

    fetch(`${API_URL}/orders/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const data = (await r.json()) as QuoteResponse;
        if (reqId !== lastReqId.current) return; // ignora resposta antiga
        setQuote(data);
      })
      .catch(() => {
        if (reqId !== lastReqId.current) return;
        setQuote(null);
      })
      .finally(() => {
        if (reqId !== lastReqId.current) return;
        setLoadingQuote(false);
      });
  }, [selectedProduct?.id, quantity, selectedOptions]);

  if (!selectedProduct) return null;

  const quoteItem = quote?.items?.[0];

  const displayUnit = quoteItem?.unit ?? Number(selectedProduct.price || 0);
  const displayTotal = quoteItem?.total ?? displayUnit * quantity;

  const toggleOption = (group: OptionGroup, item: OptionItem) => {
    const max = Number(group.max || 999);

    setSelectedOptions((prev) => {
      const inGroup = prev.filter((id) => itemIdToGroup.get(id)?.id === group.id);
      const isSelected = prev.includes(item.id);

      // max == 1 -> vira rádio (somente 1)
      if (max === 1) {
        if (isSelected) {
          // se min > 0, não deixa desmarcar (evita ficar inválido)
          if (Number(group.min || 0) > 0) return prev;
          return prev.filter((id) => itemIdToGroup.get(id)?.id !== group.id);
        }
        // remove outros do grupo e adiciona o atual
        return [...prev.filter((id) => itemIdToGroup.get(id)?.id !== group.id), item.id];
      }

      // max > 1
      if (isSelected) {
        return prev.filter((id) => id !== item.id);
      }

      if (inGroup.length >= max) {
        alert(`"${group.title}" permite no máximo ${max}.`);
        return prev;
      }

      return [...prev, item.id];
    });
  };

  const handleSave = () => {
    if (!validateMinMax()) return;

    // Se o quote voltou com erro, bloqueia (porque backend é a fonte da verdade)
    if (quote && quote.ok === false) {
      alert(quote.error || "Não foi possível calcular o preço no servidor.");
      return;
    }

    // Importante: daqui pra frente o backend vai recalcular tudo no /orders.
    // Mesmo assim, mantemos o price/unit no objeto para compatibilidade com telas antigas.
    const produtoPayload: any = {
      ...selectedProduct,
      price: displayUnit, // unit calculado no backend (ou fallback)
      optionItemIds: selectedOptions,
      // você pode usar isso no painel / impressão / etc
      computed: quoteItem ? { unit: quoteItem.unit, total: quoteItem.total, basePrice: quoteItem.basePrice, addonsTotal: quoteItem.addonsTotal } : null,
    };

    onConfirm(produtoPayload, quantity, observation, addonsText.flat);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: 20,
          borderRadius: 12,
          width: "90%",
          maxWidth: 520,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginBottom: 6 }}>
          {selectedProduct.image ? `${selectedProduct.image} ` : ""}
          {selectedProduct.name}
        </h2>

        {selectedProduct.description ? (
          <p style={{ marginTop: 0, opacity: 0.85 }}>{selectedProduct.description}</p>
        ) : null}

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
          <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>-</button>
          <span style={{ fontSize: 18, minWidth: 30, textAlign: "center" }}>{quantity}</span>
          <button onClick={() => setQuantity((q) => q + 1)}>+</button>

          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {loadingQuote ? "Calculando..." : "Preço (servidor)"}
            </div>
            <div style={{ fontWeight: 700 }}>{formatMoney(displayUnit)}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Total: {formatMoney(displayTotal)}</div>
          </div>
        </div>

        {optionGroups.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h3 style={{ marginBottom: 8 }}>Opções</h3>

            {optionGroups.map((group) => {
              const max = Number(group.max || 999);
              const min = Number(group.min || 0);
              const sel = new Set(selectedOptions);
              const selectedCount = (group.items || []).filter((it) => sel.has(it.id)).length;

              return (
                <div key={group.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{group.title}</strong>
                    <span style={{ fontSize: 12, opacity: 0.75 }}>
                      {min > 0 ? `min ${min}` : "opcional"} • {max === 1 ? "1" : `máx ${max}`} • selecionados {selectedCount}
                    </span>
                  </div>

                  <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                    {(group.items || []).map((item) => {
                      const checked = selectedOptions.includes(item.id);
                      const isRadio = max === 1;

                      return (
                        <label
                          key={item.id}
                          style={{
                            border: "1px solid #eee",
                            borderRadius: 10,
                            padding: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type={isRadio ? "radio" : "checkbox"}
                            checked={checked}
                            onChange={() => toggleOption(group, item)}
                            name={isRadio ? `group-${group.id}` : undefined}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{item.name}</div>
                            {item.description ? (
                              <div style={{ fontSize: 12, opacity: 0.75 }}>{item.description}</div>
                            ) : null}
                          </div>
                          <div style={{ fontWeight: 600 }}>{formatMoney(Number(item.price || 0))}</div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600 }}>Observação</label>
          <textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #eee" }}
            rows={3}
            placeholder="Ex.: sem cebola, bem passado..."
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>

          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#111827",
              color: "#fff",
              cursor: "pointer",
              opacity: loadingQuote ? 0.7 : 1,
            }}
            disabled={loadingQuote}
          >
            Adicionar ({formatMoney(displayTotal)})
          </button>
        </div>

        {quote && quote.ok === false ? (
          <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
            {quote.error || "Erro ao calcular preço no servidor."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
