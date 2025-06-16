const cron = require('node-cron');

class AnalyticsCalculator {
    constructor(pool) {
        this.pool = pool;
    }
    
    async calculateDailyData() {
        console.log('Starting daily analytics calculation...');
        
        // Calculate yesterday's data
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        
        const endDate = new Date(yesterday);
        endDate.setHours(23, 59, 59, 999);
        
        // Query for top 50 pages
        const query = `
            SELECT 
                c.page_id,
                COUNT(DISTINCT c.id) as comment_count
            FROM comments c
            WHERE c.created_at >= $1
                AND c.created_at <= $2
            GROUP BY c.page_id
            HAVING COUNT(DISTINCT c.id) > 0
            ORDER BY comment_count DESC
            LIMIT 50
        `;
        
        const result = await this.pool.query(query, [yesterday, endDate]);
        
        // Query for total comments across ALL pages
        const totalQuery = `
            SELECT COUNT(DISTINCT c.id) as total_count
            FROM comments c
            WHERE c.created_at >= $1
                AND c.created_at <= $2
        `;
        
        const totalResult = await this.pool.query(totalQuery, [yesterday, endDate]);
        const totalComments = parseInt(totalResult.rows[0].total_count) || 0;
        
        const pages = result.rows.map(row => ({
            pageId: row.page_id,
            pageName: `Page ${row.page_id}`,
            url: `#page-${row.page_id}`,
            commentCount: parseInt(row.comment_count)
        }));
        
        const data = {
            pages: pages,
            period: {
                start: yesterday.toISOString(),
                end: endDate.toISOString()
            },
            date: yesterday.toISOString().split('T')[0],
            totalComments: totalComments
        };
        
        // Store with absolute date as key for easier management
        await this.pool.query(`
            INSERT INTO analytics_cache (period_type, period_date, data, generated_at)
            VALUES ('day', $1, $2, NOW())
            ON CONFLICT (period_type, period_date) 
            DO UPDATE SET data = $2, generated_at = NOW()
        `, [yesterday.toISOString().split('T')[0], data]);
        
        // Clean up old daily data (keep 90 days for quarterly calculations)
        await this.cleanupOldData('day', 90);
        
        console.log('Daily analytics calculation complete');
    }
    
