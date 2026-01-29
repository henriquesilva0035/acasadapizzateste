import { useState, useEffect } from 'react';
import { API_URL } from './config';

export default function AdminMarketing() {
  const [promocoes, setPromocoes] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  
  // Banner
  const [bannerText, setBannerText] = useState('');
  const [bannerActive, setBannerActive] = useState(false);
  
  // --- DADOS DA NOVA PROMOÇÃO ---
  const [nomePromo, setNomePromo] = useState('');
  const [diaSemana, setDiaSemana] = useState('1'); 
  
  // GATILHO (SE COMPRAR...)
  const [catGatilho, setCatGatilho] = useState(''); 
  const [produtosGatilhoSelecionados, setProdutosGatilhoSelecionados] = useState<string[]>([]); // Lista de nomes

  // RECOMPENSA (ELE GANHA...)
  const [tipoBeneficio, setTipoBeneficio] = useState('FREE_ITEM'); // FREE_ITEM, FREE_BORDER, DISCOUNT
  const [catRecompensa, setCatRecompensa] = useState(''); // Ajuda a filtrar a lista de prêmios
  const [produtosRecompensaSelecionados, setProdutosRecompensaSelecionados] = useState<string[]>([]); // Lista de prêmios
  
  const [textoBordas, setTextoBordas] = useState(''); // Ex: "Catupiry, Cheddar"
  const [valorDesconto, setValorDesconto] = useState(50); // % OFF

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

        const resSet = await fetch(`${API_URL}/settings`);
        const settings = await resSet.json();
        if (settings) {
            setBannerText(settings.bannerText || '');
            setBannerActive(settings.bannerActive);
        }
    } catch(e) {}
  }

  async function salvarBanner() {
      await fetch(`${API_URL}/settings`, {
          method: 'PUT', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ bannerText, bannerActive })
      });
      alert("Banner atualizado!");
  }

  // Função para marcar/desmarcar produtos na lista
  function toggleProduto(listaAtual: string[], setLista: any, nomeProduto: string) {
      if (listaAtual.includes(nomeProduto)) {
          setLista(listaAtual.filter(p => p !== nomeProduto)); // Remove
      } else {
          setLista([...listaAtual, nomeProduto]); // Adiciona
      }
  }

  async function criarPromocao() {
      if (!nomePromo) return alert("Dê um nome para a promoção!");
      
      // Validações
      if (tipoBeneficio === 'FREE_BORDER' && !textoBordas) return alert("Digite as bordas grátis!");
      if ((tipoBeneficio === 'FREE_ITEM' || tipoBeneficio === 'DISCOUNT') && produtosRecompensaSelecionados.length === 0) return alert("Selecione pelo menos um produto de prêmio/desconto!");
      if (produtosGatilhoSelecionados.length === 0 && !catGatilho) return alert("Selecione o que o cliente precisa comprar!");

      // Monta GATILHO (Trigger)
      // Se selecionou produtos específicos, salva separados por "|" (Ex: "Pizza G|Pizza GG")
      // Se não selecionou nenhum mas tem categoria, vale a categoria toda.
      let triggerType = 'CATEGORY';
      let triggerValue = catGatilho;

      if (produtosGatilhoSelecionados.length > 0) {
          triggerType = 'NAME_CONTAINS'; // Ou MULTI_PRODUCT, mas vamos usar contains logicamente no front depois
          triggerValue = produtosGatilhoSelecionados.join('|'); 
      }

      // Monta ALVO (Target)
      let targetType = 'PRODUCT_NAME';
      let targetValue = produtosRecompensaSelecionados.join('|');
      let discount = 100;

      if (tipoBeneficio === 'FREE_BORDER') {
          targetType = 'BORDER';
          targetValue = textoBordas;
      } else if (tipoBeneficio === 'DISCOUNT') {
          targetType = 'PRODUCT_NAME'; 
          discount = Number(valorDesconto);
      }

      const novaPromo = {
          name: nomePromo,
          daysOfWeek: diaSemana,
          type: tipoBeneficio,
          triggerType,
          triggerValue, 
          targetType,
          targetValue,
          discountPercent: discount,
          active: true
      };

      const res = await fetch(`${API_URL}/promotions`, {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(novaPromo)
      });

      if (res.ok) {
          alert("Promoção Criada! 🚀");
          // Limpa campos
          setNomePromo(''); setProdutosGatilhoSelecionados([]); setProdutosRecompensaSelecionados([]); setTextoBordas('');
          carregarDados();
      } else {
          alert("Erro ao criar.");
      }
  }

  async function excluirPromo(id: number) {
      if(!confirm("Apagar regra?")) return;
      await fetch(`${API_URL}/promotions/${id}`, { method: 'DELETE' });
      carregarDados();
  }

  // Filtros visuais para as listas
  const produtosGatilhoFiltrados = catGatilho ? produtos.filter(p => p.category === catGatilho) : [];
  const produtosRecompensaFiltrados = catRecompensa ? produtos.filter(p => p.category === catRecompensa) : produtos;

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'Segoe UI, sans-serif', paddingBottom: '100px' }}>
      <h1 style={{ color: '#2d3436' }}>📢 Gestão de Marketing</h1>
      
      {/* BANNER */}
      <div style={{ background: '#dfe6e9', padding: '15px', borderRadius: '8px', marginBottom: '20px', display:'flex', gap:'10px', alignItems:'center' }}>
          <span style={{fontSize:'20px'}}>📺</span>
          <input type="text" value={bannerText} onChange={e => setBannerText(e.target.value)} placeholder="Texto do Banner (Ex: Hoje tem Pizza Dobrada!)" style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
          <button onClick={() => setBannerActive(!bannerActive)} style={{ padding: '10px', background: bannerActive ? '#00b894' : '#b2bec3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>{bannerActive ? 'LIGADO' : 'DESLIGADO'}</button>
          <button onClick={salvarBanner} style={{ background: '#0984e3', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' }}>💾</button>
      </div>

      {/* CRIADOR DE PROMOÇÃO */}
      <div style={{ background: 'white', padding: '25px', borderRadius: '15px', border: '1px solid #ddd', boxShadow: '0 5px 15px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#e17055', borderBottom:'1px solid #eee', paddingBottom:'10px' }}>✨ Criar Nova Regra</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
              <div>
                  <label style={{fontWeight:'bold', fontSize:'13px', color:'#666'}}>Nome</label>
                  <input placeholder="Ex: Terça Pizza G ou GG" value={nomePromo} onChange={e=>setNomePromo(e.target.value)} style={{width:'100%', padding:'10px', marginTop:'5px', border:'1px solid #ddd', borderRadius:'6px'}} />
              </div>
              <div>
                  <label style={{fontWeight:'bold', fontSize:'13px', color:'#666'}}>Dia</label>
                  <select value={diaSemana} onChange={e=>setDiaSemana(e.target.value)} style={{width:'100%', padding:'10px', marginTop:'5px', border:'1px solid #ddd', borderRadius:'6px'}}>
                      <option value="1">Segunda</option><option value="2">Terça</option><option value="3">Quarta</option>
                      <option value="4">Quinta</option><option value="5">Sexta</option><option value="6">Sábado</option><option value="0">Domingo</option>
                  </select>
              </div>

              {/* SEÇÃO 1: CONDICIONAL (COMPRA) */}
              <div style={{gridColumn: '1 / -1', background:'#f1f2f6', padding:'15px', borderRadius:'8px'}}>
                  <strong style={{color:'#2d3436'}}>🛒 SE O CLIENTE COMPRAR...</strong>
                  <div style={{marginTop:'10px'}}>
                      <label style={{fontSize:'12px'}}>1º Selecione a Categoria:</label>
                      <select value={catGatilho} onChange={e=>setCatGatilho(e.target.value)} style={{width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #ccc', marginBottom: '10px'}}>
                          <option value="">-- Selecione --</option>
                          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>

                      {catGatilho && (
                          <div style={{background:'white', border:'1px solid #ccc', borderRadius:'6px', padding:'10px', maxHeight:'150px', overflowY:'auto'}}>
                              <div style={{fontSize:'12px', fontWeight:'bold', marginBottom:'5px', color:'#666'}}>Marque quais produtos ativam a regra (pode marcar vários):</div>
                              {produtosGatilhoFiltrados.map(p => (
                                  <label key={p.id} style={{display:'block', marginBottom:'5px', cursor:'pointer'}}>
                                      <input 
                                          type="checkbox" 
                                          checked={produtosGatilhoSelecionados.includes(p.name)}
                                          onChange={() => toggleProduto(produtosGatilhoSelecionados, setProdutosGatilhoSelecionados, p.name)}
                                      />
                                      <span style={{marginLeft:'8px'}}>{p.name}</span>
                                  </label>
                              ))}
                              {produtosGatilhoSelecionados.length === 0 && <small style={{color:'orange'}}>⚠ Se não marcar nenhum, vale para TODOS da categoria.</small>}
                          </div>
                      )}
                  </div>
              </div>

              {/* SEÇÃO 2: RECOMPENSA (GANHA) */}
              <div style={{gridColumn: '1 / -1', background:'#dff9fb', padding:'15px', borderRadius:'8px', border:'1px solid #c7ecee'}}>
                  <strong style={{color:'#0984e3'}}>🎁 ELE GANHA...</strong>
                  
                  <div style={{marginTop:'10px', marginBottom:'15px', display:'flex', gap:'20px'}}>
                      <label style={{cursor:'pointer'}}><input type="radio" checked={tipoBeneficio === 'FREE_ITEM'} onChange={()=>setTipoBeneficio('FREE_ITEM')} /> Item Grátis</label>
                      <label style={{cursor:'pointer'}}><input type="radio" checked={tipoBeneficio === 'FREE_BORDER'} onChange={()=>setTipoBeneficio('FREE_BORDER')} /> Borda Grátis</label>
                      <label style={{cursor:'pointer'}}><input type="radio" checked={tipoBeneficio === 'DISCOUNT'} onChange={()=>setTipoBeneficio('DISCOUNT')} /> Desconto (%)</label>
                  </div>

                  {tipoBeneficio === 'FREE_BORDER' ? (
                      <div>
                          <small>Digite as bordas grátis (separadas por vírgula):</small>
                          <input placeholder="Ex: Catupiry, Cheddar, Chocolate" value={textoBordas} onChange={e=>setTextoBordas(e.target.value)} style={{width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #aaa'}} />
                      </div>
                  ) : (
                      <div>
                           <label style={{fontSize:'12px'}}>Filtre por categoria para achar o prêmio:</label>
                           <select value={catRecompensa} onChange={e=>setCatRecompensa(e.target.value)} style={{width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid #ccc', marginBottom: '5px'}}>
                                <option value="">-- Todas as Categorias --</option>
                                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>

                           <div style={{background:'white', border:'1px solid #aaa', borderRadius:'6px', padding:'10px', maxHeight:'150px', overflowY:'auto'}}>
                              <div style={{fontSize:'12px', fontWeight:'bold', marginBottom:'5px', color:'#666'}}>
                                  {tipoBeneficio === 'DISCOUNT' ? 'Selecione em quais produtos o desconto aplica:' : 'Selecione quais produtos o cliente ganha:'}
                              </div>
                              {produtosRecompensaFiltrados.map(p => (
                                  <label key={p.id} style={{display:'block', marginBottom:'5px', cursor:'pointer'}}>
                                      <input 
                                          type="checkbox" 
                                          checked={produtosRecompensaSelecionados.includes(p.name)}
                                          onChange={() => toggleProduto(produtosRecompensaSelecionados, setProdutosRecompensaSelecionados, p.name)}
                                      />
                                      <span style={{marginLeft:'8px'}}>{p.name}</span>
                                  </label>
                              ))}
                           </div>
                           
                           {tipoBeneficio === 'DISCOUNT' && (
                              <div style={{marginTop:'10px'}}>
                                  <small>Valor do Desconto (%):</small>
                                  <input type="number" value={valorDesconto} onChange={e=>setValorDesconto(Number(e.target.value))} style={{width:'100px', marginLeft:'10px', padding:'5px'}} />
                              </div>
                           )}
                      </div>
                  )}
              </div>
          </div>
          <button onClick={criarPromocao} style={{ marginTop: '20px', width: '100%', padding: '15px', background: '#e17055', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize:'16px', cursor: 'pointer' }}>CRIAR REGRA 🚀</button>
      </div>

      {/* LISTA */}
      <h3>📜 Regras Ativas</h3>
      <div style={{ display: 'grid', gap: '10px' }}>
          {promocoes.map(p => (
              <div key={p.id} style={{ background: 'white', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #00b894', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                      <strong style={{ fontSize: '16px' }}>{p.name}</strong>
                      <div style={{ fontSize: '13px', color: '#666', marginTop: '5px' }}>
                          Dia: {['Dom','Seg','Ter','Qua','Qui','Sex','Sab'][parseInt(p.daysOfWeek)]} <br/>
                          🛒 <b>{p.triggerValue.split('|').join(' OU ')}</b> <br/> 
                          🎁 <b>{p.targetValue.split('|').join(' OU ')}</b>
                      </div>
                  </div>
                  <button onClick={() => excluirPromo(p.id)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>EXCLUIR</button>
              </div>
          ))}
      </div>
    </div>
  );
}