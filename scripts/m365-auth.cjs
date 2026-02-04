/**
 * Microsoft 365 Authentication Setup for NanoClaw
 *
 * This script guides you through setting up Azure AD authentication
 * for the M365 MCP server (Outlook, Teams, Planner).
 *
 * Run with: node scripts/m365-auth.cjs
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Microsoft 365 Authentication Setup for NanoClaw');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('This will authenticate with your work/school Microsoft 365 account');
  console.log('to enable Outlook, Teams, Planner, and Calendar access.');
  console.log('');

  console.log('Step 1: Device Code Authentication');
  console.log('───────────────────────────────────');
  console.log('');
  console.log('A browser window will open for you to sign in to Microsoft.');
  console.log('After signing in, a token will be saved for NanoClaw to use.');
  console.log('');

  await ask('Press Enter to continue...');
  console.log('');
  console.log('Starting authentication...');
  console.log('');

  // Run the M365 MCP server in login mode
  const child = spawn('npx', ['-y', '@softeria/ms-365-mcp-server', '--org-mode', '--login'], {
    stdio: 'inherit',
    shell: true
  });

  child.on('close', async (code) => {
    if (code === 0) {
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  Authentication successful!');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');
      console.log('The token has been saved. Now you need to add it to your .env file.');
      console.log('');

      // Check common token locations
      const homeDir = process.env.USERPROFILE || process.env.HOME;
      const possiblePaths = [
        path.join(homeDir, '.ms365-mcp', 'token.json'),
        path.join(homeDir, '.config', 'ms365-mcp', 'token.json'),
      ];

      let tokenPath = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          tokenPath = p;
          break;
        }
      }

      if (tokenPath) {
        console.log(`Token found at: ${tokenPath}`);
        console.log('');

        try {
          const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
          const accessToken = tokenData.access_token || tokenData.accessToken;

          if (accessToken) {
            console.log('Add this line to your .env file:');
            console.log('');
            console.log(`MS365_MCP_OAUTH_TOKEN=${accessToken.substring(0, 50)}...`);
            console.log('');
            console.log('(Token truncated for display - copy from token.json)');
            console.log('');

            const addToEnv = await ask('Add token to .env automatically? (y/n): ');

            if (addToEnv.toLowerCase() === 'y') {
              const envPath = path.join(__dirname, '..', '.env');
              let envContent = '';

              if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf-8');
                // Remove existing MS365 token if present
                envContent = envContent.split('\n')
                  .filter(line => !line.startsWith('MS365_MCP_OAUTH_TOKEN='))
                  .join('\n');
                if (!envContent.endsWith('\n')) envContent += '\n';
              }

              envContent += `MS365_MCP_OAUTH_TOKEN=${accessToken}\n`;
              fs.writeFileSync(envPath, envContent);

              console.log('');
              console.log('Token added to .env!');
              console.log('');
              console.log('Next steps:');
              console.log('1. Rebuild the container: docker build -t nanoclaw-agent:latest ./container');
              console.log('2. Restart NanoClaw: node scripts/stop-service.cjs && node scripts/install-service.cjs');
              console.log('3. Test by asking Dude: "@Dude check my calendar"');
            }
          }
        } catch (err) {
          console.log('Could not read token automatically.');
          console.log(`Check ${tokenPath} and copy the access_token to .env`);
        }
      } else {
        console.log('Token file not found in expected locations.');
        console.log('Check ~/.ms365-mcp/ or ~/.config/ms365-mcp/ for token.json');
      }
    } else {
      console.log('');
      console.log('Authentication failed or was cancelled.');
      console.log('Run this script again to retry.');
    }

    rl.close();
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  rl.close();
  process.exit(1);
});
