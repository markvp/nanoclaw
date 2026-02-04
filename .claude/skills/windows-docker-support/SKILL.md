---
name: windows-docker-support
description: Run NanoClaw on Windows using Docker instead of Apple Container. Includes Windows path conversion, service management scripts, and PNG QR code fallback for authentication. Triggers on "windows support", "docker setup", "run on windows", "windows service".
---

# Windows Docker Support

Enables NanoClaw to run on Windows using Docker Desktop instead of Apple Container. This skill adds:

- Auto-detection of container runtime (Docker vs Apple Container)
- Windows path conversion for Docker volume mounts (C:\path → /c/path)
- Windows service management scripts (install/stop/uninstall)
- PNG QR code fallback for WhatsApp authentication in terminals with limited display

## Prerequisites

- Docker Desktop for Windows installed and running
- Node.js 20+ installed
- NanoClaw cloned and dependencies installed (`npm install`)

## What This Changes

| File | Change |
|------|--------|
| `src/config.ts` | Add CONTAINER_RUNTIME setting, fix HOME_DIR for Windows |
| `src/container-runner.ts` | Add Docker support with Windows path conversion |
| `src/index.ts` | Add Docker startup check |
| `container/build.sh` | Auto-detect runtime for building |
| `package.json` | Add node-windows and qrcode dependencies |
| `scripts/install-service.cjs` | New: Windows service installer |
| `scripts/stop-service.cjs` | New: Windows service stop script |
| `scripts/uninstall-service.cjs` | New: Windows service uninstaller |
| `src/whatsapp-auth-png.ts` | New: QR code auth with PNG output |

## Step-by-Step Instructions

### 1. Update Configuration

**File: `src/config.ts`**

Find the HOME_DIR line (around line 8):

```typescript
const HOME_DIR = process.env.HOME || '/Users/user';
```

Replace with:

```typescript
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/Users/user';
```

After the `CONTAINER_IMAGE` export (around line 24), add:

```typescript
// Container runtime: 'docker' or 'container' (Apple Container)
// Auto-detect: use Docker if available and not on macOS, otherwise Apple Container
export const CONTAINER_RUNTIME =
  process.env.CONTAINER_RUNTIME ||
  (process.platform !== 'darwin' ? 'docker' : 'container');
```

### 2. Update Container Runner

**File: `src/container-runner.ts`**

Add the import for CONTAINER_RUNTIME at the top with the other config imports:

```typescript
import {
  CONTAINER_IMAGE,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_RUNTIME,  // Add this
  CONTAINER_TIMEOUT,
  DATA_DIR,
  GROUPS_DIR,
  // ... rest of imports
} from './config.js';
```

Find the `buildContainerArgs` function and replace its body with:

```typescript
function buildContainerArgs(mounts: VolumeMount[]): string[] {
  const args: string[] = ['run', '-i', '--rm'];

  if (CONTAINER_RUNTIME === 'docker') {
    // Docker: use --mount for all mounts with consistent syntax
    for (const mount of mounts) {
      // Convert Windows paths to Docker-compatible format
      let hostPath = mount.hostPath;
      if (process.platform === 'win32') {
        // Convert C:\path to /c/path for Docker on Windows
        hostPath = hostPath.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
        hostPath = hostPath.replace(/\\/g, '/');
      }

      if (mount.readonly) {
        args.push(
          '--mount',
          `type=bind,source=${hostPath},target=${mount.containerPath},readonly`,
        );
      } else {
        args.push('-v', `${hostPath}:${mount.containerPath}`);
      }
    }
  } else {
    // Apple Container: --mount for readonly, -v for read-write
    for (const mount of mounts) {
      if (mount.readonly) {
        args.push(
          '--mount',
          `type=bind,source=${mount.hostPath},target=${mount.containerPath},readonly`,
        );
      } else {
        args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
      }
    }
  }

  args.push(CONTAINER_IMAGE);
  return args;
}
```

Find the `spawn('container', ...)` call in `runContainerAgent` and change it to:

