// ARQUIVO: src/App.tsx
// ---------------------------------------------------------
// RESPONSABILIDADE:
// 1. Gerenciar rotas e autenticação.
// 2. Prover contextos globais (Carrinho, Pedidos).
// 3. CORREÇÃO: Adicionado BrowserRouter no fluxo do cliente não-logado.
// ---------------------------------------------------------

import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { CartProvider } from "./contexts/CartContext";
import { OrderProvider } from "./contexts/OrderContext";

import Pdv from "./Pdv";
import Cardapio from "./Cardapio";
import Mesas from "./Mesas";
import PedidoMesa from "./PedidoMesa";
import DetalhesMesa from "./DetalhesMesa";
import Produtos from "./Produtos";
import Login from "./Login";
import Financeiro from "./Financeiro";
import Adicionais from "./Adicionais";
import AdminMarketing from "./AdminMarketing";
import AdminEquipe from "./AdminEquipe";
import AdminProductsPage from "./pages/admin/products/AdminProductsPage";
import AdminNeighborhoods from "./pages/admin/AdminNeighborhoods"; // Importe a tela de bairros
import OrderTracking from "./OrderTracking"; // Importe a tela de rastreio

export default function App() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const salvo = localStorage.getItem("usuario_logado");
    if (salvo) {
      setUser(JSON.parse(salvo));
    }
  }, []);

  function efetuarLogin(usuario: any) {
    setUser(usuario);
    localStorage.setItem("usuario_logado", JSON.stringify(usuario));
  }

  function sair() {
    setUser(null);
    localStorage.removeItem("usuario_logado");
  }

  // Se não estiver logado (Fluxo do Cliente / Cardápio Público)
  if (!user) {
    // Verifica se a URL é publica
    const path = window.location.pathname;
    
    // Se for cardápio OU tela de acompanhamento, libera o acesso
    if (path === "/cardapio" || path.startsWith("/acompanhar/")) {
      return (
        <OrderProvider>
          <CartProvider>
            {/* ✅ CORREÇÃO: O BrowserRouter deve envolver tudo aqui também */}
            <BrowserRouter>
               <Routes>
                 <Route path="/cardapio" element={<Cardapio />} />
                 <Route path="/acompanhar/:id" element={<OrderTracking />} />
                 {/* Redireciona qualquer outra coisa para cardapio */}
                 <Route path="*" element={<Navigate to="/cardapio" />} />
               </Routes>
            </BrowserRouter>
          </CartProvider>
        </OrderProvider>
      );
    }

    // Caso contrário, manda para o Login (Painel Admin)
    return <Login onLogin={efetuarLogin} />;
  }

  // Fluxo Logado (Admin / Garçom)
  return (
    <OrderProvider>
      <CartProvider>
        <BrowserRouter>
          <nav
            style={{
              padding: "15px",
              background: "#ee5252cb",
              color: "white",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
              {user.role === "ADMIN" && (
                <>
                  <Link to="/" style={linkStyle}>🖥️ PDV</Link>
                  <Link to="/admin/financeiro" style={linkStyle}>💰 Financeiro</Link>
                </>
              )}

              <Link to="/mesas" style={{ ...linkStyle, background: "#fbc531", color: "#2d3436" }}>🛑 Mesas</Link>

              {user.role === "ADMIN" && (
                <>
                  <Link to="/admin/produtos" style={linkStyle}>📦 Estoque</Link>
                  <Link to="/admin/marketing" style={linkStyle}>📢 Marketing</Link>
                  <Link to="/admin/bairros" style={linkStyle}>🛵 Taxas</Link>
                  <Link to="/admin/equipe" style={linkStyle}>👥 Equipe</Link>
                </>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
              <span style={{ fontSize: "14px", opacity: 0.8 }}>
                Olá, {user.name} ({user.role === "ADMIN" ? "Gerente" : "Garçom"})
              </span>
              <button onClick={sair} style={logoutStyle}>Sair</button>
            </div>
          </nav>

          <Routes>
            <Route path="/" element={user.role === "ADMIN" ? <Pdv /> : <Navigate to="/mesas" />} />

            {/* Rotas Administrativas */}
            <Route path="/admin/financeiro" element={user.role === "ADMIN" ? <Financeiro /> : <Navigate to="/mesas" />} />
            <Route path="/admin/adicionais" element={user.role === "ADMIN" ? <Adicionais /> : <Navigate to="/mesas" />} />
            <Route path="/admin/produtos" element={user.role === "ADMIN" ? <AdminProductsPage /> : <Navigate to="/mesas" />} />
            <Route path="/admin/equipe" element={user.role === "ADMIN" ? <AdminEquipe /> : <Navigate to="/mesas" />} />
            <Route path="/admin/marketing" element={user.role === "ADMIN" ? <AdminMarketing /> : <Navigate to="/mesas" />} />
            <Route path="/admin/bairros" element={user.role === "ADMIN" ? <AdminNeighborhoods /> : <Navigate to="/mesas" />} />

            {/* Rotas de Operação */}
            <Route path="/mesas" element={<Mesas />} />
            <Route path="/pedido/:tableId" element={<PedidoMesa />} />
            <Route path="/mesa/:id/detalhes" element={<DetalhesMesa />} />

            {/* Rotas Públicas (acessíveis mesmo logado para testes) */}
            <Route path="/cardapio" element={<Cardapio />} />
            <Route path="/acompanhar/:id" element={<OrderTracking />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </OrderProvider>
  );
}

// Estilos simples para limpar o JSX
const linkStyle = {
  color: "white",
  textDecoration: "none",
  fontWeight: "bold" as const, // Força o tipo correto
  padding: "5px 10px",
  background: "rgba(255,255,255,0.2)",
  borderRadius: "5px",
};

const logoutStyle = {
  background: "#d63031",
  border: "none",
  color: "white",
  padding: "5px 10px",
  borderRadius: "4px",
  cursor: "pointer",
};