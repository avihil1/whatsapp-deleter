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
    console.log('READY: Bot is fully connected!');

    try {
        // Use the internal info of the client to send a message to yourself
        const myId = client.info.wid._serialized; 
        console.log(`Attempting startup message to self (${myId})...`);
        
        await client.sendMessage(myId, '🛡️ Vibe Shield is active and LID-ready!');
        console.log('SUCCESS: Startup message sent.');
    } catch (err) {
        // This is common on cloud restarts; don't let it worry you
        console.log('NOTICE: Self-message failed. This is a known sync delay, but the bot is listening to groups.');
    }
});

client.on('message', async (msg) => {
    const rawTargets = process.env.TARGET_NUMBERS || "";
    const blackList = rawTargets.split(',').map(num => num.trim());
    
    // Get the contact to extract the actual phone number, bypassing @lid issues
    const contact = await msg.getContact();
    const senderNumber = contact.number; // This returns the clean phone number
    const senderId = msg.author || msg.from;
    
    const isGroup = msg.from.endsWith('@g.us');
    // Check if either the ID or the actual phone number is in the blacklist
    const isTarget = blackList.some(num => senderId.includes(num) || senderNumber.includes(num));

    console.log(`[New Message] From: ${msg.from} | SenderID: ${senderId} | Number: ${senderNumber} | Is Target: ${isTarget}`);

    if (isGroup && isTarget) {
        try {
            await msg.delete(false); 
            console.log(`✅ ACTION: Deleted message from ${senderNumber}`);
        } catch (err) {
            console.error(`❌ ERROR: Failed to delete. Error:`, err.message);
        }
    }
});

client.on('disconnected', (reason) => {
    console.log('DISCONNECTED: Client was logged out.', reason);
});

client.initialize();