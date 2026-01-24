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
    const myNumber = process.env.MY_NUMBER.trim() + '@c.us'; 
    setTimeout(async () => {
        try {
            const chat = await client.getChatById('972532704724@c.us');
            await chat.sendMessage('🛡️ Vibe Shield is active!');
            console.log("Startup message sent successfully!");            //await client.sendMessage(myNumber, '🛡️ Vibe Shield is active!');
            //console.log(`Startup message sent to ${myNumber}`);
        } catch (err) {
            console.log('Still could not send message, but bot is active and listening.');
        }
    }, 5000);
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