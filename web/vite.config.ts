import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Isso libera o acesso na rede (já devia estar funcionando pelo --host)
    allowedHosts: true, // <--- ADICIONE ESTA LINHA (Libera o Ngrok)
  }
})