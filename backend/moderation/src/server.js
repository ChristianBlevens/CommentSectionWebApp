const config = require('./config');
const { initializeDatabase } = require('./db/init');
const app = require('./app');

// Start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Start listening
    const server = app.listen(config.server.port, () => {
      console.log(`Moderation service running on port ${config.server.port}`);
      console.log(`Environment: ${config.server.env}`);
      console.log(`Admin features: ${config.admin.isConfigured ? 'Enabled' : 'Disabled'}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();