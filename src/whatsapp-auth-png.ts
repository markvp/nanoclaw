/**
 * WhatsApp Authentication Script with PNG QR code output
 *
 * For terminals that can't display the full QR code
 * Saves QR code as PNG file that can be opened and scanned
 */
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import QRCode from 'qrcode';

import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

const AUTH_DIR = './store/auth';
const QR_FILE = './whatsapp-qr.png';

const logger = pino({
  level: 'warn',
});

async function authenticate(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  if (state.creds.registered) {
    console.log('✓ Already authenticated with WhatsApp');
    console.log(
      '  To re-authenticate, delete the store/auth folder and run again.',
    );
    process.exit(0);
  }

  console.log('Starting WhatsApp authentication...\n');
  console.log(`QR code will be saved to: ${path.resolve(QR_FILE)}\n`);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ['NanoClaw', 'Chrome', '1.0.0'],
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Save QR code as PNG file
      await QRCode.toFile(QR_FILE, qr, {
        width: 300,
        margin: 2,
      });

      console.log('📱 QR code saved! Open this file to scan:');
      console.log(`   ${path.resolve(QR_FILE)}\n`);
      console.log('Steps:');
      console.log('  1. Open the PNG file above');
      console.log('  2. Open WhatsApp on your phone');
      console.log('  3. Tap Settings → Linked Devices → Link a Device');
      console.log('  4. Scan the QR code from the PNG\n');
      console.log('Waiting for you to scan...\n');
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;

      if (reason === DisconnectReason.loggedOut) {
        console.log('\n✗ Logged out. Delete store/auth and try again.');
        process.exit(1);
      } else {
        console.log('\n✗ Connection failed. Please try again.');
        process.exit(1);
      }
    }

    if (connection === 'open') {
      console.log('\n✓ Successfully authenticated with WhatsApp!');
      console.log('  Credentials saved to store/auth/');
      console.log('  You can now start the NanoClaw service.\n');

      // Clean up QR file
      if (fs.existsSync(QR_FILE)) {
        fs.unlinkSync(QR_FILE);
        console.log('  QR code file cleaned up.\n');
      }

      setTimeout(() => process.exit(0), 1000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

authenticate().catch((err) => {
  console.error('Authentication failed:', err.message);
  process.exit(1);
});
