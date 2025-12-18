// crm-whatsapp-menu.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const inquirer = require('inquirer');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

let messageQueue = [];

client.on('qr', qr => {
    console.log('\n📱 Escaneie o QR Code abaixo:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp conectado!');
    mainMenu();
});

client.on('message', msg => {
    console.log(`\n📩 Nova mensagem de ${msg.from}: ${msg.body}`);
    messageQueue.push(msg);
    promptNewMessage();
});

client.initialize();

// ---------------- Menu principal ----------------
async function mainMenu() {
    const choices = [
        'Enviar mensagem para um chat existente',
        'Responder mensagem recebida',
        'Sair'
    ];

    const { action } = await inquirer.prompt({
        type: 'list',
        name: 'action',
        message: 'O que deseja fazer?',
        choices
    });

    switch (action) {
        case 'Enviar mensagem para um chat existente':
            await sendMessageToChat();
            break;
        case 'Responder mensagem recebida':
            await replyMessage();
            break;
        case 'Sair':
            console.log('Saindo...');
            process.exit(0);
    }

    mainMenu();
}

// ---------------- Enviar mensagem ----------------
async function sendMessageToChat() {
    const chats = await client.getChats();
    const limitedChats = chats.slice(0, 20); // mostrar só os primeiros 20
    const { chatIndex } = await inquirer.prompt({
        type: 'list',
        name: 'chatIndex',
        message: 'Escolha um chat:',
        choices: limitedChats.map((c, i) => ({ name: c.name || c.id.user, value: i }))
    });

    const chat = limitedChats[chatIndex];
    const { message } = await inquirer.prompt({
        type: 'input',
        name: 'message',
        message: `Digite a mensagem para ${chat.name || chat.id.user}:`
    });

    await chat.sendMessage(message);
    console.log('✅ Mensagem enviada!');
}

// ---------------- Responder mensagem recebida ----------------
async function replyMessage() {
    if (messageQueue.length === 0) {
        console.log('⚠️ Nenhuma mensagem para responder no momento.');
        return;
    }

    const msg = messageQueue.shift();
    const { replyText } = await inquirer.prompt({
        type: 'input',
        name: 'replyText',
        message: `Responder a ${msg.from}: ${msg.body}`
    });

    await msg.reply(replyText);
    console.log('✅ Resposta enviada!');
}

// ---------------- Prompt para novas mensagens ----------------
async function promptNewMessage() {
    if (messageQueue.length === 0) return;

    const msg = messageQueue[0];
    const { action } = await inquirer.prompt({
        type: 'list',
        name: 'action',
        message: `Deseja responder a mensagem de ${msg.from}?`,
        choices: ['Sim', 'Não']
    });

    if (action === 'Sim') {
        const { replyText } = await inquirer.prompt({
            type: 'input',
            name: 'replyText',
            message: 'Digite sua resposta:'
        });

        await msg.reply(replyText);
        console.log('✅ Resposta enviada!');
    }

    messageQueue.shift();
}
