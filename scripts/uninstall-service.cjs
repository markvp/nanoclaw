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
