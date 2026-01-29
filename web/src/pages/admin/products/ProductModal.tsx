import React, { useEffect, useMemo, useState } from "react";
import { apiFetch, API_URL } from "../../../lib/api";



type Category = { id: number; name: string };


type ChargeMode = "SUM" | "MAX" | "MIN";

export type OptionItem = {
  id?: number;
  name: string;
  price: number;
  description?: string | null;
  imageUrl?: string | null;
  available: boolean;
};

export type OptionGroup = {
  id?: number;
  title: string;
  min: number;
  max: number;
  chargeMode: ChargeMode;
  available: boolean;
  items: OptionItem[];
};

export type ProductForm = {
  id?: number;
  name: string;
  description?: string | null;
  price: number;
  promoPrice?: number | null;
  note: string;
  promoDays?: string | null;
  image?: string | null;
  category?: string | null;
  available: boolean;
  optionGroups: OptionGroup[];
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  product?: Partial<ProductForm> | null;
  catsVersion: number; 
  onClose: () => void;
  onSaved?: (p: any) => void;
};

function moneyToNumber(v: any) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

async function fileToBase64(file: File): Promise<{ base64: string; contentType: string; fileName: string }> {
  const contentType = file.type || "image/jpeg";
  const fileName = file.name || `img-${Date.now()}.jpg`;

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });

  return { base64, contentType, fileName };
}

/** ✅ NORMALIZA O PRODUTO QUE VEM DA API (chargeRule vs chargeMode etc) */
function normalizeFromApi(p: any): ProductForm {
  const optionGroups = Array.isArray(p?.optionGroups) ? p.optionGroups : [];

  return {
    id: p?.id,
    name: p?.name || "",
    description: p?.description ?? "",
    price: moneyToNumber(p?.price ?? 0),
    promoPrice: p?.promoPrice == null ? null : moneyToNumber(p?.promoPrice),
    note: p?.note ?? "",  
    promoDays: p?.promoDays ?? "",
    image: p?.image ?? "🍔",
    category: p?.category ?? "",
    available: p?.available ?? true,

    optionGroups: optionGroups.map((g: any) => {
      const rawCharge = (g?.chargeMode ?? g?.chargeRule ?? "SUM");
      const cm = String(rawCharge).toUpperCase() as ChargeMode;

      const items = Array.isArray(g?.items) ? g.items : [];
      return {
        id: g?.id,
        title: g?.title || "",
        min: Number(g?.min ?? 0),
        max: Number(g?.max ?? 1),
        chargeMode: (cm === "SUM" || cm === "MAX" || cm === "MIN") ? cm : "SUM",
        available: g?.available ?? true,
        items: items.map((it: any) => ({
          id: it?.id,
          name: it?.name || "",
          price: moneyToNumber(it?.price ?? 0),
          description: it?.description ?? "",
          imageUrl: it?.imageUrl ?? null,
          available: it?.available ?? true,
        })),
      };
    }),
  };
}

