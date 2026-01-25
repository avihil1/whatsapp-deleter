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
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined 
    }
});

// Display QR code for scanning if session is not saved or expired
client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE: ', 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(qr));
    qrcode.generate(qr, { small: true });
});

// --- Debugging Events ---

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN:', percent, message);
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED: Session saved successfully.');
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE:', msg);
});

client.on('ready', async () => {
    console.log('READY: Bot is fully connected and listening!');
    
    const myNumber = '972532704724@c.us';
    console.log(`Attempting to send startup message to ${myNumber}...`);
    
    try {
        await client.sendMessage(myNumber, '🛡️ Vibe Shield is active and debugging is ON!');
        console.log('SUCCESS: Startup message sent.');
    } catch (err) {
        console.log('NOTICE: Could not send startup message. This usually happens if the self-chat is not synced.');
    }
});

client.on('message', async (msg) => {
    const rawTargets = process.env.TARGET_NUMBERS || "";
    const blackList = rawTargets.split(',').map(num => num.trim() + '@c.us');
    
    const sender = msg.author || msg.from; 
    const isGroup = msg.from.endsWith('@g.us');
    const isTarget = blackList.includes(sender);

    // Logging every message to identify why the bot might be "inconsistent"
    console.log(`[New Message] From: ${msg.from} | Sender: ${sender} | In Group: ${isGroup} | Is Target: ${isTarget}`);

    if (isGroup && isTarget) {
        try {
            await msg.delete(false); 
            console.log(`✅ ACTION: Deleted message from ${sender} in group ${msg.from}`);
        } catch (err) {
            console.error(`❌ ERROR: Failed to delete message. Error:`, err.message);
        }
    }
});

client.on('disconnected', (reason) => {
    console.log('DISCONNECTED: Client was logged out.', reason);
});

client.initialize();