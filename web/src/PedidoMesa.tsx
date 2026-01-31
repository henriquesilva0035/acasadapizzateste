import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { API_URL } from './config'

export default function PedidoMesa() {
  const { tableId } = useParams()
  const navigate = useNavigate()

  const [produtosDisponiveis, setProdutosDisponiveis] = useState<any[]>([])
  const [filtro, setFiltro] = useState('TODOS')

  // Carrinho local apenas para acumular antes de enviar
  const [carrinho, setCarrinho] = useState<any[]>([])

  // Checkbox de Viagem
  const [isTakeout, setIsTakeout] = useState(false)

  // Modal
  const [itemSelecionado, setItemSelecionado] = useState<any>(null)
  const [showResumo, setShowResumo] = useState(false)
  const [obs, setObs] = useState('')

  // guarda IDs de option items selecionados
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const isFoto = (txt: string) => !!txt && (txt.startsWith('data:image') || txt.startsWith('http'))
  const norm = (s: any) => String(s ?? '').trim().toLowerCase()

  async function fetchProdutos() {
    const r = await fetch(`${API_URL}/products`)
    const data = await r.json()
    // só disponíveis
    setProdutosDisponiveis((data || []).filter((p: any) => p.available))
  }

  // ✅ polling de produtos (produto desativado some sem precisar sair da tela)
  useEffect(() => {
    fetchProdutos().catch(console.error)
    const t = setInterval(() => {
      fetchProdutos().catch(() => {})
    }, 5000) // 5s (pode colocar 3000)
    return () => clearInterval(t)
  }, [])

  // categorias dinâmicas vindo dos produtos
  const categoriasDinamicas = useMemo(() => {
    return Array.from(new Set(produtosDisponiveis.map((p: any) => p.category).filter(Boolean)))
      .map((c) => String(c))
      .sort((a, b) => a.localeCompare(b))
  }, [produtosDisponiveis])

  const CATEGORIAS_REAIS = useMemo(() => ['TODOS', ...categoriasDinamicas], [categoriasDinamicas])

  // ✅ filtro único (sem redeclare)
  const produtosFiltrados = useMemo(() => {
    return produtosDisponiveis.filter((p: any) => {
      if (norm(filtro) === 'todos') return true
      return norm(p.category) === norm(filtro)
    })
  }, [produtosDisponiveis, filtro])

  function abrirModal(produto: any) {
    setItemSelecionado(produto)
    setObs('')
    setSelectedIds(new Set())
  }

  function toggleOption(group: any, item: any) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const isChecked = next.has(item.id)

      if (!isChecked) {
        const selecionadosNoGrupo = (group.items || []).filter((it: any) => next.has(it.id))

        if (selecionadosNoGrupo.length >= group.max) {
          if (group.max === 1) {
            // radio -> troca
            selecionadosNoGrupo.forEach((it: any) => next.delete(it.id))
          } else {
            // checkbox com limite -> bloqueia
            return next
          }
        }
        next.add(item.id)
      } else {
        next.delete(item.id)
      }

      return next
    })
  }

  const podeAdicionar = () => {
    if (!itemSelecionado) return false
    for (const group of itemSelecionado.optionGroups || []) {
      if (!group.available) continue
      const count = (group.items || []).filter((it: any) => selectedIds.has(it.id)).length
      if (count < group.min) return false
    }
    return true
  }

  function adicionarAoCarrinho() {
    if (!podeAdicionar()) return

    const itemFinal = {
      productId: itemSelecionado.id,
      name: itemSelecionado.name,
      quantity: 1,
      optionItemIds: Array.from(selectedIds),
      observation: obs,
    }

    setCarrinho((prev) => [...prev, itemFinal])
    setItemSelecionado(null)
  }

  function removerDoCarrinho(index: number) {
    if (!confirm('Remover este item do pedido?')) return
    const novo = carrinho.filter((_, i) => i !== index)
    setCarrinho(novo)
    if (novo.length === 0) setShowResumo(false)
  }

  async function enviarPedido() {
    if (carrinho.length === 0) return

    const waiterName = localStorage.getItem(`atendente_mesa_${tableId}_nome`)

    const res = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: Number(tableId),
        waiterName: waiterName || 'Garçom',
        origin: 'LOCAL',
        items: carrinho,
        isTakeout,
      }),
    })

    if (res.ok) {
      alert('Pedido Enviado com Sucesso! 🚀')
      navigate('/mesas')
    } else {
      const erro = await res.json().catch(() => ({}))
      alert('Erro: ' + (erro.error || 'Falha ao enviar'))
    }
  }

  // ✅ preço: se base=0, mostrar "A partir de" com menor option price
