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
