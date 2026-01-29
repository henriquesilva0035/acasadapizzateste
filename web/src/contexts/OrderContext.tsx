// ARQUIVO: src/contexts/OrderContext.tsx

import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import io, { Socket } from 'socket.io-client';
import { API_URL } from '../config'; // Importa sua configuração existente

interface Order {
  idString: string; 
  status: string;
  total: number;
  items: any[];
  tableId?: number;
  customerName?: string;
  createdAt?: string;
}

interface OrderContextData {
  order: Order | null;
  createOrder: (data: any) => Promise<Order>;
  clearOrder: () => void;
  isLoading: boolean;
  isSubmitting: boolean; // <-- novo
}



const OrderContext = createContext<OrderContextData>({} as OrderContextData);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. CONECTAR AO SOCKET
  useEffect(() => {
    // Conecta ao servidor usando a URL do seu config.ts
    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => console.log("Socket conectado!"));

    return () => { newSocket.close(); };
  }, []);

  // 2. RECUPERAR PEDIDO AO CARREGAR (Correção do F5)
  useEffect(() => {
    async function loadStorage() {
      const savedId = localStorage.getItem('pedido_ativo_id'); // Usando a mesma chave que você já usava
      
      if (savedId) {
        try {
          // Tenta buscar o pedido atualizado
          const response = await fetch(`${API_URL}/orders/${savedId}`);
          const data = await response.json();
          
          if (data && !data.error) {
             setOrder(data);
          } else {
             // Se o pedido não existe mais, limpa
             localStorage.removeItem('pedido_ativo_id');
          }
        } catch (error) {
          console.log("Erro ao recuperar pedido (pode ser internet off):", error);
        }
      }
      setIsLoading(false);
    }
    loadStorage();
  }, []);

  // 3. OUVIR MUDANÇAS EM TEMPO REAL
useEffect(() => {
  if (!socket || !order?.idString) return;

  const eventName = `order:updated:${order.idString}`;
  console.log("Ouvindo evento:", eventName);

  const handleUpdate = (updatedOrder: Order) => {
    console.log("Atualização recebida via Socket!", updatedOrder);
    setOrder(updatedOrder);

    if (updatedOrder.status === "CLOSED") {
      // opcional
      // localStorage.removeItem("pedido_ativo_id");
      // setOrder(null);
    }
  };

  socket.on(eventName, handleUpdate);

  return () => {
    socket.off(eventName, handleUpdate);
  };
}, [socket, order?.idString]);


  // 4. FUNÇÃO DE CRIAR PEDIDO
  async function createOrder(data: any) {
  if (isSubmitting) {
    throw new Error("Pedido já está sendo enviado");
  }

  setIsSubmitting(true);

  try {
    const response = await fetch(`${API_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.error || "Erro ao criar pedido");
    }

    const newOrder = await response.json();

    setOrder(newOrder);
    localStorage.setItem("pedido_ativo_id", newOrder.idString);

    return newOrder;
  } finally {
    setIsSubmitting(false);
  }
}


  function clearOrder() {
      localStorage.removeItem('pedido_ativo_id');
      setOrder(null);
  }

 return (
  <OrderContext.Provider
    value={{
      order,
      createOrder,
      clearOrder,
      isLoading,
      isSubmitting,
    }}
  >
    {children}
  </OrderContext.Provider>
);
}

export function useOrder() {
  return useContext(OrderContext);
}