```typescript
const container = spawn(CONTAINER_RUNTIME, containerArgs, {
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

### 3. Update Main Entry Point

**File: `src/index.ts`**

Add CONTAINER_RUNTIME to the imports from config:

```typescript
import {
  ASSISTANT_NAME,
  CONTAINER_RUNTIME,  // Add this
  DATA_DIR,
  IPC_POLL_INTERVAL,
  // ... rest of imports
} from './config.js';
```

Find the `ensureContainerSystemRunning` function and replace it entirely:

```typescript
function ensureContainerSystemRunning(): void {
  if (CONTAINER_RUNTIME === 'docker') {
    // Docker: just verify it's running
    try {
      execSync('docker info', { stdio: 'pipe' });
      logger.debug('Docker is running');
    } catch (err) {
      logger.error({ err }, 'Docker is not running');
      console.error(
        '\n╔════════════════════════════════════════════════════════════════╗',
      );
      console.error(
        '║  FATAL: Docker is not running                                  ║',
      );
      console.error(
        '║                                                                ║',
      );
      console.error(
        '║  Agents require Docker. To fix:                               ║',
      );
      console.error(
        '║  1. Start Docker Desktop (Windows/Mac) or docker service      ║',
      );
      console.error(
        '║  2. Restart NanoClaw                                          ║',
      );
      console.error(
        '╚════════════════════════════════════════════════════════════════╝\n',
      );
      throw new Error('Docker is required but not running');
    }
  } else {
    // Apple Container
    try {
      execSync('container system status', { stdio: 'pipe' });
      logger.debug('Apple Container system already running');
    } catch {
      logger.info('Starting Apple Container system...');
      try {
        execSync('container system start', { stdio: 'pipe', timeout: 30000 });
        logger.info('Apple Container system started');
      } catch (err) {
        logger.error({ err }, 'Failed to start Apple Container system');
        console.error(
          '\n╔════════════════════════════════════════════════════════════════╗',
        );
        console.error(
          '║  FATAL: Apple Container system failed to start                 ║',
        );
        console.error(
          '║                                                                ║',
        );
        console.error(
          '║  Agents cannot run without Apple Container. To fix:           ║',
        );
        console.error(
          '║  1. Install from: https://github.com/apple/container/releases ║',
        );
        console.error(
          '║  2. Run: container system start                               ║',
        );
        console.error(
          '║  3. Restart NanoClaw                                          ║',
        );
        console.error(
          '╚════════════════════════════════════════════════════════════════╝\n',
        );
        throw new Error('Apple Container system is required but failed to start');
      }
    }
  }
}
```

### 4. Update Build Script

**File: `container/build.sh`**

Replace the build command section with runtime auto-detection:

```bash
# Auto-detect container runtime: prefer Docker if available and working, fallback to Apple Container
if command -v docker &> /dev/null && docker info &> /dev/null; then
  RUNTIME="docker"
elif command -v container &> /dev/null; then
  RUNTIME="container"
else
  echo "Error: No container runtime found. Please install Docker or Apple Container."
  exit 1
fi

echo "Using runtime: ${RUNTIME}"

# Build with detected runtime
${RUNTIME} build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"test\",\"chatJid\":\"test@g.us\",\"isMain\":false}' | ${RUNTIME} run -i ${IMAGE_NAME}:${TAG}"
```

### 5. Add Dependencies

**File: `package.json`**

Add to devDependencies:

```json
"@types/qrcode": "^1.5.6",
"node-windows": "^1.0.0-beta.8",
"qrcode": "^1.5.4",
```

Then run:

```bash
npm install
```

### 6. Create Windows Service Scripts

**Create file: `scripts/install-service.cjs`**

```javascript
/**
 * Install NanoClaw as a Windows Service
 * Run with: node scripts/install-service.cjs
 * Uninstall with: node scripts/uninstall-service.cjs
 */
const fs = require('fs');
const path = require('path');
const Service = require('node-windows').Service;

// Read .env file and parse environment variables
const envPath = path.join(__dirname, '..', '.env');
const envVars = [
  {
    name: 'NODE_ENV',
    value: 'production'
  }
];

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const name = trimmed.substring(0, eqIndex);
      const value = trimmed.substring(eqIndex + 1);
      envVars.push({ name, value });
    }
  }
}