export default function ProductModal({ open, mode, product, catsVersion, onClose, onSaved }: Props) {

  const isEdit = mode === "edit";

  const initial: ProductForm = useMemo(() => {
    return normalizeFromApi(product || {});
  }, [product]);

  const [form, setForm] = useState<ProductForm>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);

  // ✅ controla qual opção está “expandida” (pra não ficar tudo aberto feio)
  const [expanded, setExpanded] = useState<{ gi: number; ii: number } | null>(null);

   useEffect(() => {
    if (!open) return;

    (async () => {
      try {
        setLoadingCats(true);
        const data = await apiFetch<Category[]>("/categories");
        setCategories(Array.isArray(data) ? data : []);
      } catch (e) {
        console.log("Erro ao carregar categorias", e);
        setCategories([]);
      } finally {
        setLoadingCats(false);
      }
    })();
  }, [open, catsVersion]);



  useEffect(() => {
    if (!open) return;
    setForm(initial);
    setErr(null);
    setExpanded(null);
  }, [open, initial]);

  if (!open) return null;

  function setField<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addGroup() {
    setForm((prev) => ({
      ...prev,
      optionGroups: [
        ...prev.optionGroups,
        { title: "", min: 0, max: 1, chargeMode: "SUM", available: true, items: [] },
      ],
    }));
  }

  function removeGroup(index: number) {
    setForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.filter((_, i) => i !== index),
    }));
  }

  function updateGroup(index: number, patch: Partial<OptionGroup>) {
    setForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.map((g, i) => (i === index ? { ...g, ...patch } : g)),
    }));
  }

  function addItem(groupIndex: number) {
    setForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.map((g, i) => {
        if (i !== groupIndex) return g;
        return {
          ...g,
          items: [...g.items, { name: "", price: 0, description: "", imageUrl: null, available: true }],
        };
      }),
    }));
  }

  function removeItem(groupIndex: number, itemIndex: number) {
    setForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.map((g, i) => {
        if (i !== groupIndex) return g;
        return { ...g, items: g.items.filter((_, j) => j !== itemIndex) };
      }),
    }));
  }

  function updateItem(groupIndex: number, itemIndex: number, patch: Partial<OptionItem>) {
    setForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.map((g, i) => {
        if (i !== groupIndex) return g;
        return {
          ...g,
          items: g.items.map((it, j) => (j === itemIndex ? { ...it, ...patch } : it)),
        };
      }),
    }));
  }

  async function uploadImage(file: File, folder: string) {
    const { base64, contentType, fileName } = await fileToBase64(file);
    const res = await apiFetch<{ url: string; path: string }>("/upload/base64", {
      method: "POST",
      body: JSON.stringify({ base64, contentType, fileName, folder }),
    });
    return res.url;
  }

  async function handlePickProductImage(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;

    try {
      setSaving(true);
      const url = await uploadImage(file, "products");
      setField("image", url);
    } catch (e: any) {
      alert(e?.message || "Falha no upload da imagem");
    } finally {
      setSaving(false);
    }
  }

  async function handlePickItemImage(gi: number, ii: number, ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;

    try {
      setSaving(true);
      const url = await uploadImage(file, "options");
      updateItem(gi, ii, { imageUrl: url });
    } catch (e: any) {
      alert(e?.message || "Falha no upload da imagem");
    } finally {
      setSaving(false);
    }
  }

  function validate() {
    if (!form.name.trim()) return "Nome do produto é obrigatório";
    if (!form.category?.trim()) return "Categoria é obrigatória";
    if (!Number.isFinite(form.price) || form.price < 0) return "Preço inválido";

    for (const [gi, g] of form.optionGroups.entries()) {
      if (!g.title.trim()) return `Grupo #${gi + 1}: título é obrigatório`;
      if (Number(g.min) < 0) return `Grupo "${g.title}": mínimo inválido`;
      if (Number(g.max) < 0) return `Grupo "${g.title}": máximo inválido`;
      if (Number(g.max) > 0 && Number(g.min) > Number(g.max))
        return `Grupo "${g.title}": min não pode ser maior que max`;

      for (const [ii, it] of g.items.entries()) {
        if (!it.name.trim()) return `Grupo "${g.title}" opção #${ii + 1}: nome é obrigatório`;
        if (!Number.isFinite(it.price) || it.price < 0)
          return `Grupo "${g.title}" opção "${it.name}": preço inválido`;
      }
    }
    return null;
  }

  async function save() {
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }

    setSaving(true);
    setErr(null);

    const payload = {
      name: form.name.trim(),
      description: form.description ?? "",
      price: Number(form.price || 0),
      promoPrice: form.promoPrice == null || form.promoPrice === 0 ? null : Number(form.promoPrice),
      note: (form.note ?? "").trim(),
      promoDays: (form.promoDays ?? "").trim(),
      image: form.image ?? "🍔",
      category: (form.category ?? "OUTROS").trim(),
      available: !!form.available,
      optionGroups: form.optionGroups.map((g) => ({
        title: g.title.trim(),
        min: Number(g.min || 0),
        max: Number(g.max || 1),
        chargeRule: String(g.chargeMode || "SUM").toUpperCase(),
        available: !!g.available,
        items: g.items.map((it) => ({
          name: it.name.trim(),
          price: Number(it.price || 0),
          description: it.description ?? null,
          imageUrl: it.imageUrl ?? null,
          available: !!it.available,
        })),
      })),
    };

    try {
      const saved = isEdit && form.id
        ? await apiFetch(`/products/${form.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch(`/products`, { method: "POST", body: JSON.stringify(payload) });

      onSaved?.(saved);
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar produto");
    } finally {
      setSaving(false);
    }
  }

  const C_RED = "#B30000";
  const C_YELLOW = "#F2B705";
  const C_WHITE = "#FFFFFF";
  const C_DARK = "#1f1f1f";

  // =======================
  // ✅ JSX COMEÇA AQUI
  // =======================
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          maxHeight: "92vh",
          overflow: "auto",
          background: C_WHITE,
          borderRadius: 16,
          boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
          border: `2px solid rgba(179,0,0,0.6)`,
        }}
      >
        {/* Header */}
        <div
          style={{
            background: `linear-gradient(90deg, ${C_RED}, #7a0000)`,
            color: C_WHITE,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            position: "sticky",
            top: 0,
            zIndex: 2,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <strong style={{ fontSize: 16 }}>
              {isEdit ? "✏️ Editar Produto" : "➕ Novo Produto"}
            </strong>
            <span style={{ fontSize: 12, opacity: 0.85 }}>API: {API_URL}</span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: `1px solid rgba(255,255,255,0.25)`,
              color: C_WHITE,
              borderRadius: 12,
              padding: "8px 10px",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Fechar ✖
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16 }}>
          {err && (
            <div
              style={{
                background: "#ffe8e8",
                border: "1px solid #ffb3b3",
                color: "#8a0000",
                padding: 10,
                borderRadius: 12,
                marginBottom: 12,
                fontWeight: 700,
              }}
            >
              {err}
            </div>
          )}

          {/* Produto: campos */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr",
              gap: 14,
              alignItems: "start",
            }}
          >
            <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontWeight: 800, fontSize: 12 }}>Nome</label>
                  <input
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Ex: Pizza GG Calabresa"
                    style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                  />
                </div>

                <div>
                        <label style={{ fontWeight: 800, fontSize: 12 }}>Categoria</label>

                        <select
                          value={form.category ?? ""}
                          onChange={(e) => setField("category", e.target.value)}
                          disabled={loadingCats || categories.length === 0}
                          style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd", background: "white" }}
                        >
                          <option value="" disabled>
                            {loadingCats ? "Carregando..." : "Selecione uma categoria"}
                          </option>

                          {categories.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>

                        {!loadingCats && categories.length === 0 && (
                          <div style={{ marginTop: 6, fontSize: 12, color: "#b00000", fontWeight: 800 }}>
                            Nenhuma categoria cadastrada. Clique em “Nova Categoria”.
                          </div>
                        )}
                      </div>


                <div>
                  <label style={{ fontWeight: 800, fontSize: 12 }}>Preço</label>
                  <input
                    value={String(form.price)}
                    onChange={(e) => setField("price", moneyToNumber(e.target.value))}
                    placeholder="0"
                    style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 800, fontSize: 12 }}>Promo Price</label>
                  <input
                    value={form.promoPrice == null ? "" : String(form.promoPrice)}
                    onChange={(e) => setField("promoPrice", e.target.value ? moneyToNumber(e.target.value) : null)}
                    placeholder="Ex: 29.90"
                    style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 800, fontSize: 12 }}>Promo Days</label>
                  <input
                    value={form.promoDays ?? ""}
                    onChange={(e) => setField("promoDays", e.target.value)}
                    placeholder='Ex: "1,2,3" (0=Dom)'
                    style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontWeight: 800, fontSize: 12 }}>Descrição / Ingredientes</label>
                  <textarea
                    value={form.description ?? ""}
                    onChange={(e) => setField("description", e.target.value)}
                    placeholder="Ex: Molho, mussarela, calabresa..."
                    rows={3}
                    style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd", resize: "vertical" }}
                  />
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!form.available}
                    onChange={(e) => setField("available", e.target.checked)}
                  />
                  <span style={{ fontWeight: 800 }}>
                    {form.available ? "🟢 Disponível" : "🔴 Indisponível"}
                  </span>
                </div>
              </div>
            </div>

            {/* Imagem do produto */}
            <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ color: C_DARK }}>Imagem do produto</strong>
                <label
                  style={{
                    background: C_YELLOW,
                    padding: "8px 10px",
                    borderRadius: 12,
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  Upload
                  <input type="file" accept="image/*" onChange={handlePickProductImage} style={{ display: "none" }} />
                </label>
              </div>

              <div style={{ marginTop: 10 }}>
                <label style={{ fontWeight: 800, fontSize: 12 }}>URL ou Emoji</label>
                <input
                  value={form.image ?? ""}
                  onChange={(e) => setField("image", e.target.value)}
                  placeholder="🍔 ou https://..."
                  style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                />
              </div>

              <div
                style={{
                  marginTop: 10,
                  borderRadius: 14,
                  border: "1px dashed #ddd",
                  padding: 10,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  minHeight: 140,
                  background: "#fafafa",
                }}
              >
                {form.image?.startsWith("http") ? (
                  <img src={form.image} alt="preview" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 14 }} />
                ) : (
                  <div style={{ fontSize: 56 }}>{form.image || "🍔"}</div>
                )}
              </div>

              <small style={{ display: "block", marginTop: 8, opacity: 0.75 }}>
                Upload via <code>/upload/base64</code>
              </small>
            </div>
          </div>

          {/* Option Groups */}
          <div style={{ marginTop: 16, borderTop: "1px solid #eee", paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>🧩 Option Groups</h3>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                  SUM soma tudo · MAX cobra o maior (meio a meio) · MIN cobra o menor
                </div>
              </div>

              <button
                onClick={addGroup}
                style={{
                  background: C_RED,
                  color: C_WHITE,
                  border: "none",
                  borderRadius: 12,
                  padding: "10px 12px",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                ➕ Novo Grupo
              </button>
            </div>

            {form.optionGroups.length === 0 ? (
              <p style={{ opacity: 0.75 }}>Nenhum grupo ainda. Produto simples não precisa.</p>
            ) : (
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                {form.optionGroups.map((g, gi) => (
                  <div
                    key={gi}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 16,
                      padding: 12,
                      background: "#fff",
                    }}
                  >
                    {/* header do grupo */}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>Grupo #{gi + 1}</strong>

                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={!!g.available}
                            onChange={(e) => updateGroup(gi, { available: e.target.checked })}
                          />
                          <span style={{ fontWeight: 900 }}>
                            {g.available ? "🟢 Ativo" : "🔴 Inativo"}
                          </span>
                        </label>

                        <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "#f4f4f4", fontWeight: 800 }}>
                          COBRANÇA: {g.chargeMode}
                        </span>

                        <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "#f4f4f4", fontWeight: 800 }}>
                          SELEÇÃO: {g.min} a {g.max}
                        </span>
                      </div>

                      <button
                        onClick={() => removeGroup(gi)}
                        style={{
                          background: "transparent",
                          border: "1px solid #ff4d4d",
                          color: "#ff4d4d",
                          borderRadius: 12,
                          padding: "8px 10px",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                      >
                        🗑 Remover Grupo
                      </button>
                    </div>

                    {/* campos do grupo */}
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                      <div>
                        <label style={{ fontWeight: 900, fontSize: 12 }}>Título</label>
                        <input
                          value={g.title}
                          onChange={(e) => updateGroup(gi, { title: e.target.value })}
                          placeholder="Ex: Sabores"
                          style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                        />
                      </div>

                      <div>
                        <label style={{ fontWeight: 900, fontSize: 12 }}>Cobrança</label>
                        <select
                          value={g.chargeMode}
                          onChange={(e) => updateGroup(gi, { chargeMode: e.target.value as ChargeMode })}
                          style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                        >
                          <option value="SUM">SUM (Somar)</option>
                          <option value="MAX">MAX (Maior)</option>
                          <option value="MIN">MIN (Menor)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontWeight: 900, fontSize: 12 }}>Mín</label>
                        <input
                          value={String(g.min)}
                          onChange={(e) => updateGroup(gi, { min: Math.max(0, Number(e.target.value || 0)) })}
                          style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                        />
                      </div>

                      <div>
                        <label style={{ fontWeight: 900, fontSize: 12 }}>Máx</label>
                        <input
                          value={String(g.max)}
                          onChange={(e) => updateGroup(gi, { max: Math.max(0, Number(e.target.value || 0)) })}
                          style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                        />
                      </div>
                    </div>

                    {/* opções */}
                    <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>Opções</strong>
                      <button
                        onClick={() => addItem(gi)}
                        style={{
                          background: C_YELLOW,
                          border: "none",
                          borderRadius: 12,
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                      >
                        ➕ Nova Opção
                      </button>
                    </div>

                    {g.items.length === 0 ? (
                      <p style={{ opacity: 0.7, marginTop: 8 }}>Sem opções ainda.</p>
                    ) : (
                      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                        {g.items.map((it, ii) => {
                          const isOpen = expanded?.gi === gi && expanded?.ii === ii;

                          return (
                            <div
                              key={ii}
                              style={{
                                border: "1px solid #eee",
                                borderRadius: 16,
                                padding: 10,
                                background: "#fff",
                              }}
                            >
                              {/* linha compacta */}
                              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.5fr 0.7fr 120px", gap: 10, alignItems: "center" }}>
                                <div>
                                  <label style={{ fontWeight: 900, fontSize: 12 }}>Nome</label>
                                  <input
                                    value={it.name}
                                    onChange={(e) => updateItem(gi, ii, { name: e.target.value })}
                                    placeholder="Ex: Calabresa"
                                    style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                                  />
                                </div>

                                <div>
                                  <label style={{ fontWeight: 900, fontSize: 12 }}>Preço</label>
                                  <input
                                    value={String(it.price)}
                                    onChange={(e) => updateItem(gi, ii, { price: moneyToNumber(e.target.value) })}
                                    style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                                  />
                                </div>

                                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 18 }}>
                                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <input
                                      type="checkbox"
                                      checked={!!it.available}
                                      onChange={(e) => updateItem(gi, ii, { available: e.target.checked })}
                                    />
                                    <span style={{ fontWeight: 900 }}>
                                      {it.available ? "ATIVO" : "OFF"}
                                    </span>
                                  </label>
                                </div>

                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
                                  <button
                                    onClick={() => setExpanded(isOpen ? null : { gi, ii })}
                                    style={{
                                      background: "rgba(0,0,0,0.05)",
                                      border: "1px solid #ddd",
                                      borderRadius: 12,
                                      padding: "8px 10px",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                    }}
                                  >
                                    {isOpen ? "Fechar" : "Detalhes"}
                                  </button>

                                  <button
                                    onClick={() => removeItem(gi, ii)}
                                    style={{
                                      background: "transparent",
                                      border: "1px solid #ff4d4d",
                                      color: "#ff4d4d",
                                      borderRadius: 12,
                                      padding: "8px 10px",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                    }}
                                  >
                                    🗑
                                  </button>
                                </div>
                              </div>

                              {/* detalhes expansíveis */}
                              {isOpen && (
                                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
                                  <div>
                                    <label style={{ fontWeight: 900, fontSize: 12 }}>Ingredientes / descrição</label>
                                    <textarea
                                      value={it.description ?? ""}
                                      onChange={(e) => updateItem(gi, ii, { description: e.target.value })}
                                      placeholder="Ex: mussarela, calabresa..."
                                      rows={2}
                                      style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd", resize: "vertical" }}
                                    />
                                  </div>

                                  <div style={{ border: "1px solid #eee", borderRadius: 16, padding: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                      <strong style={{ fontSize: 12 }}>Foto da opção</strong>
                                      <label
                                        style={{
                                          background: C_YELLOW,
                                          padding: "6px 10px",
                                          borderRadius: 12,
                                          cursor: "pointer",
                                          fontWeight: 900,
                                          fontSize: 12,
                                        }}
                                      >
                                        Upload
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(e) => handlePickItemImage(gi, ii, e)}
                                          style={{ display: "none" }}
                                        />
                                      </label>
                                    </div>

                                    <input
                                      value={it.imageUrl ?? ""}
                                      onChange={(e) => updateItem(gi, ii, { imageUrl: e.target.value })}
                                      placeholder="https://..."
                                      style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd", marginTop: 8 }}
                                    />

                                    <div
                                      style={{
                                        marginTop: 8,
                                        borderRadius: 14,
                                        border: "1px dashed #ddd",
                                        padding: 8,
                                        minHeight: 110,
                                        background: "#fafafa",
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                      }}
                                    >
                                      {it.imageUrl ? (
                                        <img src={it.imageUrl} alt="opt" style={{ maxWidth: "100%", maxHeight: 120, borderRadius: 14 }} />
                                      ) : (
                                        <span style={{ opacity: 0.65, fontSize: 12 }}>Sem foto</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 14,
            borderTop: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            background: "#fff",
            position: "sticky",
            bottom: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: "10px 12px",
              cursor: "pointer",
              fontWeight: 900,
            }}
            disabled={saving}
          >
            Cancelar
          </button>

          <button
            onClick={save}
            style={{
              background: C_RED,
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "10px 14px",
              cursor: "pointer",
              fontWeight: 900,
              minWidth: 180,
            }}
            disabled={saving}
          >
            {saving ? "Salvando..." : "Salvar Produto"}
          </button>
        </div>
      </div>
    </div>
  );
  // =======================
  // ✅ JSX TERMINA AQUI
  // =======================
}
