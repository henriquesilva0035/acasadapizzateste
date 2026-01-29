export type ItemPedido = {
  nome: string;
  quantidade: number;
  descricao?: string;  // Novo: Sabores (Ex: 1/2 Calabresa...)
  adicionais?: string; // Novo: Bordas e extras
};

export type PedidoInfo = {
  lojaNome: string;
  clienteNome: string;
  pedidoId: string;
  itens: ItemPedido[];
  tipoEntrega: 'ENTREGA' | 'RETIRADA';
  endereco?: string;
  valorTotal: number;
};

// TEMPLATE DE NOVO PEDIDO (PENDING)
export function novoPedidoRealizadoTemplate(pedido: PedidoInfo): string {
  const primeiroNome = pedido.clienteNome.split(' ')[0];

  // AQUI MUDOU: Agora montamos uma lista detalhada
  const listaItens = pedido.itens
    .map((i) => {
        let itemTexto = `• ${i.quantidade}x *${i.nome}*`;
        
        // Se tiver descrição (Sabores), coloca embaixo em itálico
        if (i.descricao) {
            itemTexto += `\n   _${i.descricao}_`;
        }
        
        // Se tiver adicionais (Borda), coloca com um +
        if (i.adicionais) {
            itemTexto += `\n   + ${i.adicionais}`;
        }
        
        return itemTexto;
    })
    .join('\n\n'); // Dois \n para dar espaço entre os itens

  let mensagem =
    `🍔 *${pedido.lojaNome}*\n\n` +
    `Olá *${primeiroNome}*! 👋\n` +
    `Sou o assistente virtual do Cachorrão.\n\n` +
    `✅ *Recebemos seu pedido #${pedido.pedidoId}*!\n\n` +
    `📦 *Resumo do Pedido:*\n${listaItens}\n\n` +
    `💰 *Valor Total:* R$ ${pedido.valorTotal.toFixed(2)}\n\n`;

  if (pedido.tipoEntrega === 'ENTREGA' && pedido.endereco) {
    mensagem += `📍 *Endereço de Entrega:*\n${pedido.endereco}\n\n`;
  } else {
    mensagem += `🏃 *Retirada no Balcão*\n\n`;
  }

  mensagem +=
    `Obrigado por nos escolher! ❤️\n` +
    `Vamos te atualizando sobre o status do seu pedido por aqui.`;

  return mensagem;
}

// TEMPLATE DE STATUS (PREPARING, DELIVERED, CANCELED)
export function statusPedidoTemplate(
  pedido: PedidoInfo,
  status: 'PREPARING' | 'DELIVERED' | 'CANCELED'
): string {
  const primeiroNome = pedido.clienteNome.split(' ')[0];

  switch (status) {
    case 'PREPARING':
      return (
        `🍔 *${pedido.lojaNome}*\n\n` +
        `Oba, *${primeiroNome}*! 👨‍🍳🔥\n\n` +
        `O restaurante confirmou seu pedido *#${pedido.pedidoId}* e ele já está sendo preparado!\n\n` +
        `Assim que sair para entrega eu te aviso. 😉`
      );

    case 'DELIVERED':
      return (
        `🍔 *${pedido.lojaNome}*\n\n` +
        `🛵 *Saiu para entrega!*\n\n` +
        `Seu pedido já está a caminho, *${primeiroNome}*.\n\n` +
        `Muito obrigado pela preferência e confiança em nosso trabalho! ❤️\n\n` +
        `Esperamos que sua experiência seja incrível. Bom apetite! 😋`
      );

    case 'CANCELED':
      return (
        `🍔 *${pedido.lojaNome}*\n\n` +
        `Oi *${primeiroNome}*.\n\n` +
        `Infelizmente seu pedido *#${pedido.pedidoId}* precisou ser cancelado.\n` +
        `Entre em contato conosco para mais detalhes.`
      );
      
    default:
        return '';
  }
}