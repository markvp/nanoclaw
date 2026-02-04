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
