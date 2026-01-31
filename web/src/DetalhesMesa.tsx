import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { API_URL } from './config'

export default function DetalhesMesa() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [mesa, setMesa] = useState<any>(null)
  
  // Estado para Troca
  const [modalTrocaOpen, setModalTrocaOpen] = useState(false)
  const [todasMesas, setTodasMesas] = useState<any[]>([])

  // Estado para Pagamento
  const [modalPagamentoOpen, setModalPagamentoOpen] = useState(false)
  const [pagamentos, setPagamentos] = useState<Array<{ method: string; amount: string }>>([
    { method: 'DINHEIRO', amount: '' },
  ])

  async function loadMesa() {
    try {
        const response = await fetch(`${API_URL}/tables/${id}`)
        const data = await response.json()
        setMesa(data)
        
        // Carrega todas mesas apenas se for trocar
        if(modalTrocaOpen) {
           const resMesas = await fetch(`${API_URL}/tables`)
           const dataMesas = await resMesas.json()
           setTodasMesas(dataMesas)
        }
    } catch (err) { console.error("Erro ao carregar:", err) }
  }

  // Polling para manter atualizado (Socket.io seria melhor, mas polling é seguro)
  useEffect(() => {
    loadMesa()
    const interval = setInterval(loadMesa, 4000)
    return () => clearInterval(interval)
  }, [id, modalTrocaOpen])

  async function excluirItem(orderId: string, itemId: string) {
    if (!confirm("Remover este item?")) return
    const res = await fetch(`${API_URL}/orders/${orderId}/items/${itemId}`, { method: 'DELETE' })
    if (res.ok) loadMesa()
  }

  async function reimprimirPedidoCompleto() {
    try {
      const res = await fetch(`${API_URL}/tables/${id}/print-kitchen`, { method: 'POST' });
      if (!res.ok) throw new Error('Falha');
      alert("Comanda reenviada para impressora! 🖨️");
    } catch (e) { alert("Erro ao reimprimir."); }
  }

  async function confirmarTroca(novaMesaId: number) {
    if(!confirm(`Mover tudo da Mesa ${id} para Mesa ${novaMesaId}?`)) return;
    try {
        const res = await fetch(`${API_URL}/tables/${id}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetTableId: novaMesaId })
        })
        if (res.ok) {
            // Migra o nome do garçom localmente também
            const garcom = localStorage.getItem(`atendente_mesa_${id}_nome`);
            if(garcom) localStorage.setItem(`atendente_mesa_${novaMesaId}_nome`, garcom);
            
            setModalTrocaOpen(false)
            alert("Mesa trocada com sucesso!")
            navigate(`/mesa/${novaMesaId}/detalhes`)
        }
    } catch (e) { alert("Erro ao trocar mesa.") }
  }

  // --- LÓGICA DE PAGAMENTO ---
  const totalGeral = mesa?.orders?.reduce((acc: number, o: any) => acc + (Number(o.total) || 0), 0) || 0

  function totalInformado() {
    return pagamentos.reduce((acc, p) => acc + (Number(p.amount.replace(',', '.')) || 0), 0)
  }

  async function finalizarConta() {
    // Validação: Total deve bater (com pequena margem de erro de centavos)
    const informado = totalInformado();
    if (Math.abs(informado - totalGeral) > 0.10 && totalGeral > 0) {
        return alert(`Valor informado (R$ ${informado.toFixed(2)}) não bate com o Total (R$ ${totalGeral.toFixed(2)})`);
    }

    if (!confirm("Confirmar fechamento e liberar mesa?")) return;

    try {
        const rows = pagamentos.map(p => ({
            method: p.method,
            amount: Number(p.amount.replace(',', '.')) || 0
        })).filter(p => p.amount > 0);

        const res = await fetch(`${API_URL}/tables/${id}/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                payments: rows, 
                paymentMethod: rows.length === 1 ? rows[0].method : 'MISTO' 
            }),
        })

        if (res.ok) {
            alert("Conta Fechada! ✅");
            navigate('/mesas');
        } else {
            alert("Erro ao fechar conta.");
        }
    } catch (e) { alert("Erro de conexão."); }
  }

  if (!mesa) return <div>Carregando...</div>

  return (
    <div style={{ padding: '20px', background: '#f1f2f6', minHeight: '100vh', paddingBottom: '160px' }}>
      <header style={{ background: 'white', padding: '20px', borderRadius: '15px', marginBottom: '20px', display:'flex', justifyContent:'space-between' }}>
        <div>
            <h1 style={{ margin: 0 }}>Mesa {mesa.id}</h1>
            <p>Cliente: <strong>{mesa.customerName}</strong></p>
        </div>
        <button onClick={() => { setModalTrocaOpen(true); loadMesa(); }} style={{ background: '#fbc531', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor:'pointer' }}>🔄 Trocar</button>
      </header>

      {/* LISTA DE ITENS */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '15px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'15px' }}>
            <h3>Itens Consumidos</h3>
            <button onClick={reimprimirPedidoCompleto} style={{ background: '#2d3436', color:'white', border:'none', borderRadius:'5px', padding:'5px 10px', cursor:'pointer' }}>🖨️ Reenviar Cozinha</button>
        </div>
        
       {mesa.orders.map((order: any) => {
            // CORREÇÃO: Se o pedido ficou sem itens (vazio), não renderiza nada (nem a linha)
            if (!order.items || order.items.length === 0) return null;

            return (
                <div key={order.idString} style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px' }}>
                    {order.items.map((item: any) => {
                        const nomeProduto = item.name || item.product || 'Produto sem nome';

                        return (
                            <div key={item.idString} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'flex-start' }}>
                                
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2d3436', marginBottom: '4px' }}>
                                        {item.quantity}x {nomeProduto}
                                    </div>

                                    <div style={{ fontSize: '13px', color: '#636e72', paddingLeft: '0px' }}>
                                        {item.flavors ? <div style={{ marginBottom:'2px' }}>🍕 <b>Sabores:</b> {item.flavors}</div> : null}
                                        {item.border ? <div style={{ marginBottom:'2px' }}>🧀 <b>Borda:</b> {item.border}</div> : null}
                                        {item.additions ? <div style={{ marginBottom:'2px' }}>➕ <b>Adicionais:</b> {item.additions}</div> : null}
                                        {item.extras ? <div style={{ marginBottom:'2px' }}>✨ <b>Extras:</b> {item.extras}</div> : null}
                                        {item.observation ? <div style={{ color: '#d63031', marginTop: '4px' }}>⚠️ <b>Obs:</b> {item.observation}</div> : null}
                                    </div>
                                </div>

                                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginLeft: '10px' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                        R$ {(item.price * item.quantity).toFixed(2)}
                                    </span>
                                    <button 
                                        onClick={() => excluirItem(order.idString, item.idString)} 
                                        style={{ border:'none', background:'transparent', cursor:'pointer', fontSize: '18px' }}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )
        })}

        <div style={{ marginTop: '20px', fontSize: '24px', fontWeight: 'bold', textAlign: 'right', color: '#27ae60' }}>
            Total: R$ {totalGeral.toFixed(2)}
        </div>
      </div>

      {/* FOOTER AÇÕES */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', padding: '15px', borderTop: '1px solid #eee', display: 'flex', gap: '10px' }}>
        <button onClick={() => navigate(`/pedido/${id}`)} style={{ flex: 1, padding: '15px', background: '#0984e3', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '16px', cursor:'pointer' }}>➕ Adicionar Item</button>
        <button onClick={() => setModalPagamentoOpen(true)} style={{ flex: 1, padding: '15px', background: '#00b894', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '16px', cursor:'pointer' }}>✅ Fechar Conta</button>
      </div>

      {/* MODAL PAGAMENTO */}
      {modalPagamentoOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', padding: '20px', borderRadius: '20px', width: '90%', maxWidth: '500px' }}>
                <h3>Pagamento (Total: R$ {totalGeral.toFixed(2)})</h3>
                {pagamentos.map((p, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <select value={p.method} onChange={e => {
                            const cp = [...pagamentos]; cp[idx].method = e.target.value; setPagamentos(cp);
                        }} style={{ padding: '10px', flex: 1 }}>
                            <option value="DINHEIRO">Dinheiro</option>
                            <option value="PIX">Pix</option>
                            <option value="CARTAO_CREDITO">Crédito</option>
                            <option value="CARTAO_DEBITO">Débito</option>
                        </select>
                        <input placeholder="0,00" value={p.amount} onChange={e => {
                            const cp = [...pagamentos]; cp[idx].amount = e.target.value; setPagamentos(cp);
                        }} style={{ padding: '10px', width: '100px' }} />
                        <button onClick={() => setPagamentos(pagamentos.filter((_, i) => i !== idx))} disabled={pagamentos.length===1}>🗑️</button>
                    </div>
                ))}
                <button onClick={() => setPagamentos([...pagamentos, {method:'PIX', amount:''}])} style={{ marginBottom: '20px' }}>+ Dividir Pagamento</button>
                
                <div style={{ display:'flex', gap:'10px' }}>
                    <button onClick={() => setModalPagamentoOpen(false)} style={{ flex: 1, padding: '10px' }}>Cancelar</button>
                    <button onClick={finalizarConta} style={{ flex: 1, padding: '10px', background: '#27ae60', color: 'white', fontWeight:'bold' }}>Confirmar</button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL TROCA (Simplificado) */}
      {modalTrocaOpen && (
         <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', padding: '20px', borderRadius: '10px', maxHeight:'80vh', overflowY:'auto' }}>
                <h3>Trocar para qual mesa?</h3>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px' }}>
                    {todasMesas.filter(m => m.status === 'OPEN').map(m => (
                        <button key={m.id} onClick={() => confirmarTroca(m.id)} style={{ padding: '15px', background: '#e6fffa', border:'1px solid green' }}>Mesa {m.id}</button>
                    ))}
                </div>
                <button onClick={() => setModalTrocaOpen(false)} style={{ marginTop:'10px', width:'100%', padding:'10px' }}>Cancelar</button>
            </div>
         </div>
      )}
    </div>
  )
}