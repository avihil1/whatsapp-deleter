const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('--- System Starting Up ---');

const client = new Client({
    authStrategy: new LocalAuth({ 
        dataPath: './sessions',
        clientId: "vibe-shield-final" 
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-js/main/dist/wppconnect-wa.js',
    },
    puppeteer: {
        headless: true,
        // Increase timeout to prevent the crash on startup in cases of low resources availablity
        protocolTimeout: 60000, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu',
            //'--single-process',
            //'--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined 
    }
});

client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE: ', 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(qr));
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ READY: Bot is fully connected!');
});

client.on('loading_screen', (percent, message) => { console.log('LOADING SCREEN:', percent, message);});
client.on('authenticated', () => { console.log('AUTHENTICATED: Session saved successfully.');});
client.on('auth_failure', msg => { console.error('AUTHENTICATION FAILURE:', msg); });

client.on('message', async (msg) => {
    // 1. Quick exit if not a group message
    if (!msg.from.endsWith('@g.us')) {
        console.log(`[Msg] Not a group message: ${msg.from || msg.author}`);
        return;
    }

    try {
        const rawTargets = process.env.TARGET_NUMBERS || "";
        const blackList = rawTargets.split(',').map(num => num.trim());
                
        const contact = await msg.getContact();
        const senderNumber = contact.number; // This is the clean phone number (e.g., 97250...)

        console.log(`[Msg] Group: ${msg.from} | Sender: ${senderNumber} | name: notifyName: ${msg._data.notifyName}`);
        if(!senderNumber) return;

        const isTarget = blackList.some(num => senderNumber.includes(num));
        if (isTarget) {
            // Delete only for the bot's account
            // if you're an admin, you can delete the message for all members - by changing the parameter to true
            await msg.delete(false); 
            console.log(`✅ SUCCESS: Message from ${senderNumber} deleted.`);
        }
    } catch (err) {
        console.error(`❌ Error processing message:`, err.message);
    }
});

client.on('disconnected', (reason) => { console.log('DISCONNECTED:', reason); });

const shutdown = async (signal) => {
    console.log(`[${new Date().toISOString()}] Received ${signal}. Closing browser...`);
    try {
        await client.destroy();
        console.log('Browser closed. Exiting process.');
        process.exit(0);
    } catch (err) {
        process.exit(1);
    }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.initialize();
