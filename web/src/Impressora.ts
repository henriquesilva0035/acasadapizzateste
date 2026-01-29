
import { API_URL } from './config'
export async function imprimir(dados: any, tipo: 'PEDIDO' | 'CONTA' | 'DELIVERY') {


  try {
    let endpoint = '';
    let body = {};

    // 1. Se for Pedido de Delivery ou Pedido de Mesa
    if (tipo === 'DELIVERY' || tipo === 'PEDIDO') {
        const id = dados.idString; // O ID do pedido
        endpoint = `${API_URL}/orders/${id}/print`;
        
    } 
    // 2. Se for Fechamento de Conta (Mesa)
    else if (tipo === 'CONTA') {
        const id = dados.id; // O ID da mesa
        endpoint = `${API_URL}/tables/${id}/print-account`;
        body = { paymentMethod: 'A CONFERIR' }; // Texto padrão para prévia
    }

    // Envia o comando para o servidor
    console.log("Enviando comando de impressão para:", endpoint);
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (res.ok) {
        // Sucesso! Não precisa fazer nada visual, a impressora vai reagir.
        console.log("✅ Comando enviado para o servidor com sucesso.");
    } else {
        alert("Erro: O servidor não conseguiu imprimir. Verifique se a impressora está ligada.");
    }

  } catch (error) {
    console.error("Erro de conexão ao imprimir:", error);
    alert("Erro de conexão com o servidor.");
  }
}