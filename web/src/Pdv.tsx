// ARQUIVO: src/Pdv.tsx
// ---------------------------------------------------------
// RESPONSABILIDADE:
// 1. Painel Principal.
// 2. Mesas (Esq) e Delivery (Dir).
// 3. ATUALIZADO: Agora lê os campos flavors/border do seu Schema.prisma.
// ---------------------------------------------------------

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { imprimir } from './Impressora'
import { API_URL, getSocket } from './lib/api' 

interface Table {
  id: number
  label: string
  status: string
  customerName: string | null
  currentSessionCode: string | null
  orders: any[]
  waiterName?: string
}

interface Order {
  idString: string
  customerName: string
  total: number
  status: string
  origin: string
  createdAt: string
  items: any[]
  customerPhone?: string
  customerAddress?: string
  paymentMethod?: string
  deliveryFee?: number
  isTakeout?: boolean 
}

const SOM_CAMPAINHA = 'https://media.geeksforgeeks.org/wp-content/uploads/20190531135120/beep.mp3'

export default function Pdv() {
  const navigate = useNavigate()

  const [tables, setTables] = useState<Table[]>([])
  const [onlineOrders, setOnlineOrders] = useState<Order[]>([])
  const [orderToView, setOrderToView] = useState<Order | null>(null)

  const [audioAllowed, setAudioAllowed] = useState(false)
  const audioRef = useRef(new Audio(SOM_CAMPAINHA))
  const previousCount = useRef(0)

  function ativarSom() {
    audioRef.current.volume = 1.0
    audioRef.current.play().then(() => setAudioAllowed(true)).catch(() => alert('Clique em "🔇 ATIVAR SOM"'))
  }

  async function loadData(silent = false) {
    try {
      const resTables = await fetch(`${API_URL}/tables`)
      const dataTables = await resTables.json()
      setTables(dataTables)

      const resOrders = await fetch(`${API_URL}/orders`)
      const dataOrders = await resOrders.json()

      const delivery = dataOrders.filter((o: any) => {
        const isOnline = o.origin === 'APP_DELIVERY' || !o.tableId; 
        const isActive = !['CLOSED', 'CANCELED'].includes(o.status);
        return isOnline && isActive;
      })

      delivery.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOnlineOrders(delivery)
      previousCount.current = delivery.length

    } catch (err) {
      if (!silent) console.error('Erro PDV', err)
    }
  }

  useEffect(() => {
    loadData();
    const socket = getSocket();

    socket.on('new-order', (novoPedido: any) => {
        if(novoPedido.origin === 'APP_DELIVERY' || !novoPedido.tableId) {
            if (audioAllowed) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => {});
            }
            loadData(true);
        }
    });

    socket.on('order:updated', () => loadData(true));

    const interval = setInterval(() => loadData(true), 5000)
    return () => {
        clearInterval(interval);
        socket.off('new-order');
        socket.off('order:updated');
    }
  }, [audioAllowed])

  async function changeStatus(orderId: string, newStatus: string) {
    await fetch(`${API_URL}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    await loadData(true)
    setOrderToView(null) 
  }

  async function cancelOrder(orderId: string) {
    if (!window.confirm('Cancelar este pedido?')) return
    await fetch(`${API_URL}/orders/${orderId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Painel' }),
    })
    await loadData(true)
    setOrderToView(null)
  }

  // ✅ HELPER CORRIGIDO: Lê os campos exatos do seu Schema.prisma
  const renderOptions = (item: any) => {
    const details = [];

    // 1. Sabores (Para Pizza)
    if (item.flavors) {
        details.push(<div key="flav">🍕 <b>Sabores:</b> {item.flavors}</div>);
    }

    // 2. Borda
    if (item.border) {
        details.push(<div key="bord">🧀 <b>Borda:</b> {item.border}</div>);
    }

    // 3. Extras / Adicionais
    if (item.extras || item.additions) {
        const extraTxt = [item.extras, item.additions].filter(Boolean).join(", ");
        details.push(<div key="ext">➕ <b>Adicionais:</b> {extraTxt}</div>);
    }

    // 4. Fallback (Compatibilidade antiga)
    if (details.length === 0 && item.optionSummary) {
        return item.optionSummary.split(" | ").map((opt: string, k: number) => (
            <div key={k}>• {opt}</div>
        ));
    }

    return details;
  };

  // --- CARD DE DELIVERY ---
  const DeliveryCard = ({ order }: { order: Order }) => {
    let corStatus = '#999', btnAction = null, btnLabel = ''
    
    if (order.status === 'PENDING') {
      corStatus = '#ff9f43'; btnLabel = 'ACEITAR'; btnAction = () => changeStatus(order.idString, 'PREPARING')
    } else if (order.status === 'PREPARING') {
      corStatus = '#feca57'; btnLabel = order.isTakeout ? 'PRONTO' : 'SAIU ENTREGA'; btnAction = () => changeStatus(order.idString, 'DELIVERED')
    } else if (order.status === 'DELIVERED') {
      corStatus = '#54a0ff'; btnLabel = 'CONCLUIR'; btnAction = () => changeStatus(order.idString, 'CLOSED')
    }

    const firstName = (order.customerName || 'Cliente').split(' ')[0]

    return (
      <div style={{ background: 'white', borderRadius: '6px', padding: '10px', marginBottom: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: `5px solid ${corStatus}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
          <strong style={{ fontSize: '14px', color: '#2d3436' }}>{firstName}</strong>
          <small style={{ color: '#666', fontSize: '11px' }}>{new Date(order.createdAt).toLocaleTimeString().slice(0, 5)}</small>
        </div>

        <div style={{ fontSize:'11px', color:'#666', marginBottom:'6px' }}>
            {order.isTakeout ? '🥡 Retirada' : '🛵 Entrega'} • {order.paymentMethod}
        </div>

        <div style={{ fontSize: '12px', color: '#555', background: '#f9f9f9', padding: '6px', borderRadius: '4px', marginBottom:'8px', border:'1px solid #eee' }}>
          {order.items.map((i: any, idx) => (
            <div key={idx} style={{ borderBottom: idx < order.items.length - 1 ? '1px dashed #eee' : 'none', paddingBottom:'4px', marginBottom:'4px' }}>
              <div style={{ fontWeight:'bold', color: '#333' }}>{i.quantity}x {i.product?.name || i.product}</div>
              
              {/* Renderiza Sabores/Borda */}
              <div style={{ fontSize:'11px', color:'#555', paddingLeft:'5px', marginTop:'2px', lineHeight:'1.4' }}>
                 {renderOptions(i)}
              </div>

              {i.observation && <div style={{ fontSize:'10px', color:'red', fontWeight:'bold', marginTop:'2px' }}>Obs: {i.observation}</div>}
            </div>
          ))}
          {order.deliveryFee ? <div style={{color:'#d63031', marginTop:4, borderTop:'1px solid #eee', paddingTop:2}}>+ Taxa: R$ {order.deliveryFee.toFixed(2)}</div> : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom:'8px' }}>
          <strong style={{ fontSize: '15px', color: '#333' }}>R$ {order.total.toFixed(2)}</strong>
          <div style={{ display: 'flex', gap: '5px' }}>
             <button onClick={() => setOrderToView(order)} title="Ver Detalhes" style={{ background: '#0984e3', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>👁️</button>
             <button onClick={() => imprimir(order, 'DELIVERY')} title="Imprimir" style={{ background: '#636e72', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>🖨️</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '5px', flexWrap:'wrap' }}>
          {btnAction && (
            <button onClick={btnAction} style={{ flex: '1 1 auto', padding: '8px', background: corStatus, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>{btnLabel}</button>
          )}
          {order.status === 'PENDING' && (
              <button onClick={() => cancelOrder(order.idString)} style={{ flex: '0 0 auto', padding: '8px 12px', background: '#d63031', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
          )}
        </div>
      </div>
    )
  }

  // --- MODAL DETALHES ---
  const OrderDetailsModal = () => {
      if(!orderToView) return null;
      return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '15px', padding: '25px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>
              <h2 style={{ margin: 0, color: '#2d3436' }}>📄 Detalhes do Pedido</h2>
              <button onClick={() => setOrderToView(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ background: '#f1f2f6', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0984e3', marginBottom: '5px' }}>{orderToView.customerName}</div>
              <div style={{ fontSize: '14px', marginBottom: '5px' }}>📞 {orderToView.customerPhone}</div>
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#2d3436' }}>📍 {orderToView.customerAddress}</div>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              {orderToView.items.map((item: any, idx: number) => (
                <div key={idx} style={{ padding: '10px 0', borderBottom: '1px dashed #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>{item.quantity}x {item.product?.name || item.product}</span>
                    <span>R$ {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                  {/* Renderiza Sabores/Borda */}
                  <div style={{ fontSize: '13px', color: '#555', marginTop: '6px', background: '#f9f9f9', padding: '8px', borderRadius: '6px', border: '1px solid #eee' }}>
                       {renderOptions(item)}
                  </div>
                  {item.observation && <div style={{ fontSize: '12px', color: '#d63031', background: '#ffeaea', padding: '5px', borderRadius: '4px', marginTop: '5px', fontWeight: 'bold' }}>⚠️ OBS: {item.observation}</div>}
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#666' }}>Taxa: R$ {(orderToView.deliveryFee || 0).toFixed(2)}</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#27ae60' }}>Total: R$ {orderToView.total.toFixed(2)}</div>
              <div style={{ marginTop: '5px', padding: '5px', background: '#dfe6e9', display: 'inline-block', borderRadius: '5px', fontSize: '14px', fontWeight: 'bold' }}>Via: {orderToView.paymentMethod}</div>
            </div>

            <div style={{ marginTop: '25px', display: 'flex', gap: '10px' }}>
              <button onClick={() => imprimir(orderToView, 'DELIVERY')} style={{ flex: 1, padding: '15px', background: '#2d3436', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>🖨️ Imprimir</button>
              <button onClick={() => cancelOrder(orderToView.idString)} style={{ flex: 1, padding: '15px', background: '#d63031', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>❌ Cancelar</button>
            </div>
          </div>
        </div>
      );
  }

  const MesaCard = ({ table }: { table: Table }) => {
    const totalMesa = table.orders?.reduce((acc, order) => acc + order.total, 0) || 0
    const ocupada = table.status === 'BUSY'
    const atendente = table.orders && table.orders.length > 0 ? table.orders[0].waiterName : null
    return (
      <div onClick={() => ocupada && navigate(`/mesa/${table.id}/detalhes`)} style={{ background: ocupada ? 'white' : '#e6fffa', border: ocupada ? '2px solid #ff7675' : '2px solid #2ed573', borderRadius: '8px', padding: '10px', cursor: ocupada ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '140px', boxShadow: ocupada ? '0 2px 8px rgba(255, 118, 117, 0.15)' : 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '800', fontSize: '18px', color: '#2d3436' }}>Mesa {table.id}</span>
          {ocupada && <span style={{background: '#2d3436', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold'}}>{table.currentSessionCode}</span>}
        </div>
        {ocupada ? (
          <>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#2d3436', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{table.customerName?.toUpperCase()}</div>
              <div style={{ fontSize: '11px', color: '#b2bec3', marginTop: '2px' }}>At: <span style={{ color: '#636e72', fontWeight: 'bold' }}>{atendente || '--'}</span></div>
            </div>
            <div style={{ marginTop: 'auto', borderTop: '1px dashed #eee', paddingTop: '6px', textAlign: 'right' }}><span style={{ fontSize: '18px', fontWeight: '900', color: '#d63031' }}>R$ {totalMesa.toFixed(2)}</span></div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
            <div style={{ fontSize: '20px', marginBottom: '2px' }}>🍃</div>
            <div style={{ color: '#2ed573', fontWeight: 'bold', fontSize: '12px' }}>LIVRE</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100vh', width: '100%', overflow: 'hidden', background: '#f4f6f8', fontFamily: 'Arial' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '2px solid #ddd', overflow: 'hidden' }}>
        <header style={{ padding: '10px 15px', background: '#f3ab1f', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>🍽️ GESTÃO DE MESAS</h2>
          {!audioAllowed ? <button onClick={ativarSom} style={{ fontSize: '11px', padding: '6px', background: '#ff7675', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>🔇 ATIVAR SOM</button> : <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '4px' }}>🔔 Som Ativo</span>}
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '15px', alignContent: 'start' }}>
          {tables.map((table) => <MesaCard key={table.id} table={table} />)}
        </div>
      </div>

      <div style={{ width: '380px', display: 'flex', flexDirection: 'column', background: '#dfe6e9', borderLeft: '1px solid #ccc', overflow: 'hidden' }}>
        <header style={{ padding: '10px 15px', background: '#a50301', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '16px' }}>🛵 DELIVERY ({onlineOrders.length})</h2>
          <button onClick={() => loadData(true)} style={{ background: 'transparent', border:'1px solid white', color:'white', borderRadius:'4px', cursor:'pointer', fontSize:'12px', padding:'4px 8px' }}>↻</button>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {onlineOrders.length === 0 ? <div style={{textAlign:'center', marginTop:'50px', color:'#777'}}>Nenhum pedido pendente.</div> : onlineOrders.map((order) => <DeliveryCard key={order.idString} order={order} />)}
        </div>
      </div>
      {orderToView && <OrderDetailsModal />}
    </div>
  )
}