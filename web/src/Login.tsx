import { useState } from 'react'
import { API_URL } from './config'

export default function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState('')

  

// AGORA (Funciona no mundo todo):
//const API_URL = 'https://tobacco-naples-just-owns.trycloudflare.com' // (Sem a barra / no final)

  async function handleLogin() {
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      })

      if (res.ok) {
        const user = await res.json()
        onLogin(user) // Avisa o App que logou
      } else {
        setErro('Senha incorreta!')
        setPin('')
      }
    } catch (e) {
      setErro('Erro de conexão com servidor.')
    }
  }

  // Função para adicionar número ao clicar (Teclado Virtual)
  const addNum = (num: string) => {
    if (pin.length < 4) setPin(pin + num)
    setErro('')
  }

  return (
    <div style={{ height: '100vh', background: '#2d3436', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'Arial' }}>
      <div style={{ width: '300px', textAlign: 'center' }}>
        <div style={{ fontSize: '50px', marginBottom: '20px' }}>🔐</div>
        <h2 style={{ marginBottom: '30px' }}>Acesso Restrito</h2>
        
        {/* Mostrador de Senha (Bolinhas) */}
        <div style={{ background: 'white', height: '50px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', letterSpacing: '10px', color: '#333', fontSize: '30px', fontWeight: 'bold' }}>
           {'•'.repeat(pin.length)}
        </div>

        {erro && <div style={{ color: '#ff7675', marginBottom: '15px' }}>{erro}</div>}

        {/* Teclado Numérico Grande */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => addNum(n.toString())} style={{ padding: '20px', fontSize: '24px', borderRadius: '10px', border: 'none', background: '#636e72', color: 'white', cursor: 'pointer' }}>{n}</button>
            ))}
            <button onClick={() => setPin('')} style={{ padding: '20px', fontSize: '18px', borderRadius: '10px', border: 'none', background: '#fab1a0', color: '#d63031', fontWeight: 'bold' }}>C</button>
            <button onClick={() => addNum('0')} style={{ padding: '20px', fontSize: '24px', borderRadius: '10px', border: 'none', background: '#636e72', color: 'white' }}>0</button>
            <button onClick={handleLogin} style={{ padding: '20px', fontSize: '24px', borderRadius: '10px', border: 'none', background: '#00b894', color: 'white' }}>➜</button>
        </div>

        <p style={{ marginTop: '20px', opacity: 0.5, fontSize: '12px' }}>Garçom: 0000 | Gerente: 1234</p>
      </div>
    </div>
  )
}