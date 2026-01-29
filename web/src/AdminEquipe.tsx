import { useState, useEffect } from 'react';
import { API_URL } from './config';

export default function AdminEquipe() {
  const [users, setUsers] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('WAITER'); // Padrão: Garçom
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    carregarEquipe();
  }, []);

  async function carregarEquipe() {
    try {
        const res = await fetch(`${API_URL}/users`);
        const data = await res.json();
        setUsers(data);
    } catch (error) {
        alert("Erro ao buscar equipe.");
    }
  }

  async function cadastrar() {
      if (!name || !pin) return alert("Preencha nome e senha!");
      
      setLoading(true);
      const res = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ name, pin, role })
      });

      if (res.ok) {
          alert("Funcionário cadastrado com sucesso! 🎉");
          setName(''); setPin('');
          carregarEquipe();
      } else {
          const erro = await res.json();
          alert("Erro: " + (erro.error || "Falha ao criar"));
      }
      setLoading(false);
  }

  async function excluir(id: number, nome: string) {
      if (!confirm(`Tem certeza que deseja demitir/remover ${nome}?`)) return;
      
      await fetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
      carregarEquipe();
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
      <h1 style={{ color: '#2d3436', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>👥 Gestão de Equipe</h1>

      {/* --- FORMULÁRIO DE CADASTRO --- */}
      <div style={{ background: 'white', padding: '25px', borderRadius: '15px', border: '1px solid #ddd', boxShadow: '0 5px 15px rgba(0,0,0,0.05)', marginBottom: '30px', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#666' }}>Nome do Funcionário</label>
              <input placeholder="Ex: João Silva" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '12px', marginTop: '5px', borderRadius: '8px', border: '1px solid #ccc' }} />
          </div>
          
          <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#666' }}>Senha (PIN)</label>
              <input type="number" placeholder="Ex: 1010" value={pin} onChange={e => setPin(e.target.value)} style={{ width: '100%', padding: '12px', marginTop: '5px', borderRadius: '8px', border: '1px solid #ccc', textAlign: 'center', letterSpacing: '2px', fontWeight: 'bold' }} />
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#666' }}>Cargo</label>
              <select value={role} onChange={e => setRole(e.target.value)} style={{ width: '100%', padding: '12px', marginTop: '5px', borderRadius: '8px', border: '1px solid #ccc', background: 'white' }}>
                  <option value="WAITER">🤵 Garçom</option>
                  <option value="ADMIN">👑 Gerente</option>
              </select>
          </div>

          <button onClick={cadastrar} disabled={loading} style={{ padding: '12px 25px', background: '#00b894', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', height: '42px' }}>
              {loading ? 'Salvando...' : '+ CADASTRAR'}
          </button>
      </div>

      {/* --- LISTA DE FUNCIONÁRIOS --- */}
      <h3 style={{ color: '#636e72' }}>Lista de Colaboradores ({users.length})</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
          {users.map(u => (
              <div key={u.id} style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #eee', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: u.role === 'ADMIN' ? '#fdcb6e' : '#dfe6e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                          {u.role === 'ADMIN' ? '👑' : '🤵'}
                      </div>
                      <div>
                          <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#2d3436' }}>{u.name}</div>
                          <div style={{ fontSize: '13px', color: '#636e72', background: '#f1f2f6', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                              PIN: <strong>{u.pin}</strong>
                          </div>
                      </div>
                  </div>
                  
                  {/* Botão excluir (não deixa excluir a si mesmo se for o único admin, mas aqui deixei livre por simplicidade) */}
                  <button onClick={() => excluir(u.id, u.name)} style={{ background: '#ff7675', color: 'white', border: 'none', width: '35px', height: '35px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      🗑️
                  </button>
              </div>
          ))}
      </div>
    </div>
  );
}