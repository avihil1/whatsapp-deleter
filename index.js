const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

console.log('--- System Starting Up ---');

const TARGETS_FILE = path.join(os.homedir(), '.config', 'whatsapp-deleter', 'targets.txt');
let targets = new Set();

function loadTargets() {
    try {
        const raw = fs.readFileSync(TARGETS_FILE, 'utf8');
        targets = new Set(
            raw.split('\n')
               .map(l => l.replace(/#.*/, '').trim())
               .filter(Boolean)
        );
        console.log(`[Targets] Loaded ${targets.size} number(s) from ${TARGETS_FILE}`);
    } catch (err) {
        console.error(`[Targets] Failed to load: ${err.message}`);
        targets = new Set();
    }
}
loadTargets();
fs.watchFile(TARGETS_FILE, { interval: 2000 }, loadTargets);

const FAILURE_THRESHOLD = 3;
let consecutiveFailures = 0;
let notifiedForCurrentStreak = false;

function notify(title, message) {
    const t = title.replace(/"/g, '\\"');
    const m = message.replace(/"/g, '\\"');
    exec(`osascript -e 'display notification "${m}" with title "${t}"'`);
}

function recordFailure(reason) {
    consecutiveFailures++;
    console.error(`[Health] Failure #${consecutiveFailures}: ${reason}`);
    if (consecutiveFailures >= FAILURE_THRESHOLD && !notifiedForCurrentStreak) {
        notify('WhatsApp Deleter', `${consecutiveFailures} consecutive failures: ${reason}`);
        notifiedForCurrentStreak = true;
    }
}

function recordHealthy() {
    if (consecutiveFailures > 0) {
        console.log(`[Health] Recovered after ${consecutiveFailures} failure(s).`);
    }
    consecutiveFailures = 0;
    notifiedForCurrentStreak = false;
}

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './sessions',
        clientId: 'vibe-shield-final'
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-js/main/dist/wppconnect-wa.js',
    },
    puppeteer: {
        headless: true,
        protocolTimeout: 180000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
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
    recordHealthy();
});

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN:', percent, message);
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED: Session saved successfully.');
});

client.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILURE:', msg);
    recordFailure(`auth_failure: ${msg}`);
});

client.on('disconnected', (reason) => {
    console.log('DISCONNECTED:', reason);
    recordFailure(`disconnected: ${reason}`);
});

client.on('message', async (msg) => {
    if (!msg.from.endsWith('@g.us')) return;

    try {
        const contact = await msg.getContact();
        const senderNumber = contact.number;
        if (!senderNumber) return;

        console.log(`[Msg] Group: ${msg.from} | Sender: ${senderNumber} | notifyName: ${msg._data.notifyName}`);

        const isTarget = [...targets].some((num) => senderNumber.includes(num));
        if (isTarget) {
            await msg.delete(false);
            console.log(`✅ SUCCESS: Message from ${senderNumber} deleted.`);
        }
    } catch (err) {
        console.error('❌ Error processing message:', err.message);
    }
});

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
