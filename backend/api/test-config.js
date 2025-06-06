// Test configuration loading
require('dotenv').config();
const config = require('./src/config');

console.log('Discord Configuration Test:');
console.log('-------------------------');
console.log('Client ID:', config.discord.clientId ? `${config.discord.clientId.substring(0, 8)}...` : '(not set)');
console.log('Client Secret:', config.discord.clientSecret ? '(set)' : '(not set)');
console.log('Redirect URI:', config.discord.redirectUri);
console.log('Is Configured:', config.discord.isConfigured);
console.log('');
console.log('Environment Variables:');
console.log('DISCORD_CLIENT_ID:', process.env.DISCORD_CLIENT_ID || '(not set)');
console.log('DISCORD_CLIENT_SECRET:', process.env.DISCORD_CLIENT_SECRET ? '(set)' : '(not set)');