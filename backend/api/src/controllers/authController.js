const authService = require('../services/authService');

class AuthController {
  async discordCallback(req, res) {
    const { code, state } = req.body;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    try {
      const result = await authService.authenticateDiscordUser(code, state);
      
      res.json({
        sessionToken: result.sessionToken,
        user: result.user,
      });
    } catch (error) {
      console.error('Discord authentication error:', error);
      
      if (error.message.includes('authorization code')) {
        return res.status(400).json({ error: 'Invalid authorization code' });
      }
      
      res.status(500).json({ error: 'Authentication failed' });
    }
  }
  
  async logout(req, res) {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await authService.logout(token);
    }
    
    res.json({ message: 'Logged out successfully' });
  }
  
  async getSession(req, res) {
    res.json({
      user: req.user,
      sessionInfo: await authService.getSessionInfo(
        req.headers.authorization?.substring(7)
      ),
    });
  }
  
  async refreshSession(req, res) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No session to refresh' });
    }
    
    const token = authHeader.substring(7);
    const user = await authService.validateSession(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        is_moderator: user.is_moderator,
      },
    });
  }
}

module.exports = new AuthController();