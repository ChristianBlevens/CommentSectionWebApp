const { Pool } = require('pg');

// PostgreSQL connection pool setup
const pgPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'comments_db',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT) || 5432,
});

async function recalculateAnalytics() {
    console.log('Starting analytics recalculation...');
    
    try {
        // Import the analytics calculator
        const { AnalyticsCalculator } = require('./jobs/analytics-calculator');
        const calculator = new AnalyticsCalculator(pgPool);
        
        // Clear existing analytics data
        console.log('Clearing existing analytics data...');
        await pgPool.query('DELETE FROM analytics_cache');
        
        // Repopulate historical data with correct totalComments
        console.log('Repopulating historical data...');
        await calculator.populateHistoricalData();
        
        console.log('Analytics recalculation complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error recalculating analytics:', error);
        process.exit(1);
    }
}

// Export the AnalyticsCalculator class properly
const AnalyticsCalculator = require('./jobs/analytics-calculator').AnalyticsCalculator;
if (!AnalyticsCalculator) {
    // If not exported, we need to update the analytics-calculator.js file
    console.log('AnalyticsCalculator class needs to be exported. Updating file...');
}

recalculateAnalytics();