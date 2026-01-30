import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';

// --- CORREÇÃO DO ERRO __dirname ---
// Como estamos usando ES Modules, precisamos criar essas variáveis manualmente:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ----------------------------------

class BackupService {
  private sourceFile: string;
  private intervalMs: number;
  private lastBackupAt: Date | null = null;
  private isRunning = false;
  
  // --- CONFIGURAÇÃO DO SEU E-MAIL ---
  private emailConfig = {
      user: 'henriquesilva0035@gmail.com', // ⚠️ COLOQUE SEU E-MAIL
      pass: 'dsqs fnba rzfg yrni', // ⚠️ COLOQUE SUA SENHA DE APP
      to: 'operaeatsdev@gmail.com' 
  };
  // ----------------------------------

  constructor() {
    // Agora o __dirname vai funcionar corretamente
    this.sourceFile = path.resolve(__dirname, '..', 'prisma', 'dev.db');
    
    // Intervalo padrão do backup automático.
    // Recomendado: 30 minutos (1000 * 60 * 30).
    // Obs: você ainda terá um "Backup Final" no botão de Fechar (manual),
    // então não precisa deixar isso muito curto.
    this.intervalMs = 1000 * 60 * 30;
  }

  public start() {
    console.log(`✉️ Serviço de Backup por E-mail iniciado. Intervalo: ${Math.round(this.intervalMs / 60000)} minutos.`);
    
    // Espera 10 segs para ligar e faz o primeiro envio
    setTimeout(() => this.realizarBackup('startup'), 10000);

    // Agenda os próximos
    setInterval(() => this.realizarBackup('interval'), this.intervalMs);
  }

  /**
   * Força um backup imediatamente (usado no "Fechar" no PDV).
   * Retorna status para o front mostrar "pode desligar".
   */
  public async runNow(reason: string = 'manual') {
    return await this.realizarBackup(reason, true);
  }

  public getLastBackupAt() {
    return this.lastBackupAt;
  }

  private async realizarBackup(reason: string, throwOnError = false) {
    if (this.isRunning) {
      const msg = 'Backup já está em execução.';
      return { ok: false, reason: 'already_running', message: msg, lastBackupAt: this.lastBackupAt };
    }

    this.isRunning = true;
    const data = new Date();
    const nomeArquivo = `backup-${data.getDate()}-${data.getMonth()+1}-${data.getHours()}h${data.getMinutes()}.db`;
    
    console.log(`📦 [${reason}] Preparando envio de: ${nomeArquivo}...`);

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: this.emailConfig.user,
                pass: this.emailConfig.pass
            }
        });

        const mailOptions = {
            from: `"Sistema A casa da Pizza" <${this.emailConfig.user}>`,
            to: this.emailConfig.to,
            subject: `📦 Backup DB - ${data.toLocaleString()}`,
            text: 'Segue em anexo o backup automático do banco de dados.',
            attachments: [
                {
                    filename: nomeArquivo,
                    content: fs.createReadStream(this.sourceFile)
                }
            ]
        };

        await transporter.sendMail(mailOptions);
        this.lastBackupAt = new Date();
        console.log(`✅ [EMAIL] Backup enviado com sucesso para ${this.emailConfig.to}`);

        return {
          ok: true,
          filename: nomeArquivo,
          sentTo: this.emailConfig.to,
          lastBackupAt: this.lastBackupAt,
        };

    } catch (erro) {
        console.error('❌ [ERRO EMAIL] Falha ao enviar backup:', erro);

        const payload = {
          ok: false,
          reason: 'send_failed',
          message: 'Falha ao enviar backup por e-mail',
          lastBackupAt: this.lastBackupAt,
        };

        if (throwOnError) throw erro;
        return payload;
    } finally {
        this.isRunning = false;
    }
  }
}

export default new BackupService();