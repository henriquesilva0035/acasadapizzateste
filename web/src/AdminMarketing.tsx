import { useEffect, useMemo, useState } from "react";
import { API_URL } from "./config";

type RewardType = "ITEM_FREE" | "OPTION_FREE" | "DISCOUNT_PERCENT" | "FIXED_PRICE";

const THEME = {
  bg: "#f6f7fb",
  card: "#ffffff",
  border: "rgba(0,0,0,0.08)",
  text: "#1f2d3d",
  muted: "#6b7280",
  brand: "#00b894",
  brand2: "#0984e3",
  danger: "#d63031",
  warn: "#e17055",
};

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: any;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? "rgba(0,184,148,0.35)" : "rgba(0,0,0,0.12)"}`,
        background: active ? "rgba(0,184,148,0.12)" : "#fff",
        color: active ? THEME.brand : THEME.text,
        fontWeight: 900,
        fontSize: 12,
        borderRadius: 999,
        padding: "8px 12px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export default function AdminMarketing() {
  const [promocoes, setPromocoes] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  // --- NOVA PROMO ---
  const [nomePromo, setNomePromo] = useState("");
  const [diaSemana, setDiaSemana] = useState("1"); // 0..6
  const [showOnMenu, setShowOnMenu] = useState(true);

  // GATILHO
  const [catGatilho, setCatGatilho] = useState("");
  const [produtosGatilhoSelecionados, setProdutosGatilhoSelecionados] = useState<number[]>([]);
  const [triggerOptionItemIds, setTriggerOptionItemIds] = useState<number[]>([]);

  // RECOMPENSA
  const [rewardType, setRewardType] = useState<RewardType>("ITEM_FREE");
  const [catRecompensa, setCatRecompensa] = useState("");
  const [produtosRecompensaSelecionados, setProdutosRecompensaSelecionados] = useState<number[]>([]);
  const [maxRewardQty, setMaxRewardQty] = useState(1);

  const [valorDesconto, setValorDesconto] = useState(50);
  const [precoFixo, setPrecoFixo] = useState<number>(20);

  // OPTION_FREE (depois vamos transformar em seleção de optionItemId)
  const [textoBordas, setTextoBordas] = useState("");

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    try {
      const resP = await fetch(`${API_URL}/promotions`);
      setPromocoes(await resP.json());

      const resProd = await fetch(`${API_URL}/products`);
      const lista = await resProd.json();
      setProdutos(Array.isArray(lista) ? lista : []);

      const cats = Array.from(new Set((Array.isArray(lista) ? lista : []).map((p: any) => p.category))).filter(Boolean) as string[];
      setCategorias(cats);
    } catch (e) {
      console.log(e);
    }
  }

  function toggleId(listaAtual: number[], setLista: any, id: number) {
    if (listaAtual.includes(id)) setLista(listaAtual.filter((x) => x !== id));
    else setLista([...listaAtual, id]);
  }

  // quando troca gatilho, se ficar com 1 produto selecionado mantém sabores, senão limpa
  useEffect(() => {
    if (produtosGatilhoSelecionados.length !== 1) {
      setTriggerOptionItemIds([]);
    }
  }, [produtosGatilhoSelecionados]);

  const produtosGatilhoFiltrados = useMemo(() => {
    return catGatilho ? produtos.filter((p) => p.category === catGatilho) : [];
  }, [produtos, catGatilho]);

  const produtosRecompensaFiltrados = useMemo(() => {
    return catRecompensa ? produtos.filter((p) => p.category === catRecompensa) : produtos;
  }, [produtos, catRecompensa]);

  const triggerSingleProduct = useMemo(() => {
    if (produtosGatilhoSelecionados.length !== 1) return null;
    const id = produtosGatilhoSelecionados[0];
    return produtos.find((p) => Number(p.id) === Number(id)) || null;
  }, [produtos, produtosGatilhoSelecionados]);

  const triggerFlavorItems = useMemo(() => {
    if (!triggerSingleProduct?.optionGroups) return [];
    const groups = triggerSingleProduct.optionGroups || [];
    // pega grupos que contenham "sabor" no título
    const flavorGroups = groups.filter((g: any) => String(g.title || "").toLowerCase().includes("sabor"));
    const items = flavorGroups.flatMap((g: any) => (g.items || []).map((it: any) => ({ ...it, __groupTitle: g.title })));
    return items;
  }, [triggerSingleProduct]);

  async function criarPromocao() {
    if (!nomePromo.trim()) return alert("Dê um nome para a promoção!");

    // gatilho
    if (!catGatilho && produtosGatilhoSelecionados.length === 0) {
      return alert("Selecione uma categoria ou produtos no gatilho.");
    }

    // valida preço fixo / desconto
    if (rewardType === "DISCOUNT_PERCENT") {
      if (!(valorDesconto > 0 && valorDesconto <= 100)) return alert("Informe um desconto válido (1 a 100).");
    }
    if (rewardType === "FIXED_PRICE") {
      if (!(precoFixo >= 0)) return alert("Informe um preço fixo válido.");
    }

    // valida reward
    if (rewardType === "OPTION_FREE") {
      if (!textoBordas.trim()) return alert("Digite as bordas grátis!");
      return alert("OPTION_FREE ainda vamos ligar por ID da borda (rapidinho depois).");
    }

    // regra: se for FIXED_PRICE ou DISCOUNT e você não escolheu recompensa,
    // automaticamente aplica NO MESMO PRODUTO do gatilho (quando tiver produto marcado).
    const autoUseTriggerAsReward =
      (rewardType === "FIXED_PRICE" || rewardType === "DISCOUNT_PERCENT") &&
      produtosRecompensaSelecionados.length === 0 &&
      !catRecompensa;

    const payload: any = {
      name: nomePromo,
      daysOfWeek: diaSemana,
      active: true,
      showOnMenu,

      // gatilho
      triggerCategory: catGatilho || undefined,
      triggerProductIds: produtosGatilhoSelecionados.length ? produtosGatilhoSelecionados : undefined,
      triggerOptionItemIds: triggerOptionItemIds.length ? triggerOptionItemIds : undefined,

      // reward
      rewardType,
      rewardCategory: autoUseTriggerAsReward ? undefined : (catRecompensa || undefined),
      rewardProductIds: autoUseTriggerAsReward
        ? (produtosGatilhoSelecionados.length ? produtosGatilhoSelecionados : undefined)
        : (produtosRecompensaSelecionados.length ? produtosRecompensaSelecionados : undefined),

      discountPercent: rewardType === "DISCOUNT_PERCENT" ? Number(valorDesconto) : undefined,
      fixedPrice: rewardType === "FIXED_PRICE" ? Number(precoFixo) : undefined,
      maxRewardQty: Number(maxRewardQty || 1),
    };

    console.log("CRIANDO PROMOÇÃO:", payload);

    const res = await fetch(`${API_URL}/promotions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      alert("Promoção criada! 🚀");
      setNomePromo("");
      setDiaSemana("1");
      setCatGatilho("");
      setProdutosGatilhoSelecionados([]);
      setTriggerOptionItemIds([]);
      setRewardType("ITEM_FREE");
      setCatRecompensa("");
      setProdutosRecompensaSelecionados([]);
      setValorDesconto(50);
      setPrecoFixo(20);
      setMaxRewardQty(1);
      setShowOnMenu(true);
      carregarDados();
    } else {
      let err: any = null;
      try {
        err = await res.json();
      } catch {}
      alert("Erro ao criar: " + (err?.details || err?.error || "Erro desconhecido"));
    }
  }

  async function excluirPromo(id: number) {
    if (!confirm("Apagar regra?")) return;
    await fetch(`${API_URL}/promotions/${id}`, { method: "DELETE" });
    carregarDados();
  }

  return (
    <div style={{ background: THEME.bg, minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, color: THEME.text, fontSize: 22, fontWeight: 1000 }}>📢 Marketing</h1>
            <div style={{ marginTop: 4, color: THEME.muted, fontWeight: 700, fontSize: 13 }}>
              Crie promoções do dia (item grátis, desconto %, preço fixo).
            </div>
          </div>
        </div>

        {/* CARD CRIAR */}
        <div
          style={{
            marginTop: 18,
            background: THEME.card,
            border: `1px solid ${THEME.border}`,
            borderRadius: 16,
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 18, borderBottom: `1px solid ${THEME.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 1000, color: THEME.warn }}>✨ Criar Nova Regra</div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900, color: THEME.muted, fontSize: 12 }}>
              Mostrar no cardápio
              <input type="checkbox" checked={showOnMenu} onChange={(e) => setShowOnMenu(e.target.checked)} />
            </label>
          </div>

          <div style={{ padding: 18, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted }}>Nome</div>
              <input
                value={nomePromo}
                onChange={(e) => setNomePromo(e.target.value)}
                placeholder="Ex: Segunda Pizza M por 20 reais"
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: `1px solid ${THEME.border}`,
                  outline: "none",
                  fontWeight: 800,
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted }}>Dia</div>
              <select
                value={diaSemana}
                onChange={(e) => setDiaSemana(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: `1px solid ${THEME.border}`,
                  outline: "none",
                  fontWeight: 800,
                }}
              >
                <option value="1">Segunda</option>
                <option value="2">Terça</option>
                <option value="3">Quarta</option>
                <option value="4">Quinta</option>
                <option value="5">Sexta</option>
                <option value="6">Sábado</option>
                <option value="0">Domingo</option>
              </select>
            </div>

            {/* GATILHO */}
            <div style={{ gridColumn: "1 / -1", background: "rgba(0,0,0,0.03)", border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontWeight: 1000, color: THEME.text }}>🛒 Se comprar...</div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 6 }}>Categoria do gatilho</div>
                <select
                  value={catGatilho}
                  onChange={(e) => setCatGatilho(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: `1px solid ${THEME.border}`,
                    outline: "none",
                    fontWeight: 800,
                    background: "#fff",
                  }}
                >
                  <option value="">-- selecione --</option>
                  {categorias.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {catGatilho && (
                <div style={{ marginTop: 12, background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 1000, color: THEME.muted, marginBottom: 8 }}>
                    Produtos do gatilho (se não marcar nenhum, vale a categoria toda)
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    {produtosGatilhoFiltrados.map((p: any) => {
                      const active = produtosGatilhoSelecionados.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 10px",
                            borderRadius: 12,
                            border: `1px solid ${active ? "rgba(0,184,148,0.35)" : THEME.border}`,
                            background: active ? "rgba(0,184,148,0.10)" : "#fff",
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleId(produtosGatilhoSelecionados, setProdutosGatilhoSelecionados, p.id)}
                          />
                          <span style={{ fontSize: 13 }}>{p.name}</span>
                        </label>
                      );
                    })}
                  </div>

                  {/* SABORES (somente quando 1 produto gatilho marcado) */}
                  {produtosGatilhoSelecionados.length === 1 && triggerFlavorItems.length > 0 && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${THEME.border}` }}>
                      <div style={{ fontWeight: 1000, color: THEME.text, marginBottom: 6 }}>
                        🍕 Limitar por Sabores (opcional)
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: THEME.muted, marginBottom: 10 }}>
                        Marcou <b>1 produto</b> (ex: Pizza M). Agora você pode escolher quais sabores entram na promoção.
                        <br />
                        Se não marcar nenhum sabor, vale para qualquer sabor desse produto.
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                        {triggerFlavorItems.map((it: any) => {
                          const active = triggerOptionItemIds.includes(it.id);
                          return (
                            <label
                              key={it.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "10px 10px",
                                borderRadius: 12,
                                border: `1px solid ${active ? "rgba(9,132,227,0.35)" : THEME.border}`,
                                background: active ? "rgba(9,132,227,0.10)" : "#fff",
                                cursor: "pointer",
                                fontWeight: 900,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={active}
                                onChange={() => toggleId(triggerOptionItemIds, setTriggerOptionItemIds, it.id)}
                              />
                              <span style={{ fontSize: 13 }}>{it.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {produtosGatilhoSelecionados.length !== 1 && (
                    <div style={{ marginTop: 10, fontSize: 12, color: THEME.muted, fontWeight: 800 }}>
                      💡 Para selecionar sabores, marque <b>apenas 1</b> produto no gatilho.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RECOMPENSA */}
            <div style={{ gridColumn: "1 / -1", background: "rgba(0,184,148,0.06)", border: `1px solid rgba(0,184,148,0.15)`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontWeight: 1000, color: THEME.text }}>🎁 Ele ganha...</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <Chip active={rewardType === "ITEM_FREE"} onClick={() => setRewardType("ITEM_FREE")}>Item grátis</Chip>
                <Chip active={rewardType === "DISCOUNT_PERCENT"} onClick={() => setRewardType("DISCOUNT_PERCENT")}>Desconto %</Chip>
                <Chip active={rewardType === "FIXED_PRICE"} onClick={() => setRewardType("FIXED_PRICE")}>Preço fixo</Chip>
                <Chip active={rewardType === "OPTION_FREE"} onClick={() => setRewardType("OPTION_FREE")}>Borda grátis</Chip>
              </div>

              {/* inputs específicos */}
              {rewardType === "DISCOUNT_PERCENT" && (
                <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted }}>Desconto (%)</div>
                  <input
                    type="number"
                    value={valorDesconto}
                    onChange={(e) => setValorDesconto(Number(e.target.value))}
                    style={{
                      width: 120,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${THEME.border}`,
                      outline: "none",
                      fontWeight: 900,
                    }}
                  />
                </div>
              )}

              {rewardType === "FIXED_PRICE" && (
                <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted }}>Preço fixo (R$)</div>
                  <input
                    type="number"
                    value={precoFixo}
                    onChange={(e) => setPrecoFixo(Number(e.target.value))}
                    style={{
                      width: 160,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${THEME.border}`,
                      outline: "none",
                      fontWeight: 900,
                    }}
                  />
                  <div style={{ fontSize: 12, fontWeight: 800, color: THEME.muted }}>
                    Se não escolher “recompensa”, aplica no <b>mesmo produto</b> do gatilho.
                  </div>
                </div>
              )}

              {rewardType === "ITEM_FREE" && (
                <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted }}>Qtd grátis</div>
                  <input
                    type="number"
                    value={maxRewardQty}
                    min={1}
                    onChange={(e) => setMaxRewardQty(Number(e.target.value))}
                    style={{
                      width: 120,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${THEME.border}`,
                      outline: "none",
                      fontWeight: 900,
                    }}
                  />
                </div>
              )}

              {rewardType === "OPTION_FREE" && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 6 }}>
                    Bordas grátis (texto por enquanto)
                  </div>
                  <input
                    value={textoBordas}
                    onChange={(e) => setTextoBordas(e.target.value)}
                    placeholder="Ex: Catupiry, Cheddar"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${THEME.border}`,
                      outline: "none",
                      fontWeight: 900,
                    }}
                  />
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: THEME.muted }}>
                    Depois vamos trocar isso por seleção direta das bordas (por ID).
                  </div>
                </div>
              )}

              {/* seleção de recompensa (exceto OPTION_FREE) */}
              {rewardType !== "OPTION_FREE" && (
                <div style={{ marginTop: 14, background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, fontWeight: 1000, color: THEME.muted }}>
                      {rewardType === "ITEM_FREE" ? "Qual produto o cliente ganha?" : "Em quais produtos aplica?"}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 6 }}>Filtrar por categoria</div>
                    <select
                      value={catRecompensa}
                      onChange={(e) => setCatRecompensa(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${THEME.border}`,
                        outline: "none",
                        fontWeight: 800,
                        background: "#fff",
                      }}
                    >
                      <option value="">-- todas --</option>
                      {categorias.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                    {produtosRecompensaFiltrados.map((p: any) => {
                      const active = produtosRecompensaSelecionados.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 10px",
                            borderRadius: 12,
                            border: `1px solid ${active ? "rgba(0,184,148,0.35)" : THEME.border}`,
                            background: active ? "rgba(0,184,148,0.10)" : "#fff",
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                        >
                          <input type="checkbox" checked={active} onChange={() => toggleId(produtosRecompensaSelecionados, setProdutosRecompensaSelecionados, p.id)} />
                          <span style={{ fontSize: 13 }}>{p.name}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, color: THEME.muted, fontWeight: 800 }}>
                    💡 Dica: se for <b>Preço fixo</b> ou <b>Desconto %</b> e você não marcar recompensa, o sistema aplica no <b>mesmo produto do gatilho</b>.
                  </div>
                </div>
              )}
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={criarPromocao}
                style={{
                  padding: "14px 16px",
                  borderRadius: 14,
                  border: "none",
                  background: THEME.warn,
                  color: "#fff",
                  fontWeight: 1000,
                  cursor: "pointer",
                  boxShadow: "0 10px 22px rgba(225,112,85,0.25)",
                }}
              >
                Criar regra 🚀
              </button>
            </div>
          </div>
        </div>

        {/* LISTA */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 1000, color: THEME.text, marginBottom: 8 }}>📜 Regras ativas</div>

          <div style={{ display: "grid", gap: 10 }}>
            {promocoes.map((p: any) => (
              <div
                key={p.id}
                style={{
                  background: THEME.card,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 14,
                  padding: 14,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 1000, color: THEME.text }}>{p.name}</div>
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: THEME.muted }}>
                    Tipo: <b>{p.rewardType}</b> • Dias: <b>{p.daysOfWeek}</b> • Mostrar no cardápio: <b>{p.showOnMenu ? "sim" : "não"}</b>
                  </div>
                </div>

                <button
                  onClick={() => excluirPromo(p.id)}
                  style={{
                    border: "none",
                    background: "rgba(214,48,49,0.10)",
                    color: THEME.danger,
                    fontWeight: 1000,
                    borderRadius: 12,
                    padding: "10px 12px",
                    cursor: "pointer",
                  }}
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
