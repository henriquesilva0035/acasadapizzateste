import { useEffect, useState } from 'react'
import { API_URL } from './config'

export default function Financeiro() {
  const [data, setData] = useState<any>(null)
  // Estado para os modais
  const [pedidoSelecionado, setPedidoSelecionado] = useState<any>(null)
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<any>(null) // <--- NOVO

  const TZ = 'America/Sao_Paulo'
  const [dataFiltro, setDataFiltro] = useState(
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })

)


  useEffect(() => {
    fetch(`${API_URL}/admin/stats?date=${dataFiltro}`)
      .then(res => res.json())
      .then(setData)
      .catch(console.error)
  }, [dataFiltro])

  if (!data) return <div style={{ padding: '40px', textAlign:'center' }}>Carregando financeiro...</div>

  const safeVal = (val: any) => (typeof val === 'number' ? val : 0)
  const historyAll = Array.isArray(data.history) ? data.history : []

    const historyMesa = historyAll.filter((o: any) => o.origin !== 'CLOUD')
    const historyOnline = historyAll.filter((o: any) => o.origin === 'CLOUD')


  return (
    <div style={{ padding: '20px', fontFamily: 'Segoe UI, sans-serif', background: '#f4f6f8', minHeight: '100vh', paddingBottom: '100px' }}>
        
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <div>
                    <h1 style={{ margin: 0, color: '#2d3436' }}>📊 Fechamento de Caixa</h1>
                    <p style={{ margin: '5px 0 0 0', color: '#636e72' }}>Clique nas categorias para ver detalhes</p>
                </div>
                <input type="date" value={dataFiltro} onChange={e => setDataFiltro(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px', fontWeight: 'bold' }} />
            </div>

            {/* CARDS TOTAIS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '30px' }}>
                <div style={{ background: '#27ae60', padding: '20px', borderRadius: '12px', color: 'white' }}>
                    <div style={{ fontSize: '14px', opacity: 0.8 }}>FATURAMENTO TOTAL</div>
                    <div style={{ fontSize: '32px', fontWeight: 'bold' }}>R$ {safeVal(data.totalRevenue).toFixed(2)}</div>
                </div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '14px', color: '#666' }}>💵 DINHEIRO</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2d3436' }}>R$ {safeVal(data.byPayment?.DINHEIRO).toFixed(2)}</div>
                </div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '14px', color: '#666' }}>💠 PIX</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0984e3' }}>R$ {safeVal(data.byPayment?.PIX).toFixed(2)}</div>
                </div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '14px', color: '#666' }}>💳 CARTÃO</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e17055' }}>R$ {safeVal(data.byPayment?.CARTAO).toFixed(2)}</div>
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                
                {/* LISTA DE CATEGORIAS (CLICÁVEL AGORA) */}
                <div style={{ flex: '1 1 350px', background: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                    <h3 style={{ margin: '0 0 20px 0', borderBottom:'1px solid #312b2b', paddingBottom:'10px' }}>🍔 Vendas por Categoria</h3>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {data.byCategory && data.byCategory.map((cat: any, i: number) => (
                            <li 
                                key={i} 
                                onClick={() => setCategoriaSelecionada(cat)} // <--- AÇÃO DO CLIQUE
                                style={{ 
                                    display: 'flex', justifyContent: 'space-between', padding: '12px 10px', 
                                    borderBottom: '1px dashed #f1f1f1', cursor: 'pointer', // Cursor de mãozinha
                                    borderRadius: '8px', transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                            >
                                <div>
                                    <span style={{ fontWeight:'bold', color: '#2d3436' }}>{cat.name}</span>
                                    <div style={{ fontSize: '12px', color: '#0984e3', fontWeight:'bold' }}>👉 Ver {cat.qtd} itens</div>
                                </div>
                                <div style={{ fontWeight:'bold', color: '#27ae60' }}>R$ {cat.total.toFixed(2)}</div>
                            </li>
                        ))}
                        {(!data.byCategory || data.byCategory.length === 0) && <p style={{color:'#ccc'}}>Sem vendas hoje.</p>}
                    </ul>
                </div>

                {/* HISTÓRICO - MESA/RETIRADA */}
<div style={{ flex: '1 1 400px', background: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
  <h3 style={{ margin: '0 0 20px 0', borderBottom:'1px solid #eee', paddingBottom:'10px' }}>🧾 Últimos Pedidos (Mesa/Retirada)</h3>
  <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
    {historyMesa.map((order: any) => (
      <div key={order.idString} onClick={() => setPedidoSelecionado(order)}
        style={{ padding: '12px', borderBottom: '1px solid #f5f5f5', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{fontWeight:'bold'}}>{order.customerName || 'Cliente'}</div>
          <div style={{fontSize:'12px', color:'#999'}}>
            {new Date(order.createdAt).toLocaleTimeString('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit'
})}• {order.paymentMethod}
          </div>
        </div>
        <div style={{fontWeight:'bold'}}>R$ {Number(order.total || 0).toFixed(2)}</div>
      </div>
    ))}
    {historyMesa.length === 0 && <p style={{color:'#ccc'}}>Nenhum pedido de mesa/retirada.</p>}
  </div>
</div>

{/* HISTÓRICO - ONLINE */}
<div style={{ flex: '1 1 400px', background: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
  <h3 style={{ margin: '0 0 20px 0', borderBottom:'1px solid #eee', paddingBottom:'10px' }}>🧾 Últimos Pedidos Online</h3>
  <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
    {historyOnline.map((order: any) => (
      <div key={order.idString} onClick={() => setPedidoSelecionado(order)}
        style={{ padding: '12px', borderBottom: '1px solid #f5f5f5', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{fontWeight:'bold'}}>{order.customerName || 'Cliente'}</div>
          <div style={{fontSize:'12px', color:'#999'}}>
            {new Date(order.createdAt).toLocaleTimeString('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit'
})}• {order.paymentMethod}
          </div>
        </div>
        <div style={{fontWeight:'bold', color:'#e17055'}}>R$ {Number(order.total || 0).toFixed(2)}</div>
      </div>
    ))}
    {historyOnline.length === 0 && <p style={{color:'#ccc'}}>Nenhum pedido online.</p>}
  </div>
</div>

</div>
            {/* --- MODAL 1: DETALHES DA CATEGORIA (NOVO) --- */}
            {categoriaSelecionada && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px' }}>
                    <div style={{ background:'white', width:'100%', maxWidth:'450px', padding:'25px', borderRadius:'15px', maxHeight:'80vh', overflowY:'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems:'center', marginBottom:'15px' }}>
                            <h3 style={{margin:0}}>Detalhes: {categoriaSelecionada.name}</h3>
                            <button onClick={()=>setCategoriaSelecionada(null)} style={{background:'none', border:'none', fontSize:'20px', cursor:'pointer'}}>✕</button>
                        </div>
                        
                        <div style={{ background:'#f8f9fa', borderRadius:'10px', overflow:'hidden' }}>
                             {categoriaSelecionada.products && categoriaSelecionada.products.map((prod: any, idx: number) => (
                                 <div key={idx} style={{ display:'flex', justifyContent:'space-between', padding:'12px', borderBottom:'1px solid #eee' }}>
                                     <span style={{color: '#2d3436'}}>{prod.name}</span>
                                     <span style={{fontWeight:'bold', background:'#e17055', color:'white', padding:'2px 8px', borderRadius:'10px', fontSize:'12px'}}>{prod.qtd}x</span>
                                 </div>
                             ))}
                        </div>
                        
                        <div style={{ marginTop:'20px', textAlign:'right', fontWeight:'bold', fontSize:'18px', color:'#27ae60' }}>
                            Total da Categoria: R$ {categoriaSelecionada.total.toFixed(2)}
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL 2: DETALHES DO PEDIDO (JÁ EXISTIA) --- */}
            {pedidoSelecionado && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display:'flex', justifyContent:'center', alignItems:'center' }}>
                    <div style={{ background:'white', width:'400px', padding:'25px', borderRadius:'15px' }}>
                        <h3>Pedido de {pedidoSelecionado.customerName}</h3>
                        <p><strong>Total:</strong> R$ {pedidoSelecionado.total.toFixed(2)}</p>
                        <div style={{background:'#f9f9f9', padding:'10px', borderRadius:'8px', maxHeight:'300px', overflowY:'auto'}}>
                            {pedidoSelecionado.items.map((i:any, idx:number)=>(
                                <div key={idx} style={{marginBottom:'10px', borderBottom:'1px dashed #ddd'}}>
                                    <div>{i.quantity}x {i.product}</div>
                                    {i.additions && <small style={{color:'blue'}}>+ {i.additions}<br/></small>}
                                    {i.flavors && <small style={{color:'green'}}>Sabores: {i.flavors}<br/></small>}
                                </div>
                            ))}
                        </div>
                        <button onClick={()=>setPedidoSelecionado(null)} style={{marginTop:'15px', width:'100%', padding:'10px', background:'#333', color:'white', border:'none', borderRadius:'5px'}}>Fechar</button>
                    </div>
                </div>
            )}

        </div>
    </div>
  )
}