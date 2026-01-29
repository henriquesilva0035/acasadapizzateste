import wppconnect, { Whatsapp } from '@wppconnect-team/wppconnect';
// Importamos o novo template "novoPedidoRealizadoTemplate"
import { novoPedidoRealizadoTemplate, statusPedidoTemplate, PedidoInfo } from './whatsappTemplates';

class WhatsappService {
  private client: Whatsapp | null = null;
  private isReady = false;

  constructor() {
    this.iniciar();
  }

  private iniciar() {
    wppconnect
      .create({
        session: 'delivery-session',
        headless: false, // Pode mudar para true depois
        logQR: true,
        autoClose: false,
        puppeteerOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      })
      .then((client) => {
        this.client = client;
        this.isReady = true;
        console.log('✅ [WHATSAPP] Assistente Virtual conectado!');
      })
      .catch((erro) => {
        console.error('❌ [WHATSAPP] Erro ao iniciar:', erro);
      });
  }

  private limparNumero(phone: string): string {
    let num = phone.replace(/\D/g, '');
    if (!num.startsWith('55')) {
      num = '55' + num;
    }
    return num;
  }

  public async enviarNotificacao(order: any) {
    if (!this.client || !this.isReady) {
      console.log('⏳ [WHATSAPP] Ainda não está pronto');
      return;
    }

    const phone = order.customerPhone;
    if (!phone || phone.length < 10) return;

    // --- PREPARA OS DADOS ---
    const infoPedido: PedidoInfo = {
        lojaNome: 'O Cachorrão',
        clienteNome: order.customerName,
        pedidoId: order.idString.slice(0, 5).toUpperCase(),
        itens: order.items ? order.items.map((i: any) => ({
            nome: i.product,
            quantidade: i.quantity,
            descricao: i.description,
            adicionais: i.additions
        })) : [],
        tipoEntrega: order.deliveryFee > 0 ? 'ENTREGA' : 'RETIRADA',
        endereco: order.customerAddress,
        valorTotal: order.total // Passando o valor total aqui
    };

    let mensagemFinal = '';

    // --- SELECIONA O TEXTO BASEADO NO STATUS ---
    if (order.status === 'PENDING') {
        // Novo pedido (acabou de chegar)
        mensagemFinal = novoPedidoRealizadoTemplate(infoPedido);
    }
    else if (order.status === 'PREPARING') {
        mensagemFinal = statusPedidoTemplate(infoPedido, 'PREPARING');
    } 
    else if (order.status === 'DELIVERED') {
        mensagemFinal = statusPedidoTemplate(infoPedido, 'DELIVERED');
    }
    else if (order.status === 'CANCELED') {
        mensagemFinal = statusPedidoTemplate(infoPedido, 'CANCELED');
    }
    else {
        return; 
    }

    // --- ENVIO ---
    try {
      const numeroLimpo = this.limparNumero(phone);
      const statusNumero = await this.client.checkNumberStatus(`${numeroLimpo}@c.us`);

      if (!statusNumero?.canReceiveMessage) {
        console.log('⚠️ [WHATSAPP] Número inválido');
        return;
      }

      const chatId = statusNumero.id._serialized;
      await new Promise((r) => setTimeout(r, 500)); // Delay humano
      
      await this.client.sendText(chatId, mensagemFinal);

      console.log(`📤 [WHATSAPP] Enviado para ${infoPedido.clienteNome} (${order.status})`);
    } catch (err) {
      console.error('❌ [WHATSAPP] Erro ao enviar:', err);
    }
  }
}

export default new WhatsappService();