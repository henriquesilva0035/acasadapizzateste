// ARQUIVO: web/src/config.ts

// Seu link fixo e bonitão (Para quem acessa de longe/Vercel https://api-ocachorrao.operaeats.com.br)
const LINK_ONLINE = 'https://api-teste-ocachorrao.operaeats.com.br';

// Seu endereço local (Para funcionar SEM INTERNET dentro da loja)
// IMPORTANTE: O IP do seu computador servidor tem que ser esse mesmo.
const LINK_LOCAL = 'http://10.0.0.114:3333'; 

export const API_URL = 
  window.location.hostname === 'localhost' || window.location.hostname.includes('10.0')
  ? LINK_LOCAL   // Se detectar que está dentro da loja, usa o cabo/wifi local
  : LINK_ONLINE; // Se estiver na rua (Vercel), usa o Cloudflare