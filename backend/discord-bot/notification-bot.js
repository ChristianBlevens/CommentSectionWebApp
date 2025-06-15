const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Pool } = require('pg');
const redis = require('redis');

// Express for health checks
const app = express();
const port = process.env.PORT || 3002;

// Database connection
const pgPool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
});

// Redis connection
const redisSubscriber = redis.createClient({
    url: process.env.REDIS_URL
});

// Discord bot
const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages
    ]
});

// Initialize database
async function initDatabase() {
    await pgPool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"mentions": true}'::jsonb
    `);
    
    await pgPool.query(`
        CREATE TABLE IF NOT EXISTS notification_log (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) REFERENCES users(id),
            type VARCHAR(50),
            status VARCHAR(50),
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Handle mentions
async function handleMention(data) {
    const { mentionedUserId, commentId, pageId, authorName, preview } = data;
    
    try {
        const result = await pgPool.query(
            'SELECT discord_id, name, notification_preferences FROM users WHERE id = $1',
            [mentionedUserId]
        );
        
        if (!result.rows.length) return;
        
        const user = result.rows[0];
        const prefs = user.notification_preferences || { mentions: true };
        
        if (!prefs.mentions) return;
        
        const discordId = user.discord_id.replace('discord_', '');
        const deepLink = `${process.env.FRONTEND_URL}/?pageId=${pageId}#comment-${commentId}`;
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('💬 You were mentioned in a comment')
            .setDescription(preview.substring(0, 200))
            .addFields(
                { name: 'Mentioned by', value: authorName, inline: true },
                { name: 'Page', value: pageId, inline: true }
            )
            .setURL(deepLink)
            .setTimestamp();
        
        const discordUser = await discordClient.users.fetch(discordId);
        await discordUser.send({ embeds: [embed] });
        
        console.log(`Notification sent to ${user.name}`);
    } catch (error) {
        console.error('Failed to send notification:', error);
    }
}

// Start bot
async function start() {
    await redisSubscriber.connect();
    await initDatabase();
    await discordClient.login(process.env.DISCORD_BOT_TOKEN);
    
    await redisSubscriber.subscribe('comment:mentions', async (message) => {
        const data = JSON.parse(message);
        await handleMention(data);
    });
    
    app.listen(port, () => {
        console.log(`Discord bot running on port ${port}`);
    });
}

start();