    async calculateWeeklyData() {
        console.log('Starting rolling 7-day analytics calculation...');
        
        // Calculate for the last 7 days (rolling window)
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1); // Yesterday
        endDate.setHours(23, 59, 59, 999);
        
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 6); // 7 days ago
        startDate.setHours(0, 0, 0, 0);
        
        // Get daily data for the rolling 7-day period
        const dailyData = await this.getDailyDataForPeriod(startDate, endDate);
        
        if (dailyData.length === 0) {
            console.log('No daily data available for the rolling 7-day period');
            return;
        }
        
        // Aggregate the daily data
        const pageMap = new Map();
        
        dailyData.forEach(day => {
            if (day.data && day.data.pages) {
                day.data.pages.forEach(page => {
                    const existing = pageMap.get(page.pageId) || {
                        pageId: page.pageId,
                        pageName: page.pageName,
                        url: page.url,
                        commentCount: 0
                    };
                    existing.commentCount += page.commentCount;
                    pageMap.set(page.pageId, existing);
                });
            }
        });
        
        // Convert to array and sort by comment count
        const aggregatedPages = Array.from(pageMap.values())
            .sort((a, b) => b.commentCount - a.commentCount)
            .slice(0, 50);
        
        // Calculate total comments from all daily data (not just top 50)
        let totalComments = 0;
        dailyData.forEach(day => {
            if (day.data && day.data.totalComments) {
                totalComments += day.data.totalComments;
            }
        });
        
        const data = {
            pages: aggregatedPages,
            period: {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            },
            rollingDays: 7,
            endDate: endDate.toISOString().split('T')[0],
            totalComments: totalComments,
            aggregatedFrom: dailyData.length + ' daily records'
        };
        
        // Store with end date as key
        await this.pool.query(`
            INSERT INTO analytics_cache (period_type, period_date, data, generated_at)
            VALUES ('week', $1, $2, NOW())
            ON CONFLICT (period_type, period_date) 
            DO UPDATE SET data = $2, generated_at = NOW()
        `, [endDate.toISOString().split('T')[0], data]);
        
        // Clean up old weekly data (keep 30 days of rolling data)
        await this.cleanupOldData('week', 30);
        
        console.log('Weekly analytics calculation complete');
    }
    
    async calculateMonthlyData() {
        console.log('Starting rolling 30-day analytics calculation...');
        
        // Calculate for the last 30 days (rolling window)
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1); // Yesterday
        endDate.setHours(23, 59, 59, 999);
        
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 29); // 30 days ago
        startDate.setHours(0, 0, 0, 0);
        
        // Get daily data for the rolling 30-day period
        const dailyData = await this.getDailyDataForPeriod(startDate, endDate);
        
        if (dailyData.length === 0) {
            console.log('No daily data available for the rolling 30-day period');
            return;
        }
        
        // Aggregate the daily data
        const pageMap = new Map();
        
        dailyData.forEach(day => {
            if (day.data && day.data.pages) {
                day.data.pages.forEach(page => {
                    const existing = pageMap.get(page.pageId) || {
                        pageId: page.pageId,
                        pageName: page.pageName,
                        url: page.url,
                        commentCount: 0
                    };
                    existing.commentCount += page.commentCount;
                    pageMap.set(page.pageId, existing);
                });
            }
        });
        
        // Convert to array and sort by comment count
        const aggregatedPages = Array.from(pageMap.values())
            .sort((a, b) => b.commentCount - a.commentCount)
            .slice(0, 50);
        
        // Calculate total comments from all daily data (not just top 50)
        let totalComments = 0;
        dailyData.forEach(day => {
            if (day.data && day.data.totalComments) {
                totalComments += day.data.totalComments;
            }
        });
        
        const data = {
            pages: aggregatedPages,
            period: {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            },
            rollingDays: 30,
            endDate: endDate.toISOString().split('T')[0],
            totalComments: totalComments,
            aggregatedFrom: dailyData.length + ' daily records'
        };
        
        // Store with end date as key
        await this.pool.query(`
            INSERT INTO analytics_cache (period_type, period_date, data, generated_at)
            VALUES ('month', $1, $2, NOW())
            ON CONFLICT (period_type, period_date) 
            DO UPDATE SET data = $2, generated_at = NOW()
        `, [endDate.toISOString().split('T')[0], data]);
        
        // Clean up old monthly data (keep 90 days of rolling data)
        await this.cleanupOldData('month', 90);
        
        console.log('Monthly analytics calculation complete');
    }
    
    async calculateQuarterlyData() {
        console.log('Starting rolling 90-day analytics calculation...');
        
        // Calculate for the last 90 days (rolling window)
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1); // Yesterday
        endDate.setHours(23, 59, 59, 999);
        
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 89); // 90 days ago
        startDate.setHours(0, 0, 0, 0);
        
        // Get daily data for the rolling 90-day period
        const dailyData = await this.getDailyDataForPeriod(startDate, endDate);
        
        if (dailyData.length === 0) {
            console.log('No daily data available for the rolling 90-day period');
            return;
        }
        
        // Aggregate the daily data
        const pageMap = new Map();
        
        dailyData.forEach(day => {
            if (day.data && day.data.pages) {
                day.data.pages.forEach(page => {
                    const existing = pageMap.get(page.pageId) || {
                        pageId: page.pageId,
                        pageName: page.pageName,
                        url: page.url,
                        commentCount: 0
                    };
                    existing.commentCount += page.commentCount;
                    pageMap.set(page.pageId, existing);
                });
            }
        });
        
        // Convert to array and sort by comment count
        const aggregatedPages = Array.from(pageMap.values())
            .sort((a, b) => b.commentCount - a.commentCount)
            .slice(0, 50);
        
        // Calculate total comments from all daily data (not just top 50)
        let totalComments = 0;
        dailyData.forEach(day => {
            if (day.data && day.data.totalComments) {
                totalComments += day.data.totalComments;
            }
        });
        
        const data = {
            pages: aggregatedPages,
            period: {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            },
            rollingDays: 90,
            endDate: endDate.toISOString().split('T')[0],
            totalComments: totalComments,
            aggregatedFrom: dailyData.length + ' daily records'
        };
        
        // Store with end date as key
        await this.pool.query(`
            INSERT INTO analytics_cache (period_type, period_date, data, generated_at)
            VALUES ('quarter', $1, $2, NOW())
            ON CONFLICT (period_type, period_date) 
            DO UPDATE SET data = $2, generated_at = NOW()
        `, [endDate.toISOString().split('T')[0], data]);
        
        // Clean up old quarterly data (keep 180 days of rolling data)
        await this.cleanupOldData('quarter', 180);
        
        console.log('Quarterly analytics calculation complete');
    }
    
    async getDailyDataForPeriod(startDate, endDate) {
        const query = `
            SELECT data, generated_at
            FROM analytics_cache
            WHERE period_type = 'day'
                AND period_date >= $1
                AND period_date <= $2
            ORDER BY period_date ASC
        `;
        
        const result = await this.pool.query(query, [
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        ]);
        
        return result.rows;
    }
    
    async cleanupOldData(periodType, daysToKeep) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        await this.pool.query(`
            DELETE FROM analytics_cache
            WHERE period_type = $1
                AND period_date < $2
        `, [periodType, cutoffDate.toISOString().split('T')[0]]);
    }
    
    // For initial historical data population only
    async calculateDailyDataForDate(date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        
        // Query for top 50 pages
        const query = `
            SELECT 
                c.page_id,
                COUNT(DISTINCT c.id) as comment_count
            FROM comments c
            WHERE c.created_at >= $1
                AND c.created_at <= $2
            GROUP BY c.page_id
            HAVING COUNT(DISTINCT c.id) > 0
            ORDER BY comment_count DESC
            LIMIT 50
        `;
        
        const result = await this.pool.query(query, [startDate, endDate]);
        
        // Query for total comments across ALL pages
        const totalQuery = `
            SELECT COUNT(DISTINCT c.id) as total_count
            FROM comments c
            WHERE c.created_at >= $1
                AND c.created_at <= $2
        `;
        
        const totalResult = await this.pool.query(totalQuery, [startDate, endDate]);
        const totalComments = parseInt(totalResult.rows[0].total_count) || 0;
        
        const pages = result.rows.map(row => ({
            pageId: row.page_id,
            pageName: `Page ${row.page_id}`,
            url: `#page-${row.page_id}`,
            commentCount: parseInt(row.comment_count)
        }));
        
        const data = {
            pages: pages,
            period: {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            },
            date: startDate.toISOString().split('T')[0],
            totalComments: totalComments
        };
        
        await this.pool.query(`
            INSERT INTO analytics_cache (period_type, period_date, data, generated_at)
            VALUES ('day', $1, $2, NOW())
            ON CONFLICT (period_type, period_date) 
            DO NOTHING
        `, [date.toISOString().split('T')[0], data]);
    }
    
    // Run initial population of historical data
    async populateHistoricalData() {
        console.log('Populating historical data...');
        
        // Calculate daily data for the past 90 days
        for (let i = 1; i <= 90; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            await this.calculateDailyDataForDate(date);
        }
        
        // Calculate weekly data for the past 12 weeks
        // Weekly data is stored with the END date of the 7-day period
        for (let i = 0; i < 12; i++) {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() - 1 - (i * 7)); // Yesterday minus weeks
            endDate.setHours(23, 59, 59, 999);
            
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
            
            await this.calculateSpecificWeeklyData(startDate, endDate);
        }
        
        // Calculate monthly data for the past 3 months
        // Monthly data is stored with the END date of the 30-day period
        for (let i = 0; i < 3; i++) {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() - 1 - (i * 30)); // Yesterday minus months
            endDate.setHours(23, 59, 59, 999);
            
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 29);
            startDate.setHours(0, 0, 0, 0);
            
            await this.calculateSpecificMonthlyData(startDate, endDate);
        }
        
        // Calculate quarterly data
        await this.calculateQuarterlyData();
        
        console.log('Historical data population complete');
    }
    
    // Helper method to calculate weekly data for specific date range
    async calculateSpecificWeeklyData(startDate, endDate) {
        const dailyData = await this.getDailyDataForPeriod(startDate, endDate);
        
        const pageMap = new Map();
        
        dailyData.forEach(day => {
            if (day.data && day.data.pages) {
                day.data.pages.forEach(page => {
                    const existing = pageMap.get(page.pageId) || {
                        pageId: page.pageId,
                        pageName: page.pageName,
                        url: page.url,
                        commentCount: 0
                    };
                    existing.commentCount += page.commentCount;
                    pageMap.set(page.pageId, existing);
                });
            }
        });
        
        const aggregatedPages = Array.from(pageMap.values())
            .sort((a, b) => b.commentCount - a.commentCount)
            .slice(0, 50);
        
        let totalComments = 0;
        dailyData.forEach(day => {
            if (day.data && day.data.totalComments) {
                totalComments += day.data.totalComments;
            }
        });
        
        const data = {
            pages: aggregatedPages,
            period: {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            },
            rollingDays: 7,
            endDate: endDate.toISOString().split('T')[0],
            totalComments: totalComments,
            aggregatedFrom: dailyData.length + ' daily records'
        };
        
        await this.pool.query(`
            INSERT INTO analytics_cache (period_type, period_date, data, generated_at)
            VALUES ('week', $1, $2, NOW())
            ON CONFLICT (period_type, period_date) 
            DO UPDATE SET data = $2, generated_at = NOW()
        `, [endDate.toISOString().split('T')[0], data]);
    }
    
    // Helper method to calculate monthly data for specific date range
    async calculateSpecificMonthlyData(startDate, endDate) {
        const dailyData = await this.getDailyDataForPeriod(startDate, endDate);
        
        const pageMap = new Map();
        
        dailyData.forEach(day => {
            if (day.data && day.data.pages) {
                day.data.pages.forEach(page => {
                    const existing = pageMap.get(page.pageId) || {
                        pageId: page.pageId,
                        pageName: page.pageName,
                        url: page.url,
                        commentCount: 0
                    };
                    existing.commentCount += page.commentCount;
                    pageMap.set(page.pageId, existing);
                });
            }
        });
        
        const aggregatedPages = Array.from(pageMap.values())
            .sort((a, b) => b.commentCount - a.commentCount)
            .slice(0, 50);
        
        let totalComments = 0;
        dailyData.forEach(day => {
            if (day.data && day.data.totalComments) {
                totalComments += day.data.totalComments;
            }
        });
        
        const data = {
            pages: aggregatedPages,
            period: {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            },
            rollingDays: 30,
            endDate: endDate.toISOString().split('T')[0],
            totalComments: totalComments,
            aggregatedFrom: dailyData.length + ' daily records'
        };
        
        await this.pool.query(`
            INSERT INTO analytics_cache (period_type, period_date, data, generated_at)
            VALUES ('month', $1, $2, NOW())
            ON CONFLICT (period_type, period_date) 
            DO UPDATE SET data = $2, generated_at = NOW()
        `, [endDate.toISOString().split('T')[0], data]);
    }
}

