const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('--- System Starting Up ---');

const client = new Client({
    authStrategy: new LocalAuth({ 
        dataPath: '/app/sessions',
        clientId: "vibe-shield-final" 
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-js/main/dist/wppconnect-wa.js',
    },
    puppeteer: {
        headless: true,
        // Increase timeout to prevent the crash you just saw
        protocolTimeout: 60000, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined 
    }
});

client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE: ', 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(qr));
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('READY: Bot is fully connected!');
});

client.on('loading_screen', (percent, message) => { console.log('LOADING SCREEN:', percent, message);});
client.on('authenticated', () => { console.log('AUTHENTICATED: Session saved successfully.');});
client.on('auth_failure', msg => { console.error('AUTHENTICATION FAILURE:', msg); });

client.on('message', async (msg) => {
    // 1. Quick exit if not a group message
    if (!msg.from.endsWith('@g.us')) return;

    try {
        const rawTargets = process.env.TARGET_NUMBERS || "";
        // Clean list: just the numbers from Railway
        const blackList = rawTargets.split(',').map(num => num.trim());
        
        const senderId = msg.author || msg.from; // This is the @lid or @c.us string
        
        // 2. Logic: Check if ANY number from your blacklist exists inside the senderId string
        // This works because "9725..." is usually embedded inside the LID or is the ID itself
        const isTarget = blackList.some(num => senderId.includes(num));

        console.log(`[Msg] Group: ${msg.from} | Sender: ${senderId} | Match: ${isTarget}`);

        if (isTarget) {
            await msg.delete(false); // Delete only for the bot's account
            console.log(`✅ SUCCESS: Message from ${senderId} deleted.`);
        }
    } catch (err) {
        console.error(`❌ Error processing message:`, err.message);
    }
});

client.on('disconnected', (reason) => {
    console.log('DISCONNECTED:', reason);
});

client.initialize();