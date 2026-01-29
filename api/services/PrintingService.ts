import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

// Configurações para conseguir ler caminhos de arquivos no Node.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PrintingService {
  private printerName: string;
  private MARGEM_CLIENTE = '   ';
  private MARGEM_CONTA = '  '; // 2 espaços (ajusta se quiser mais)

  // ==============================================================================
  // 🖨️ COMANDOS ESC/POS
  // ==============================================================================
  private INIT = '\x1B@';           
  private ALIGN_CENTER = '\x1B\x61\x01'; 
  private ALIGN_LEFT = '\x1B\x61\x00';   
  private ALIGN_RIGHT = '\x1B\x61\x02';  

  private LEFT_MARGIN = '\x1D\x4C\x20\x00'; // GS L 24 dots (~3mm). Pode ajustar.
  private LEFT_MARGIN_RESET = '\x1D\x4C\x00\x00';

  private BOLD_ON = '\x1B\x45\x01';  
  private BOLD_OFF = '\x1B\x45\x00'; 

  
  // -- TAMANHOS DE FONTE --
  // ===== TAMANHOS COMPATÍVEIS COM ELGIN I7 =====
  private SIZE_NORMAL = '\x1B\x21\x00'; // Normal
  private SIZE_DOUBLE_HEIGHT = '\x1B\x21\x10'; // Altura dupla
  private SIZE_BIG = '\x1B\x21\x30'; // Altura + largura dupla
  private SIZE_MEGA = '\x1B\x21\x38'; // MÁXIMO possível na Elgin


  private CUT = '\n\n\n\n\x1DV\x42\x00'; 
  private LINE = '------------------------------------------------'; 

  constructor() {
    this.printerName = 'ELGIN'; // Confirme o nome da impressora
  }

  private limparTexto(texto: string): string {
    if (!texto) return '';
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // ==============================================================================
  // 🚀 IMPRIMIR PEDIDO (COZINHA / ENTREGA)
  // ==============================================================================
  async printOrder(order: any) {
    const idCurto = order.idString?.slice(0,4) ?? '----';
    console.log(`🖨️ Processando impressão do pedido: ${idCurto}`);
    
    
    // --- 1. FILTRO DE ECONOMIA DE PAPEL ---
    const categoriasBebida = ['BEBIDAS', 'REFRIGERANTE', 'AGUA', 'CERVEJA', 'REFRIGERANTES'];

    if (order.origin !== 'CLOUD') {
    console.log("DEBUG PRINT ITEMS:", order.items.map((i:any)=>({
        product: i.product,
        category: i.category
        })));

    const soTemBebida =
        Array.isArray(order.items) &&
        order.items.length > 0 &&
        order.items.every((item: any) => {
        const cat = this.limparTexto(String(item.category || ""))
            .toUpperCase()
            .trim();

        // ✅ se category vier vazio, considera que NÃO é bebida (pra não bloquear pizza+refri por engano)
        if (!cat) return false;

        return categoriasBebida.some(c => cat.includes(c));
        });


    if (soTemBebida) {
        console.log("🚫 Economia: pedido só bebida. Ignorado.");
        return;
    }
    }


    // --- 2. GERA O CONTEÚDO ---
    const conteudo = this.gerarLayoutBonito(order);

    // --- 3. LÓGICA DE CÓPIAS ---
   let copias = 1;

    if (order.origin === 'CLOUD') {
      // Pega o endereço/bairro e converte para maiúsculo para verificar
      const endereco = (order.customerAddress || "").toUpperCase();
      
      // Se tiver "RETIRADA" no nome (ex: "Retirada no Balcão"), é 1 cópia.
      // Se não, são 2 cópias (Entrega).
      if (endereco.includes("RETIRADA")) {
          copias = 1;
      } else {
          copias = 2;
      }
    }

    for (let i = 0; i < copias; i++) {
      await this.enviarParaImpressora(conteudo);
      if (i < copias - 1) await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // ==============================================================================
  // 💰 IMPRIMIR CONTA (FECHAMENTO DE MESA)
  // ==============================================================================
  async printAccount(table: any, paymentMethod: string) {
  const conteudo = this.gerarConteudoConta(table, paymentMethod);

  const copias = 1; // 1 via cliente + 1 via lanchonete

  for (let i = 0; i < copias; i++) {
    await this.enviarParaImpressora(conteudo);
    if (i < copias - 1) await new Promise(resolve => setTimeout(resolve, 1500));
  }
}



  private gerarLayoutBonito(order: any) {

    let buffer = this.INIT + this.LEFT_MARGIN;

    const mostrarValoresNoPedido = order.origin === 'CLOUD'

    const idCurto = (order.idString || "----").substring(0, 4).toUpperCase();

    
    // --- LÓGICA DO CABEÇALHO ---
    let cabecalho = 'ENTREGA'; // Padrão

    if (order.origin === 'CLOUD') {
        // >>> LÓGICA ONLINE: Verifica se o endereço escolhido contem "RETIRADA" <<<
        // O app manda "Retirada no Balcão" como se fosse o endereço/bairro
        const enderecoCompleto = (order.customerAddress || "").toUpperCase();
        
        if (enderecoCompleto.includes("RETIRADA")) {
            cabecalho = 'RETIRADA';
        } else {
            cabecalho = 'ENTREGA';
        }
    } else {
        // >>> LÓGICA LOCAL (MESA): Verifica se o garçom marcou "Pra Viagem" <<<
        if (order.isTakeout) {
            cabecalho = 'VIAGEM'; // Ou "RETIRADA", como preferir
        } else {
            // Se tem número de mesa, mostra MESA XX, senão só MESA
            cabecalho = order.tableId ? `MESA ${order.tableId}` : 'MESA';
        }
    }
    // ---------------------------
    
    buffer += this.ALIGN_CENTER;

    // 1. ID GIGANTE
    buffer += this.BOLD_ON + this.SIZE_MEGA + `${idCurto}\n` + this.SIZE_NORMAL + this.BOLD_OFF;
    
    // 2. TIPO GIGANTE (MESA / VIAGEM / RETIRADA / ENTREGA)
    buffer += this.LINE + "\n"; 
    buffer += this.BOLD_ON + this.SIZE_MEGA + `${cabecalho}\n` + this.SIZE_NORMAL + this.BOLD_OFF;
    buffer += this.LINE + "\n"; 
    
    buffer += "O CACHORRAO\n"; 
    
    // ... continua o resto do código igual ...
    
    // --- AQUI ESTÁ A DATA E HORA DE VOLTA ---
    const dt = new Date();
    const dataHora = `${dt.toLocaleDateString("pt-BR")} ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    buffer += `DATA: ${dataHora}\n`;
    buffer += this.LINE + "\n";
    // ----------------------------------------

    // CLIENTE
    buffer += this.BOLD_ON + this.SIZE_BIG + "CLIENTE\n" + this.SIZE_NORMAL + this.BOLD_OFF + this.ALIGN_LEFT;
    
    if (order.origin === 'CLOUD') {
        buffer += this.SIZE_DOUBLE_HEIGHT + `Nome: ${this.limparTexto(order.customerName)}\n` + this.SIZE_NORMAL;
        buffer += this.SIZE_DOUBLE_HEIGHT + `${this.MARGEM_CLIENTE}Tel: ${order.customerPhone || 'Nao informado'}\n` + this.SIZE_NORMAL;

        
        if (
          order.origin === 'CLOUD' &&
          order.customerAddress &&
          cabecalho !== 'RETIRADA'
        ) {
			buffer += "\n";
			buffer += this.BOLD_ON + this.SIZE_DOUBLE_HEIGHT + "ENTREGAR EM:\n" ;
            buffer += this.SIZE_NORMAL;

		    const endereco = this.limparTexto(order.customerAddress);

		    let ruaNumero = endereco;
		    let bairro = "";

    // tenta separar por hífen (mais comum)
	 if (endereco.includes("-")) {
        const partes = endereco.split("-");
        ruaNumero = partes[0].trim();
        bairro = partes.slice(1).join("-").trim();
    }

    // linha 1: rua + número (fonte maior)
    buffer += this.SIZE_DOUBLE_HEIGHT + `${this.MARGEM_CLIENTE}${ruaNumero}\n` + this.SIZE_NORMAL;
  


    // linha 2: bairro (normal, recuado)
    if (bairro) {
        buffer += this.SIZE_DOUBLE_HEIGHT + `${this.MARGEM_CLIENTE}${bairro}\n` + this.SIZE_NORMAL;
    }

    buffer += this.BOLD_OFF;
    if (order.deliveryFee) {
        buffer += `${this.MARGEM_CLIENTE}Taxa: R$ ${Number(order.deliveryFee).toFixed(2)}\n`;
    }
}

    } else {
        buffer += this.SIZE_DOUBLE_HEIGHT + `${this.MARGEM_CLIENTE}MESA: ${order.tableId}\n` + this.SIZE_NORMAL;

        buffer += this.SIZE_DOUBLE_HEIGHT + `${this.MARGEM_CLIENTE}Nome: ${this.limparTexto(order.customerName)}\n` + this.SIZE_NORMAL;
        if(order.waiterName) buffer += this.SIZE_DOUBLE_HEIGHT + `${this.MARGEM_CLIENTE}Garcom: ${this.limparTexto(order.waiterName)}\n` + this.SIZE_NORMAL;
    }
    buffer += "\n"; 

    // LISTA DE PRODUTOS
    buffer += this.ALIGN_CENTER + this.BOLD_ON + this.SIZE_BIG + "ITENS" + this.SIZE_NORMAL + this.BOLD_OFF + "\n";
    buffer += this.LINE + "\n" + this.ALIGN_LEFT;

    order.items.forEach((item: any) => {
        const qtdNome = `${item.quantity}x ${this.limparTexto(item.product)}`;
        buffer += this.BOLD_ON + this.SIZE_DOUBLE_HEIGHT + this.MARGEM_CLIENTE + qtdNome + this.SIZE_NORMAL + this.BOLD_OFF + "\n";

        
        // Detalhes (Sabores, Borda, Adicionais)
        if (item.flavors && item.flavors.length > 1) {
             buffer += this.formatarSabores(item.flavors);
        }

        if (item.border && item.border.length > 1) {
            buffer += `   >> BORDA: ${this.limparTexto(item.border)}\n`;
        }

        if (item.additions && item.additions.length > 1) {
        const adds = item.additions
            .split(',')
            .map((a: string) => a.trim())
            .filter(Boolean);

        const jaTemBorda = !!(item.border && String(item.border).trim().length > 0);
        const addsFiltrados = adds
            .filter(a => {
            const up = a.toUpperCase();
            if (jaTemBorda && up.includes("BORDA")) return false; // evita duplicar borda
            return true;
            })
            .filter((a, i, arr) => arr.findIndex(x => x.toUpperCase() === a.toUpperCase()) === i);
        addsFiltrados.forEach((a: string) => {
            buffer += `   + ${this.limparTexto(a)}\n`;
            });
         }
        
        if (item.observation && item.observation.length > 1) {
            buffer += this.BOLD_ON + `   OBS: ${this.limparTexto(item.observation)}\n` + this.BOLD_OFF;
        }

    

        
        // PREÇO
    if (mostrarValoresNoPedido) {
        let precoStr = "";
        if (item.price === 0) precoStr = "*** GRATIS ***";
        else precoStr = `R$ ${(item.price * item.quantity).toFixed(2)}`;

        buffer += this.ALIGN_RIGHT + this.SIZE_DOUBLE_HEIGHT + precoStr + " " + this.SIZE_NORMAL + "\n" + this.ALIGN_LEFT;
    }
        buffer += this.LINE + "\n";
    
    });

    if (mostrarValoresNoPedido) {
    // TOTAIS
    buffer += "\n";
    const subtotal = order.total - (order.deliveryFee || 0);
    
    buffer += this.ALIGN_RIGHT;
    buffer += `Subtotal: R$ ${subtotal.toFixed(2)} \n`;
    if (order.deliveryFee) {
        buffer += `Taxa Entrega: R$ ${order.deliveryFee.toFixed(2)} \n`;
    }
    buffer += this.ALIGN_LEFT;
    
    // TOTAL A PAGAR
    buffer += this.LINE + "\n";
    buffer += this.ALIGN_RIGHT + this.BOLD_ON + this.SIZE_BIG + `TOTAL: R$ ${order.total.toFixed(2)} ` + this.SIZE_NORMAL + this.BOLD_OFF + "\n";
    buffer += this.ALIGN_LEFT + this.LINE + "\n";

    // PAGAMENTO
    buffer += this.ALIGN_CENTER + "Forma de Pagamento:\n";
    buffer += this.BOLD_ON + this.SIZE_DOUBLE_HEIGHT + (order.paymentMethod || "A COMBINAR") + this.SIZE_NORMAL + this.BOLD_OFF + "\n";

}
    buffer += this.LEFT_MARGIN_RESET;
    buffer += this.CUT; 
    return buffer;

    
  }

  // ==============================================================================
  // 🧾 GERADOR DE CONTA (COM DATA CORRIGIDA)
  // ==============================================================================
  private gerarConteudoConta(table: any, paymentMethod: string) {
  let buffer = this.INIT + this.LEFT_MARGIN;


  const LOJA_NOME = "O CACHORRAO";
  const LOJA_TEL = "(81) 98984-5484"; // <- troque pelo seu

  const dt = new Date();
  const dataHora = `${dt.toLocaleDateString("pt-BR")} ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  // CABEÇALHO CENTRALIZADO
  buffer += this.ALIGN_CENTER;
  buffer += this.BOLD_ON + this.SIZE_BIG + "FECHAMENTO" + this.SIZE_NORMAL + this.BOLD_OFF + "\n";
  buffer += this.BOLD_ON + this.SIZE_DOUBLE_HEIGHT + `${LOJA_NOME}\n` + this.SIZE_NORMAL + this.BOLD_OFF;
  buffer += `${LOJA_TEL}\n`;
  buffer += `DATA: ${dataHora}\n`;
  buffer += this.LINE + "\n";

  // DADOS DA MESA (com margem)
  buffer += this.ALIGN_LEFT;
  buffer += this.SIZE_DOUBLE_HEIGHT + `${this.MARGEM_CONTA}MESA ${table.id}\n` + this.SIZE_NORMAL;
  if (table.customerName) {
    buffer += this.SIZE_DOUBLE_HEIGHT + `${this.MARGEM_CONTA}Cliente: ${this.limparTexto(table.customerName)}\n` + this.SIZE_NORMAL;
  }
  buffer += this.LINE + "\n";

  // ITENS
  let somaVisual = 0;

  if (table.orders) {
    table.orders.forEach((o: any) => {
      if (o.status === 'CANCELLED') return;

      somaVisual += Number(o.total || 0);

      o.items.forEach((item: any) => {
        const nome = this.limparTexto(item.product);
        const qtd = Number(item.quantity || 1);

        buffer += `${this.MARGEM_CONTA}${qtd}x ${nome}\n`;

        const totalItem = Number(item.price || 0) * qtd;
        const valStr = totalItem === 0 ? "ITEM GRATIS" : `R$ ${totalItem.toFixed(2)}`;

        buffer += this.ALIGN_RIGHT + this.SIZE_DOUBLE_HEIGHT + valStr + this.SIZE_NORMAL + "\n";
        buffer += this.ALIGN_LEFT;
      });
    });
  }

  buffer += this.LINE + "\n";

  // TOTAL (destacado)
  buffer += this.ALIGN_RIGHT;
  buffer += this.BOLD_ON + this.SIZE_BIG + `TOTAL: R$ ${somaVisual.toFixed(2)} ` + this.SIZE_NORMAL + this.BOLD_OFF + "\n";

  // PAGAMENTO + RODAPÉ
  buffer += this.ALIGN_CENTER + "\n";
  buffer += this.SIZE_DOUBLE_HEIGHT + `Pagamento: ${this.limparTexto(paymentMethod)}\n` + this.SIZE_NORMAL;
  buffer += "\nObrigado pela preferencia!\n";
  buffer += this.LEFT_MARGIN_RESET;
  buffer += this.CUT;

  return buffer;
}


  // --- FORMATA SABORES ---
  private formatarSabores(str: string) {
    let buffer = "";
    if (!str) return buffer;
    const lista = str.split(",");
    const MARGEM = '   ';
    if (lista.length >= 2) {
      const fracao = `1/${lista.length}`;
      lista.forEach(s => buffer += MARGEM + `- ${fracao} ${this.limparTexto(s.trim())}\n`);
    } else {
      buffer += MARGEM + `- ${this.limparTexto(str)}\n`;
    }
    return buffer;
  }

  private async enviarParaImpressora(texto: string) {
    return new Promise((resolve) => {
      try {
        const tempFilePath = path.join(process.cwd(), 'print_job.txt');
        fs.writeFileSync(tempFilePath, texto, { encoding: 'binary' });
        exec(`COPY /B "${tempFilePath}" "\\\\127.0.0.1\\${this.printerName}"`, (err) => {
            if (err) console.error("❌ Erro ao enviar para impressora:", err);
            resolve(!err);
        });
      } catch (e) { resolve(false); }
    });
  }
}

const printingService = new PrintingService();
export default printingService;