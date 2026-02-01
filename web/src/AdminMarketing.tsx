import { useEffect, useState } from 'react';
import { API_URL } from './config';

type RewardType = 'ITEM_FREE' | 'OPTION_FREE' | 'DISCOUNT_PERCENT';

export default function AdminMarketing() {
  const [promocoes, setPromocoes] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  // --- DADOS DA NOVA PROMOÇÃO ---
  const [nomePromo, setNomePromo] = useState('');
  const [diaSemana, setDiaSemana] = useState('1'); // "0".."6"

  // GATILHO (SE COMPRAR...)
  const [catGatilho, setCatGatilho] = useState('');
  const [produtosGatilhoSelecionados, setProdutosGatilhoSelecionados] = useState<number[]>([]);

  // RECOMPENSA (ELE GANHA...)
  const [rewardType, setRewardType] = useState<RewardType>('ITEM_FREE');
  const [catRecompensa, setCatRecompensa] = useState('');
  const [produtosRecompensaSelecionados, setProdutosRecompensaSelecionados] = useState<number[]>([]);

  // (por enquanto) bordas por texto — depois a gente troca para ids de optionItems
  const [textoBordas, setTextoBordas] = useState('');
  const [valorDesconto, setValorDesconto] = useState(50);

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    try {
      const resP = await fetch(`${API_URL}/promotions`);
      setPromocoes(await resP.json());

      const resProd = await fetch(`${API_URL}/products`);
      const lista = await resProd.json();
      setProdutos(lista);

      const cats = Array.from(new Set(lista.map((p: any) => p.category))) as string[];
      setCategorias(cats);
    } catch (e) {
      // silencioso por enquanto
    }
  }

  function toggleProduto(listaAtual: number[], setLista: any, idProduto: number) {
    if (listaAtual.includes(idProduto)) {
      setLista(listaAtual.filter((p) => p !== idProduto));
    } else {
      setLista([...listaAtual, idProduto]);
    }
  }

  async function criarPromocao() {
    if (!nomePromo) return alert('Dê um nome para a promoção!');

    if (!catGatilho && produtosGatilhoSelecionados.length === 0) {
      return alert('Selecione uma categoria ou produtos de gatilho.');
    }

    if (rewardType === 'OPTION_FREE') {
      if (!textoBordas.trim()) return alert('Digite as bordas grátis!');
      // Obs: OPTION_FREE definitivo vai ser por ID de optionItem, mas por enquanto vai bloquear aqui
      // para evitar criar uma promo inválida no backend.
      return alert(
        'OPTION_FREE (borda grátis) ainda precisa ser por ID da borda. Já já eu te passo esse ajuste (é rápido).'
      );
    }

    if (produtosRecompensaSelecionados.length === 0 && !catRecompensa) {
      return alert('Selecione produtos ou categoria da recompensa.');
    }

    if (rewardType === 'DISCOUNT_PERCENT' && (!valorDesconto || valorDesconto <= 0)) {
      return alert('Informe o percentual de desconto.');
    }

    const payload: any = {
      name: nomePromo,
      daysOfWeek: diaSemana,
      active: true,

      // GATILHO
      triggerCategory: catGatilho || undefined,
      triggerProductIds: produtosGatilhoSelecionados.length ? produtosGatilhoSelecionados : undefined,

      // RECOMPENSA
      rewardType,
      rewardCategory: catRecompensa || undefined,
      rewardProductIds: produtosRecompensaSelecionados.length ? produtosRecompensaSelecionados : undefined,

      discountPercent: rewardType === 'DISCOUNT_PERCENT' ? valorDesconto : undefined,
      maxRewardQty: 1,
      showOnMenu: true,
    };

    console.log('CRIANDO PROMOÇÃO:', payload);

    const res = await fetch(`${API_URL}/promotions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      alert('Promoção criada! 🚀');
      setNomePromo('');
      setProdutosGatilhoSelecionados([]);
      setProdutosRecompensaSelecionados([]);
      setTextoBordas('');
      carregarDados();
    } else {
      let err: any = null;
      try {
        err = await res.json();
      } catch {}
      alert('Erro ao criar: ' + (err?.details || err?.error || 'Erro desconhecido'));
    }
  }

  async function excluirPromo(id: number) {
    if (!confirm('Apagar regra?')) return;
    await fetch(`${API_URL}/promotions/${id}`, { method: 'DELETE' });
    carregarDados();
  }

  // Filtros visuais para as listas
  const produtosGatilhoFiltrados = catGatilho ? produtos.filter((p) => p.category === catGatilho) : [];
  const produtosRecompensaFiltrados = catRecompensa ? produtos.filter((p) => p.category === catRecompensa) : produtos;

  return (
    <div
      style={{
        padding: '20px',
        maxWidth: '900px',
        margin: '0 auto',
        fontFamily: 'Segoe UI, sans-serif',
        paddingBottom: '100px',
      }}
    >
      <h1 style={{ color: '#2d3436' }}>📢 Gestão de Marketing</h1>

      {/* CRIADOR DE PROMOÇÃO */}
      <div
        style={{
          background: 'white',
          padding: '25px',
          borderRadius: '15px',
          border: '1px solid #ddd',
          boxShadow: '0 5px 15px rgba(0,0,0,0.05)',
          marginBottom: '30px',
        }}
      >
        <h3 style={{ margin: '0 0 20px 0', color: '#e17055', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
          ✨ Criar Nova Regra
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#666' }}>Nome</label>
            <input
              placeholder="Ex: Sábado Pizza G ganha refri"
              value={nomePromo}
              onChange={(e) => setNomePromo(e.target.value)}
              style={{ width: '100%', padding: '10px', marginTop: '5px', border: '1px solid #ddd', borderRadius: '6px' }}
            />
          </div>

          <div>
            <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#666' }}>Dia</label>
            <select
              value={diaSemana}
              onChange={(e) => setDiaSemana(e.target.value)}
              style={{ width: '100%', padding: '10px', marginTop: '5px', border: '1px solid #ddd', borderRadius: '6px' }}
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

          {/* SEÇÃO 1: CONDICIONAL (COMPRA) */}
          <div style={{ gridColumn: '1 / -1', background: '#f1f2f6', padding: '15px', borderRadius: '8px' }}>
            <strong style={{ color: '#2d3436' }}>🛒 SE O CLIENTE COMPRAR...</strong>

            <div style={{ marginTop: '10px' }}>
              <label style={{ fontSize: '12px' }}>1º Selecione a Categoria:</label>

              <select
                value={catGatilho}
                onChange={(e) => setCatGatilho(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', marginBottom: '10px' }}
              >
                <option value="">-- Selecione --</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {catGatilho && (
                <div
                  style={{
                    background: 'white',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                    padding: '10px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#666' }}>
                    Marque quais produtos ativam a regra (pode marcar vários):
                  </div>

                  {produtosGatilhoFiltrados.map((p: any) => (
                    <label key={p.id} style={{ display: 'block', marginBottom: '5px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={produtosGatilhoSelecionados.includes(p.id)}
                        onChange={() => toggleProduto(produtosGatilhoSelecionados, setProdutosGatilhoSelecionados, p.id)}
                      />
                      <span style={{ marginLeft: '8px' }}>{p.name}</span>
                    </label>
                  ))}

                  {produtosGatilhoSelecionados.length === 0 && (
                    <small style={{ color: 'orange' }}>⚠ Se não marcar nenhum, vale para TODOS da categoria.</small>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* SEÇÃO 2: RECOMPENSA (GANHA) */}
          <div style={{ gridColumn: '1 / -1', background: '#dff9fb', padding: '15px', borderRadius: '8px', border: '1px solid #c7ecee' }}>
            <strong style={{ color: '#0984e3' }}>🎁 ELE GANHA...</strong>

            <div style={{ marginTop: '10px', marginBottom: '15px', display: 'flex', gap: '20px' }}>
              <label style={{ cursor: 'pointer' }}>
                <input type="radio" checked={rewardType === 'ITEM_FREE'} onChange={() => setRewardType('ITEM_FREE')} /> Item Grátis
              </label>

              <label style={{ cursor: 'pointer' }}>
                <input type="radio" checked={rewardType === 'OPTION_FREE'} onChange={() => setRewardType('OPTION_FREE')} /> Borda Grátis
              </label>

              <label style={{ cursor: 'pointer' }}>
                <input type="radio" checked={rewardType === 'DISCOUNT_PERCENT'} onChange={() => setRewardType('DISCOUNT_PERCENT')} /> Desconto (%)
              </label>
            </div>

            {rewardType === 'OPTION_FREE' ? (
              <div>
                <small>Digite as bordas grátis (separadas por vírgula):</small>
                <input
                  placeholder="Ex: Catupiry, Cheddar"
                  value={textoBordas}
                  onChange={(e) => setTextoBordas(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #aaa' }}
                />
                <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                  ⚠ Ainda vamos trocar isso para selecionar as bordas por ID (pra funcionar no motor novo).
                </small>
              </div>
            ) : (
              <div>
                <label style={{ fontSize: '12px' }}>Filtre por categoria para achar o prêmio:</label>
                <select
                  value={catRecompensa}
                  onChange={(e) => setCatRecompensa(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', marginBottom: '5px' }}
                >
                  <option value="">-- Todas as Categorias --</option>
                  {categorias.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <div style={{ background: 'white', border: '1px solid #aaa', borderRadius: '6px', padding: '10px', maxHeight: '150px', overflowY: 'auto' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#666' }}>
                    {rewardType === 'DISCOUNT_PERCENT'
                      ? 'Selecione em quais produtos o desconto aplica:'
                      : 'Selecione quais produtos o cliente ganha:'}
                  </div>

                  {produtosRecompensaFiltrados.map((p: any) => (
                    <label key={p.id} style={{ display: 'block', marginBottom: '5px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={produtosRecompensaSelecionados.includes(p.id)}
                        onChange={() => toggleProduto(produtosRecompensaSelecionados, setProdutosRecompensaSelecionados, p.id)}
                      />
                      <span style={{ marginLeft: '8px' }}>{p.name}</span>
                    </label>
                  ))}
                </div>

                {rewardType === 'DISCOUNT_PERCENT' && (
                  <div style={{ marginTop: '10px' }}>
                    <small>Valor do Desconto (%):</small>
                    <input
                      type="number"
                      value={valorDesconto}
                      onChange={(e) => setValorDesconto(Number(e.target.value))}
                      style={{ width: '100px', marginLeft: '10px', padding: '5px' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={criarPromocao}
          style={{
            marginTop: '20px',
            width: '100%',
            padding: '15px',
            background: '#e17055',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          CRIAR REGRA 🚀
        </button>
      </div>

      {/* LISTA */}
      <h3>📜 Regras Ativas</h3>
      <div style={{ display: 'grid', gap: '10px' }}>
        {promocoes.map((p) => (
          <div
            key={p.id}
            style={{
              background: 'white',
              padding: '15px',
              borderRadius: '8px',
              borderLeft: '5px solid #00b894',
              boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <strong style={{ fontSize: '16px' }}>{p.name}</strong>
              <div style={{ fontSize: '13px', color: '#666', marginTop: '5px' }}>
                Tipo: <b>{p.rewardType}</b> <br />
                Dias: {p.daysOfWeek}
              </div>
            </div>

            <button onClick={() => excluirPromo(p.id)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
              EXCLUIR
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