// Start analytics jobs
const startAnalyticsJob = (pool) => {
    const calculator = new AnalyticsCalculator(pool);
    
    // Check if we need to populate historical data
    pool.query('SELECT COUNT(*) FROM analytics_cache WHERE period_type = \'day\'')
        .then(result => {
            if (parseInt(result.rows[0].count) === 0) {
                console.log('No existing analytics data found, populating historical data...');
                return calculator.populateHistoricalData();
            }
        })
        .catch(err => console.error('Error checking analytics data:', err));
    
    // Schedule daily calculation at 2 AM
    cron.schedule('0 2 * * *', async () => {
        await calculator.calculateDailyData();
    });
    
    // Schedule rolling 7-day calculation daily at 3 AM
    cron.schedule('0 3 * * *', async () => {
        // Calculate weekly data for the current period and any missing ones
        for (let i = 0; i < 12; i++) {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() - 1 - (i * 7));
            endDate.setHours(23, 59, 59, 999);
            
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
            
            await calculator.calculateSpecificWeeklyData(startDate, endDate);
        }
    });
    
    // Schedule rolling 30-day calculation daily at 4 AM
    cron.schedule('0 4 * * *', async () => {
        // Calculate monthly data for the current period and any missing ones
        for (let i = 0; i < 3; i++) {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() - 1 - (i * 30));
            endDate.setHours(23, 59, 59, 999);
            
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 29);
            startDate.setHours(0, 0, 0, 0);
            
            await calculator.calculateSpecificMonthlyData(startDate, endDate);
        }
    });
    
    // Schedule rolling 90-day calculation daily at 5 AM
    cron.schedule('0 5 * * *', async () => {
        await calculator.calculateQuarterlyData();
    });
};

module.exports = { startAnalyticsJob, AnalyticsCalculator };