// ✅ Preço Inteligente: Se for 0, busca o menor valor dentro das opções
  function getDisplayPrice(p: any) {
    const base = Number(p.price || 0)

    // Se o produto tem preço fixo (maior que 0), usa ele
    if (base > 0) {
        return { label: `R$ ${base.toFixed(2)}`, isFrom: false }
    }

    // Se o preço é 0, vamos caçar o menor preço nas opções
    const optionPrices: number[] = []
    
    // Verifica se existem grupos de opções carregados
    if (p.optionGroups && Array.isArray(p.optionGroups)) {
        for (const g of p.optionGroups) {
            // Pula grupos desativados, se houver essa flag
            if (g.available === false) continue;

            for (const it of g.items || []) {
                const pr = Number(it.price || 0)
                // Só considera preços maiores que zero
                if (pr > 0) optionPrices.push(pr)
            }
        }
    }

    // Se não achou nenhum preço nas opções (ou não vieram options do backend)
    if (optionPrices.length === 0) {
        return { label: 'R$ 0.00', isFrom: false } // Ou 'Sob Consulta'
    }

    // Pega o menor valor encontrado
    const min = Math.min(...optionPrices)
    return { label: `A partir de R$ ${min.toFixed(2)}`, isFrom: true }
  }
  return (
    <div style={{ paddingBottom: '140px', background: '#f8f9fa', minHeight: '100vh', fontFamily: 'Arial' }}>
      <div style={{ background: '#2d3436', padding: '15px', color: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
        <h2 style={{ margin: 0 }}>Mesa {tableId} - Novo Pedido</h2>
        <button
          onClick={() => navigate('/mesas')}
          style={{ background: 'transparent', border: '1px solid white', color: 'white', padding: '5px 10px', borderRadius: '5px', marginTop: '10px', cursor: 'pointer' }}
        >
          ⬅ Voltar
        </button>
      </div>

      <div style={{ overflowX: 'auto', whiteSpace: 'nowrap', padding: '15px', background: 'white', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
        {CATEGORIAS_REAIS.map((cat) => (
          <button
            key={cat}
            onClick={() => setFiltro(cat)}
            style={{
              padding: '10px 20px',
              marginRight: '10px',
              borderRadius: '20px',
              border: 'none',
              background: filtro === cat ? '#0984e3' : '#dfe6e9',
              color: filtro === cat ? 'white' : '#2d3436',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div style={{ padding: '15px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '15px' }}>
        {produtosFiltrados.map((p: any) => {
          const priceInfo = getDisplayPrice(p)
          return (
            <div
              key={p.id}
              onClick={() => abrirModal(p)}
              style={{
                background: 'white',
                borderRadius: '15px',
                padding: '15px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                cursor: 'pointer',
              }}
            >
              <div style={{ width: '80px', height: '80px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>
                {isFoto(p.image) ? (
                  <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }} />
                ) : (
                  p.image || '🍔'
                )}
              </div>

              <div style={{ fontWeight: 'bold', color: '#2d3436', marginBottom: '5px' }}>{p.name}</div>

              <div style={{ color: '#00b894', fontWeight: '900', fontSize: 14 }}>
                {priceInfo.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* MODAL DE OPÇÕES */}
      {itemSelecionado && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '500px', height: '85vh', borderRadius: '20px 20px 0 0', padding: '20px', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0 }}>{itemSelecionado.name}</h2>

            <textarea
              placeholder="Observação..."
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #ddd', marginBottom: '15px' }}
            />

            {(itemSelecionado.optionGroups || []).filter((g: any) => g.available).map((group: any) => (
              <div key={group.id} style={{ marginBottom: '20px' }}>
                <div style={{ background: '#eee', padding: '8px', borderRadius: '5px', marginBottom: '8px', fontWeight: 'bold' }}>
                  {group.title} (Min: {group.min}, Max: {group.max})
                </div>

                {(group.items || []).filter((it: any) => it.available).map((opt: any) => {
                  const isSelected = selectedIds.has(opt.id)
                  return (
                    <div
                      key={opt.id}
                      onClick={() => toggleOption(group, opt)}
                      style={{
                        padding: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #eee',
                        background: isSelected ? '#fff0e6' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{opt.name}</span>
                      <strong>{Number(opt.price) > 0 ? `+ R$ ${Number(opt.price).toFixed(2)}` : ''}</strong>
                    </div>
                  )
                })}
              </div>
            ))}

            <button
              onClick={adicionarAoCarrinho}
              disabled={!podeAdicionar()}
              style={{
                width: '100%',
                padding: '15px',
                background: podeAdicionar() ? '#27ae60' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 'bold',
                fontSize: '16px',
                cursor: 'pointer',
              }}
            >
              Adicionar ao Pedido
            </button>

            <button
              onClick={() => setItemSelecionado(null)}
              style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#636e72', cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* RESUMO */}
      {showResumo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 110, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', padding: '25px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ margin: 0, marginBottom: '20px' }}>📝 Itens para enviar</h2>

            {carrinho.map((item: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', padding: '10px 0' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                  {item.observation && <div style={{ fontSize: '12px', color: '#e17055' }}>Obs: {item.observation}</div>}
                  <div style={{ fontSize: '11px', color: '#666' }}>{(item.optionItemIds || []).length} opcionais selecionados</div>
                </div>
                <button
                  onClick={() => removerDoCarrinho(idx)}
                  style={{ background: '#d63031', color: 'white', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer' }}
                >
                  🗑️
                </button>
              </div>
            ))}

            <button onClick={() => setShowResumo(false)} style={{ width: '100%', marginTop: '20px', padding: '15px', background: '#2d3436', color: 'white', borderRadius: '10px', fontWeight: 'bold' }}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* FOOTER FIXO */}
      {carrinho.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'white',
            padding: '15px',
            borderTop: '2px solid #eee',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#fff5f5', padding: '8px', borderRadius: '10px', border: '1px solid #fab1a0' }}>
            <input type="checkbox" id="takeout" checked={isTakeout} onChange={(e) => setIsTakeout(e.target.checked)} style={{ width: '22px', height: '22px', cursor: 'pointer' }} />
            <label htmlFor="takeout" style={{ fontWeight: 'bold', color: '#d63031', fontSize: '14px', cursor: 'pointer' }}>
              🛍️ PEDIDO PARA VIAGEM?
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowResumo(true)}
              style={{ flex: 1, padding: '15px', background: '#e17055', color: 'white', borderRadius: '10px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
              📝 Conferir ({carrinho.length})
            </button>
            <button
              onClick={enviarPedido}
              style={{ flex: 1.5, padding: '15px', background: '#0984e3', color: 'white', borderRadius: '10px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
              ✅ Enviar para Cozinha
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
