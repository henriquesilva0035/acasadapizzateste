import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import readline from 'readline';

// Configuração da interface de pergunta no terminal
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Comandos ESC/POS para a Elgin i7 (80mm)
const INIT = '\x1B@';
const FONTE_GIGANTE = '\x1B\x21\x38'; // Expandido + Negrito
const ALINHAR_CENTRO = '\x1Ba\x01';
const PULAR_LINHA = '\n';
const CORTE = '\n\n\n\n\x1DV\x42\x00';

function enviarParaImpressora(mesaNumero) {
    let buffer = INIT + ALINHAR_CENTRO + PULAR_LINHA;
    
    // Cabeçalho decorativo opcional
    buffer += '\x1B\x21\x00' + "--------------------------------" + PULAR_LINHA;
    
    // Nome da Mesa bem grande
    buffer += FONTE_GIGANTE + `MESA ${mesaNumero}` + PULAR_LINHA;
    
    // Rodapé decorativo
    buffer += '\x1B\x21\x00' + "--------------------------------" + PULAR_LINHA;
    
    // Comando de corte automático
    buffer += CORTE;

    const tempFilePath = path.join(process.cwd(), 'etiqueta_avulsa.txt');
    
    try {
        fs.writeFileSync(tempFilePath, buffer, { encoding: 'binary' });
        
        // Comando de cópia para a impressora compartilhada como 'ELGIN'
        exec(`COPY /B "${tempFilePath}" "\\\\127.0.0.1\\ELGIN"`, (err) => {
            if (err) {
                console.error(`❌ Erro ao imprimir Mesa ${mesaNumero}:`, err);
            } else {
                console.log(`✅ Mesa ${mesaNumero} enviada com sucesso!`);
            }
            perguntaMesa(); // Pergunta novamente após imprimir
        });
    } catch (e) {
        console.error("❌ Erro no arquivo:", e);
    }
}

function perguntaMesa() {
    rl.question('\nDigite o número da mesa para imprimir (ou "sair" para fechar): ', (resposta) => {
        if (resposta.toLowerCase() === 'sair') {
            rl.close();
            return;
        }

        const num = parseInt(resposta);
        if (!isNaN(num)) {
            enviarParaImpressora(num);
        } else {
            console.log("⚠️ Por favor, digite apenas números.");
            perguntaMesa();
        }
    });
}

console.log("--- GERADOR DE ETIQUETAS ELGIN i7 ---");
perguntaMesa();