const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth({ 
        dataPath: '/app/sessions',
        clientId: "vibe-shield-main"
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined 
    }
});

client.on('qr', (qr) => {
    console.log('Scan this QR code: ', 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(qr));
    qrcode.generate(qr, { small: true });
});

// Function that runs when the bot connects successfully
client.on('ready', async () => {
    console.log('Bot is live in the cloud!');

    // Your number (WhatsApp number)
    const myNumber = process.env.MY_NUMBER + '@c.us'; 
    try {
        await client.sendMessage('972532704724@c.us', '🛡️ Vibe Shield is active! The bot is connected and working 24/7.');
        await client.sendMessage(myNumber, '🛡️ Vibe Shield is active! The bot is connected and working 24/7.');
    } catch (err) {
        console.log('Could not send startup message to', myNumber, 'but bot is working.');
    }
});

client.on('message', async (msg) => {
    // Reading the list of numbers from Railway
    const rawTargets = process.env.TARGET_NUMBERS || "";
    const blackList = rawTargets.split(',').map(num => num.trim() + '@c.us');

    // Only delete in groups, when the sender is in the blacklist
    if (msg.from.endsWith('@g.us') && msg.author && blackList.includes(msg.author)) {
        try {
            await msg.delete(false); // Only delete for me
            console.log(`Vibe Check: Deleted message from ${msg.author}`);
        } catch (err) {
            console.error("Failed to delete:", err);
        }
    }
    else { // debug
        console.log("Not in group or not in blacklist", msg.from);
    }
});

client.initialize();