console.log('Environment variables to be set:', envVars.map(e => e.name));

const svc = new Service({
  name: 'NanoClaw',
  description: 'NanoClaw WhatsApp Claude Assistant',
  script: path.join(__dirname, '..', 'dist', 'index.js'),
  workingDirectory: path.join(__dirname, '..'),
  env: envVars
});

svc.on('install', () => {
  console.log('NanoClaw service installed successfully!');
  console.log('Starting service...');
  svc.start();
});

svc.on('start', () => {
  console.log('NanoClaw service started!');
  console.log('');
  console.log('To manage the service:');
  console.log('  - View in Services (services.msc)');
  console.log('  - Stop: node scripts/stop-service.cjs');
  console.log('  - Uninstall: node scripts/uninstall-service.cjs');
});

svc.on('alreadyinstalled', () => {
  console.log('NanoClaw service is already installed.');
  console.log('To reinstall, first run: node scripts/uninstall-service.cjs');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

console.log('Installing NanoClaw as Windows Service...');
console.log('You may see a UAC prompt - click Yes to allow.');
console.log('');
svc.install();
```

**Create file: `scripts/stop-service.cjs`**

```javascript
/**
 * Stop NanoClaw Windows Service
 */
const path = require('path');
const Service = require('node-windows').Service;

const svc = new Service({
  name: 'NanoClaw',
  script: path.join(__dirname, '..', 'dist', 'index.js')
});

svc.on('stop', () => {
  console.log('NanoClaw service stopped!');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

console.log('Stopping NanoClaw service...');
svc.stop();
```

**Create file: `scripts/uninstall-service.cjs`**

```javascript
/**
 * Uninstall NanoClaw Windows Service
 */
const path = require('path');
const Service = require('node-windows').Service;

const svc = new Service({
  name: 'NanoClaw',
  script: path.join(__dirname, '..', 'dist', 'index.js')
});

svc.on('uninstall', () => {
  console.log('NanoClaw service uninstalled successfully!');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

console.log('Uninstalling NanoClaw Windows Service...');
console.log('You may see a UAC prompt - click Yes to allow.');
console.log('');
svc.uninstall();
```

### 7. Create PNG QR Code Authentication Script

**Create file: `src/whatsapp-auth-png.ts`**

```typescript
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
    console.log('Already authenticated with WhatsApp');
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

      console.log('QR code saved! Open this file to scan:');
      console.log(`   ${path.resolve(QR_FILE)}\n`);
      console.log('Steps:');
      console.log('  1. Open the PNG file above');
      console.log('  2. Open WhatsApp on your phone');
      console.log('  3. Tap Settings -> Linked Devices -> Link a Device');
      console.log('  4. Scan the QR code from the PNG\n');
      console.log('Waiting for you to scan...\n');
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;

      if (reason === DisconnectReason.loggedOut) {
        console.log('\nLogged out. Delete store/auth and try again.');
        process.exit(1);
      } else {
        console.log('\nConnection failed. Please try again.');
        process.exit(1);
      }
    }

    if (connection === 'open') {
      console.log('\nSuccessfully authenticated with WhatsApp!');
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
```

## Build and Verify

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Build container image (will auto-detect Docker)
./container/build.sh

# Test PNG QR auth (if needed)
npx tsx src/whatsapp-auth-png.ts

# Install Windows service
node scripts/install-service.cjs
```

## Troubleshooting

### Docker not found

Make sure Docker Desktop is installed and running. Check with:

```bash
docker info
```

### Windows path conversion issues

If you see mount errors, check that paths are being converted correctly. The conversion should turn `C:\Users\foo` into `/c/Users/foo`.

### Service won't install

Run the install script from an elevated (Administrator) command prompt, or accept the UAC prompt when it appears.

### QR code not displaying

Use the PNG fallback script:

```bash
npx tsx src/whatsapp-auth-png.ts
```

This saves the QR code to `whatsapp-qr.png` which you can open in any image viewer to scan.
