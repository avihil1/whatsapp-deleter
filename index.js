const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './sessions' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process', // Helps with memory on low-tier cloud plans
            '--no-zygote'
        ],
        // This ensures Puppeteer uses the Chrome installed by Nixpacks
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined 
    }
});

client.on('qr', (qr) => {
    // This will print to your Railway "Logs" tab
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('Bot is live in the cloud!'));

client.on('message', async (msg) => {
    const targetID = '972523905680@c.us'; // The exact ID of the person
    if (msg.author === targetID || msg.from === targetID) {
        try {
            await msg.delete(false); // Delete for me only
            console.log("Erased a message from the target.");
        } catch (e) {
            console.error("Delete failed:", e);
        }
    }
});

client.initialize();