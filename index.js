const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    // This saves your login data in a folder named .wwebjs_auth
    authStrategy: new LocalAuth({
        dataPath: './sessions' 
    }),
    puppeteer: {
        headless: true,
        // Crucial flags for running in a cloud container
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ],
    }
});

client.on('qr', (qr) => {
    // This will print to your Railway "Logs" tab
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('Bot is live in the cloud!'));

client.on('message', async (msg) => {
    const targetID = '972500000000@c.us'; // The exact ID of the person
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