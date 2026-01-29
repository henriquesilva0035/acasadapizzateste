// ARQUIVO: src/OrderTracking.tsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch } from "./lib/api";
import { getSocket } from "./lib/api"; // Usa o socket global

// CORES baseadas no seu print
const THEME = {
  orange: "#800000", // Laranja do topo
  bg: "#F4F4F4",     // Fundo cinza claro
  green: "#00C853",  // Verde botões
  text: "#333",
  white: "#FFF"
};

const STEPS = [
  { status: "PENDING", label: "ENVIADO", icon: "🕒" },
  { status: "PREPARING", label: "PREPARANDO", icon: "👨‍🍳" },
  { status: "DELIVERED", label: "EM ENTREGA", icon: "🛵" },
  { status: "CLOSED", label: "CONCLUÍDO", icon: "✅" },
];

export default function OrderTracking() {
  const { id } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    // 1. Carrega dados iniciais
    apiFetch(`/orders/${id}`).then(setOrder).catch(console.error);

    // 2. Conecta Socket
    const skt = getSocket();
    setSocket(skt);

    // 3. Ouve atualizações deste pedido específico
    const eventName = `order:updated:${id}`;
    skt.on(eventName, (updatedOrder: any) => {
      console.log("Atualização recebida!", updatedOrder);
      setOrder(updatedOrder);
    });

    return () => { skt.off(eventName); };
  }, [id]);

  if (!order) return <div style={{ padding: 20, textAlign: "center" }}>Carregando pedido...</div>;

  // Calcula passo atual (0 a 3)
  const currentStepIndex = STEPS.findIndex(s => s.status === order.status) || 0;
  const statusLabel = STEPS[currentStepIndex]?.label || "DESCONHECIDO";

  // Telefone da loja para o botão "Falar com restaurante"
  const WHATSAPP_LOJA = "5581994601157"; 
  // Adicione isso antes do return do componente
console.log("STATUS ATUAL DO PEDIDO:", order.status);

  return (
    <div style={{ minHeight: "100vh", background: THEME.bg, fontFamily: "sans-serif" }}>
      
      {/* HEADER LARANJA */}
      <div style={{ background: THEME.orange, padding: "30px 20px 60px", color: "white", textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900 }}>#{order.idString.slice(0, 4)}</h1>
        <div style={{ marginTop: 8, fontSize: 14, opacity: 0.9, letterSpacing: 1 }}>
          {statusLabel}
        </div>
      </div>

      <div style={{ maxWidth: 500, margin: "-40px auto 0", padding: "0 20px" }}>
        
        {/* CARD STATUS (TIMELINE) */}
        <div style={{ background: "white", borderRadius: 20, padding: 20, boxShadow: "0 10px 30px rgba(0,0,0,0.1)", marginBottom: 20 }}>
           <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
              {/* Linha de fundo cinza */}
              <div style={{ position: "absolute", top: 15, left: 10, right: 10, height: 2, background: "#eee", zIndex: 0 }} />
              
              {/* Linha de progresso laranja */}
              <div style={{ 
                  position: "absolute", top: 15, left: 10, zIndex: 0, height: 2, background: THEME.orange, 
                  width: `${(currentStepIndex / (STEPS.length - 1)) * 100}%`, transition: "width 0.5s" 
              }} />

              {STEPS.map((step, idx) => {
                const active = idx <= currentStepIndex;
                return (
                  <div key={step.status} style={{ zIndex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ 
                        width: 30, height: 30, borderRadius: "50%", 
                        background: active ? THEME.orange : "#eee", 
                        color: active ? "white" : "#999",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: "bold", border: "2px solid white", boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
                    }}>
                        {active ? step.icon : idx + 1}
                    </div>
                    <div style={{ fontSize: 9, marginTop: 6, color: active ? THEME.orange : "#ccc", fontWeight: "bold" }}>
                        {step.label}
                    </div>
                  </div>
                )
              })}
           </div>
        </div>

        {/* CARD RESUMO PEDIDO */}
        <div style={{ background: "white", borderRadius: 20, padding: 20, boxShadow: "0 5px 15px rgba(0,0,0,0.05)", marginBottom: 20 }}>
           <div style={{ borderBottom: "1px dashed #eee", paddingBottom: 15, marginBottom: 15 }}>
              <strong style={{ color: "#333", fontSize: 16 }}>Resumo do Pedido</strong>
              <div style={{ fontSize: 12, color: THEME.green }}>Pedido Confirmado ✅</div>
           </div>

           {order.items.map((item: any, i: number) => (
             <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 14 }}>
                <span style={{ color: "#555" }}>{item.quantity}x {item.product}</span>
                <span style={{ fontWeight: "bold" }}>R$ {Number(item.price * item.quantity).toFixed(2)}</span>
             </div>
           ))}

           <div style={{ borderTop: "1px dashed #eee", paddingTop: 15, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, color: "#777", fontSize: 14 }}>
                 <span>Subtotal</span>
                 <span>R$ {(order.total - (order.deliveryFee || 0)).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, color: "#777", fontSize: 14 }}>
                 <span>Frete</span>
                 <span>R$ {Number(order.deliveryFee || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: "900", color: "#333" }}>
                 <span>TOTAL</span>
                 <span>R$ {Number(order.total).toFixed(2)}</span>
              </div>
           </div>
        </div>

        {/* CARD ENDEREÇO */}
        <div style={{ background: "white", borderRadius: 20, padding: 20, boxShadow: "0 5px 15px rgba(0,0,0,0.05)", marginBottom: 20, display:"flex", alignItems:"center", gap: 15 }}>
           <div style={{ fontSize: 24, color: THEME.orange }}>📍</div>
           <div>
              <strong style={{ display: "block", color: "#333", fontSize: 14 }}>Endereço de Entrega</strong>
              <div style={{ fontSize: 13, color: "#777", marginTop: 2 }}>{order.customerAddress || "Retirada no Local"}</div>
           </div>
        </div>

        {/* BOTÃO WHATSAPP */}
        <a 
          href={`https://wa.me/${WHATSAPP_LOJA}?text=Olá, queria saber sobre meu pedido #${order.idString.slice(0,4)}`} 
          target="_blank"
          style={{ 
            display: "block", width: "90%", padding: 16, borderRadius: 12, 
            background: THEME.green, color: "white", textAlign: "center", 
            textDecoration: "none", fontWeight: "900", fontSize: 16,
            boxShadow: "0 5px 15px rgba(0, 200, 83, 0.3)" 
          }}
        >
           FALAR COM RESTAURANTE
        </a>

        <Link to="/cardapio" style={{ display: "block", textAlign: "center", marginTop: 20, color: "#999", textDecoration: "none", fontSize: 14 }}>
           Voltar ao cardápio
        </Link>

      </div>
    </div>
  );
}