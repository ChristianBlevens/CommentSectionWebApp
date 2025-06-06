const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const userService = require('./userService');
const { safeRedisOp, client: redisClient } = require('../db/redis');

class AuthService {
  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }
  
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(
        `${config.discord.apiEndpoint}/oauth2/token`,
        new URLSearchParams({
          client_id: config.discord.clientId,
          client_secret: config.discord.clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: config.discord.redirectUri,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Discord token exchange error:', error.response?.data || error.message);
      throw new Error('Failed to exchange authorization code');
    }
  }
  
  async getDiscordUser(accessToken) {
    try {
      const response = await axios.get(`${config.discord.apiEndpoint}/users/@me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      return response.data;
    } catch (error) {
      console.error('Discord user fetch error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Discord user');
    }
  }
  
  async authenticateDiscordUser(code, state) {
    // Exchange code for token
    const tokenData = await this.exchangeCodeForToken(code);
    
    // Get user info from Discord
    const discordUser = await this.getDiscordUser(tokenData.access_token);
    
    // Prepare user data
    const userData = {
      id: `discord_${discordUser.id}`,
      email: discordUser.email || `${discordUser.id}@discord.user`,
      name: discordUser.global_name || discordUser.username,
      picture: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5}.png`,
    };
    
    // Create or update user in database
    const user = await userService.create(userData);
    
    // Generate session token
    const sessionToken = this.generateSessionToken();
    
    // Store session in Redis
    await safeRedisOp(() =>
      redisClient.setEx(
        `session:${sessionToken}`,
        config.session.duration,
        user.id
      )
    );
    
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        is_moderator: user.is_moderator,
      },
      sessionToken,
    };
  }
  
  async logout(sessionToken) {
    await safeRedisOp(() => redisClient.del(`session:${sessionToken}`));
  }
  
  async validateSession(sessionToken) {
    const userId = await safeRedisOp(() => redisClient.get(`session:${sessionToken}`));
    
    if (!userId) {
      return null;
    }
    
    // Refresh session TTL
    await safeRedisOp(() =>
      redisClient.expire(`session:${sessionToken}`, config.session.duration)
    );
    
    const user = await userService.findById(userId);
    return user;
  }
  
  async getSessionInfo(sessionToken) {
    const ttl = await safeRedisOp(() => redisClient.ttl(`session:${sessionToken}`));
    const userId = await safeRedisOp(() => redisClient.get(`session:${sessionToken}`));
    
    if (!userId || ttl < 0) {
      return null;
    }
    
    return {
      userId,
      expiresIn: ttl,
      expiresAt: new Date(Date.now() + ttl * 1000),
    };
  }
}

module.exports = new AuthService();