const axios = require('axios');
const config = require('../config');

class ModerationClient {
  constructor() {
    this.client = axios.create({
      baseURL: config.moderation.apiUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
  
  async checkContent(content, userId = null, pageId = null) {
    try {
      const response = await this.client.post('/api/moderate', {
        content,
        userId,
        pageId,
      });
      
      return response.data;
    } catch (error) {
      console.error('Moderation service error:', error.message);
      
      // If moderation service is down, allow content but log it
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.warn('Moderation service unavailable, allowing content');
        return {
          approved: true,
          reason: null,
          confidence: 0,
          warning: 'Moderation service unavailable',
        };
      }
      
      throw error;
    }
  }
  
  async getUserTrustScore(userId) {
    try {
      const response = await this.client.get(`/api/users/${userId}/trust`);
      return response.data.trustScore;
    } catch (error) {
      console.error('Failed to get user trust score:', error.message);
      return 0.5; // Default trust score
    }
  }
  
  async updateUserMetrics(userId, metrics) {
    try {
      await this.client.post(`/api/users/${userId}/metrics`, metrics);
    } catch (error) {
      console.error('Failed to update user metrics:', error.message);
    }
  }
  
  async getBlockedWords() {
    try {
      const response = await this.client.get('/api/blocked-words');
      return response.data;
    } catch (error) {
      console.error('Failed to get blocked words:', error.message);
      return [];
    }
  }
  
  async checkHealth() {
    try {
      const response = await this.client.get('/api/health');
      return response.data;
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

module.exports = new ModerationClient();