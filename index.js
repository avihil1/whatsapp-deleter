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
            console.log("Sending startup message to 972532704724@c.us");
            //const chat = await client.getChatById('972532704724@c.us');
            //console.log(chat);
            await client.sendMessage('972532704724@c.us', '🛡️ Vibe Shield is active!');
            console.log(`Startup message sent to ${myNumber}`);
        } catch (err) {
            console.log('Still could not send message, but bot is active and listening.');
        }
    }, 5000);
});

client.on('message', async (msg) => {
    const rawTargets = process.env.TARGET_NUMBERS || "";
    const blackList = rawTargets.split(',').map(num => num.trim() + '@c.us');

    const isGroup = msg.from.endsWith('@g.us');
    const sender = msg.author || msg.from; // in group it's author, in private it's from

    // Debug critical log - it will tell us exactly what's happening
    console.log(`--- New Message ---`);
    console.log(`From: ${msg.from} (Is Group: ${isGroup})`);
    console.log(`Sender ID: ${sender}`);
    console.log(`Blacklist: ${blackList.join(', ')}`);

    if (isGroup && blackList.includes(sender)) {
        try {
            await msg.delete(false);
            console.log(`✅ Vibe Check: Deleted message from ${sender}`);
        } catch (err) {
            console.error("❌ Failed to delete:", err);
        }
    } else {
        console.log("ℹ️ Message ignored: Not a target or not in group.");
    }
});

client.initialize();