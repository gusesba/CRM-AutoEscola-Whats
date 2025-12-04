// whatsappClient.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

class WhatsAppClient {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
        });

        this.init();
    }

    init() {
        this.client.on('qr', qr => {
            console.log('\n📱 Escaneie o QR Code abaixo:\n');
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', async () => {
            console.log('✅ WhatsApp conectado!');

            const chats = await this.client.getChats();

            for (const chat of chats) {
                console.log("\n📂 Chat:", chat.name || chat.id.user);

                const messages = await chat.fetchMessages({ limit: 200 }); 
                // limite recomendado para não travar
                // WhatsApp não permite pegar tudo de uma vez — é paginação de 200 em 200

                for (const m of messages) {
                    console.log(`- ${m.from}: ${m.body}`);
                }
            }
        });

        this.client.on('authenticated', () => {
            console.log('🔐 Autenticado!');
        });

        this.client.on('auth_failure', msg => {
            console.error('❌ Falha de autenticação:', msg);
        });

        this.client.on('message', msg => {
            console.log("📩 RECEBIDA:", msg.from, msg.body);
        });

        this.client.on('message_create', msg => {
            // Quando VOCÊ envia, o WhatsApp marca como 'fromMe'
            if (msg.fromMe) {
                console.log("📤 ENVIADA POR VOCÊ:", msg.to, msg.body);
            }
        });

        this.client.initialize();
    }
    
    onMessage(msg) {
        console.log(`📩 Mensagem de ${msg.from}: ${msg.body}`);

        // Resposta simples de teste
        if (msg.body.toLowerCase() === 'ping') {
            msg.reply('pong!');
        }
    }

    /**
     * Função para enviar mensagens manualmente
     */
    async sendMessage(to, message) {
        try {
            await this.client.sendMessage(to, message);
            console.log(`➡️ Mensagem enviada para ${to}`);
        } catch (err) {
            console.error('Erro ao enviar mensagem:', err);
        }
    }

    
}

module.exports = new WhatsAppClient();
