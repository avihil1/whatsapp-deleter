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
    try {
        const rawTargets = process.env.TARGET_NUMBERS || "";
        // Clean list of numbers (e.g., "972501234567")
        const blackList = rawTargets.split(',').map(num => num.trim());
        
        const isGroup = msg.from.endsWith('@g.us');
        if (!isGroup) return; // Optimization: Ignore non-group messages immediately

        const senderId = msg.author || msg.from; 
        
        // Extract ONLY the digits from the sender string (works for @c.us and @lid)
        const senderDigits = senderId.split('@')[0];

        // Check if any blacklisted number is contained within the sender's ID
        const isTarget = blackList.some(num => senderDigits.includes(num));

        console.log(`[Msg] From: ${msg.from} | SenderID: ${senderId} | Is Target: ${isTarget}`);

        if (isTarget) {
            await msg.delete(false); 
            console.log(`✅ ACTION: Deleted message from ${senderId}`);
        }
    } catch (err) {
        // Catch errors inside the message event to prevent the whole bot from crashing
        console.error(`❌ Error in message handler:`, err.message);
    }
});

client.on('disconnected', (reason) => {
    console.log('DISCONNECTED:', reason);
});

client.initialize();