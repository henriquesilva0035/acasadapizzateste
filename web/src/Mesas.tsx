import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from './config'

export default function Mesas() {
  const [tables, setTables] = useState<any[]>([])
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedTable, setSelectedTable] = useState<any>(null)
  const [customerName, setCustomerName] = useState('')

  async function loadTables() {
    try {
      const response = await fetch(`${API_URL}/tables`)
      const data = await response.json()
      setTables(data)
    } catch (error) { console.error("Erro mesas", error) }
  }

  useEffect(() => {
    loadTables();
    const interval = setInterval(loadTables, 5000); 
    return () => clearInterval(interval);
  }, []); 

  function handleTableClick(table: any) {
    if (table.status === 'OPEN') {
      setSelectedTable(table)
      setCustomerName('')
      setModalOpen(true)
    } else {
      navigate(`/mesa/${table.id}/detalhes`);
    }
  }

  async function confirmarAbertura() {
    if (!customerName.trim()) return alert("Digite o nome do cliente!");
    const userLogado = JSON.parse(localStorage.getItem('usuario_logado') || '{}');
    const waiterName = userLogado.name || "Garçom";
    localStorage.setItem(`atendente_mesa_${selectedTable.id}_nome`, waiterName); // Salva quem abriu

    try {
        const res = await fetch(`${API_URL}/tables/${selectedTable.id}/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerName, waiterName })
        });
        if (res.ok) {
            setModalOpen(false);
            loadTables();
            navigate(`/pedido/${selectedTable.id}`); // Vai direto pro pedido
        } else { alert("Erro ao abrir mesa."); }
    } catch (e) { alert("Erro de conexão."); }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', background: '#f8f9fa', minHeight: '100vh' }}>
      <h1 style={{ color: '#2d3436' }}>📍 Mapa de Mesas</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '20px' }}>
        {tables.map(table => (
          <div key={table.id} onClick={() => handleTableClick(table)} 
            style={{ 
              height: '140px', borderRadius: '16px', padding: '15px', cursor: 'pointer',
              background: table.status === 'OPEN' ? '#e6fffa' : 'white',
              border: table.status === 'OPEN' ? '2px solid #2ed573' : '2px solid #ff7675',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
            }}>
            <div style={{ fontWeight: '800', fontSize: '20px' }}>{table.id}</div>
            <div style={{ textAlign: 'center' }}>
                {table.status === 'BUSY' ? (
                    <>
                        <div style={{ fontWeight: 'bold' }}>{table.customerName}</div>
                        <small style={{color:'#666'}}>👤 {table.waiterName || '--'}</small>
                    </>
                ) : <div style={{ color: '#2ed573', fontWeight: 'bold' }}>LIVRE</div>}
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', padding: '30px', borderRadius: '20px', width: '300px' }}>
                <h3>Abrir Mesa {selectedTable?.id}</h3>
                <input autoFocus placeholder="Nome do Cliente" value={customerName} onChange={e => setCustomerName(e.target.value)} onKeyDown={e => e.key==='Enter' && confirmarAbertura()} style={{ width: '100%', padding: '10px', marginBottom: '20px' }} />
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setModalOpen(false)} style={{ flex: 1, padding: '10px' }}>Cancelar</button>
                    <button onClick={confirmarAbertura} style={{ flex: 1, padding: '10px', background: '#0984e3', color: 'white', fontWeight: 'bold' }}>ABRIR</button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}