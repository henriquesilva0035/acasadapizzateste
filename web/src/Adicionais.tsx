import { useState, useEffect } from 'react'
import { API_URL } from './config'

export default function Adicionais() {
  const [extras, setExtras] = useState<any[]>([])
  
  // Form
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [type, setType] = useState('GERAL') // GERAL, PIZZA, MOLHO
  

  useEffect(() => { loadExtras() }, [])

  async function loadExtras() {
    const res = await fetch(`${API_URL}/extras`)
    const data = await res.json()
    setExtras(data)
  }

  async function salvar() {
    if (!name || !price) return alert("Preencha tudo!")
    await fetch(`${API_URL}/extras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price: parseFloat(price), type })
    })
    alert("Adicional salvo!")
    setName(''); setPrice(''); loadExtras()
  }

  async function deletar(id: number) {
    if(!confirm("Apagar este adicional?")) return
    await fetch(`${API_URL}/extras/${id}`, { method: 'DELETE' })
    loadExtras()
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', maxWidth: '600px', margin: '0 auto' }}>
      <h1>🥓 Gerenciar Adicionais e Bordas</h1>
      <p>Cadastre aqui o que o cliente pode adicionar no lanche.</p>

      <div style={{ background: '#eee', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
        <input placeholder="Nome (Ex: Bacon, Cheddar, Borda Catupiry)" value={name} onChange={e=>setName(e.target.value)} style={{ display:'block', width:'100%', padding:'10px', marginBottom:'10px' }} />
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input type="number" placeholder="Preço (Ex: 3.00)" value={price} onChange={e=>setPrice(e.target.value)} style={{ flex: 1, padding:'10px' }} />
            
            <select value={type} onChange={e=>setType(e.target.value)} style={{ flex: 1, padding:'10px' }}>
                <option value="GERAL">🍔 Para Lanches (Geral)</option>
                <option value="PIZZA">🍕 Para Pizzas (Bordas)</option>
                <option value="MOLHO">🥣 Molhos</option>
            </select>
        </div>

        <button onClick={salvar} style={{ width:'100%', padding:'10px', background:'#27ae60', color:'white', border:'none', fontWeight:'bold' }}>CADASTRAR</button>
      </div>

      <h3>Lista Atual</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {extras.map(e => (
            <li key={e.id} style={{ background:'white', border:'1px solid #ddd', padding:'10px', marginBottom:'5px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                    <strong>{e.name}</strong> <span style={{fontSize:'12px', background:'#ddd', padding:'2px 5px', borderRadius:'4px'}}>{e.type}</span>
                </div>
                <div>
                    <span style={{ marginRight: '15px', color: '#27ae60', fontWeight: 'bold' }}>R$ {e.price.toFixed(2)}</span>
                    <button onClick={() => deletar(e.id)} style={{ color:'red', border:'none', background:'none', cursor:'pointer' }}>🗑️</button>
                </div>
            </li>
        ))}
      </ul>
    </div>
  )
}