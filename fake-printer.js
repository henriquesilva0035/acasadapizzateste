// fake-printer.js
const net = require('net');

// Porta padrão de impressoras térmicas
const PORT = 9100; 

const server = net.createServer((socket) => {
  console.log('\n🖨️  IMPRESSORA VIRTUAL CONECTADA!');
  console.log('------------------------------------------------');

  socket.on('data', (data) => {
    // Converte os códigos binários para texto legível
    // (Os símbolos estranhos são comandos de corte/negrito)
    const texto = data.toString();
    console.log(texto);
  });

  socket.on('end', () => {
    console.log('------------------------------------------------');
    console.log('✅ Fim da impressão (Corte de Papel)\n');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  =========================================
   🤖 SIMULADOR DE IMPRESSORA INICIADO
   📡 Ouvindo na porta ${PORT}
   
   Configure sua API para IP: 127.0.0.1
  =========================================
  `);
});