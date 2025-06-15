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
        
        const data = {
            pages: result.rows.map(row => ({
                pageId: row.page_id,
                pageName: `Page ${row.page_id}`,
                url: `#page-${row.page_id}`,
                commentCount: parseInt(row.comment_count)
            })),
            period: {
                start: yesterday.toISOString(),
                end: endDate.toISOString()
            },
            date: yesterday.toISOString().split('T')[0]
        };
        
        // Store with absolute date as key for easier management
        await this.pool.query(`
            INSERT INTO analytics_cache (period_type, period_date, data, generated_at)
            VALUES ('day', $1, $2, NOW())
            ON CONFLICT (period_type, period_date) 
            DO UPDATE SET data = $2, generated_at = NOW()
        `, [yesterday.toISOString().split('T')[0], data]);
        
        // Clean up old daily data (keep 30 days)
        await this.cleanupOldData('day', 30);
        
        console.log('Daily analytics calculation complete');
    }
    
    async calculateWeeklyData() {
        console.log('Starting weekly analytics calculation...');
        
        // Calculate for the last completed week (ending last Sunday)
        const lastSunday = new Date();
        lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay());
        lastSunday.setHours(23, 59, 59, 999);
        
        const weekStart = new Date(lastSunday);
        weekStart.setDate(weekStart.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);
        
        // Get daily data for this week
        const dailyData = await this.getDailyDataForPeriod(weekStart, lastSunday);
        
        if (dailyData.length === 0) {
            console.log('No daily data available for the last week');
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
        
        const data = {
            pages: aggregatedPages,
            period: {
                start: weekStart.toISOString(),
                end: lastSunday.toISOString()
            },
            weekEnding: lastSunday.toISOString().split('T')[0],
            totalComments: aggregatedPages.reduce((sum, page) => sum + page.commentCount, 0),
            aggregatedFrom: dailyData.length + ' daily records'
        };
        
        // Store with week ending date as key
        await this.pool.query(`
            INSERT INTO analytics_cache (period_type, period_date, data, generated_at)
            VALUES ('week', $1, $2, NOW())
            ON CONFLICT (period_type, period_date) 
            DO UPDATE SET data = $2, generated_at = NOW()
        `, [lastSunday.toISOString().split('T')[0], data]);
        
        // Clean up old weekly data (keep 5 weeks)
        await this.cleanupOldData('week', 35);
        
        console.log('Weekly analytics calculation complete');
    }
    
    async calculateMonthlyData() {
        console.log('Starting monthly analytics calculation...');
        
        // Calculate for the last completed month
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        monthEnd.setHours(23, 59, 59, 999);
        
        // Get daily data for this month
        const dailyData = await this.getDailyDataForPeriod(lastMonth, monthEnd);
        
        if (dailyData.length === 0) {
            console.log('No daily data available for the last month');
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
        
        const data = {
            pages: aggregatedPages,
            period: {
                start: lastMonth.toISOString(),
                end: monthEnd.toISOString()
            },
            month: lastMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
            totalComments: aggregatedPages.reduce((sum, page) => sum + page.commentCount, 0),
            aggregatedFrom: dailyData.length + ' daily records'
        };
        
        // Store with month's first day as key
        await this.pool.query(`
            INSERT INTO analytics_cache (period_type, period_date, data, generated_at)
            VALUES ('month', $1, $2, NOW())
            ON CONFLICT (period_type, period_date) 
            DO UPDATE SET data = $2, generated_at = NOW()
        `, [lastMonth.toISOString().split('T')[0], data]);
        
        // Clean up old monthly data (keep 4 months)
        await this.cleanupOldData('month', 120);
        
        console.log('Monthly analytics calculation complete');
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
        
        const data = {
            pages: result.rows.map(row => ({
                pageId: row.page_id,
                pageName: `Page ${row.page_id}`,
                url: `#page-${row.page_id}`,
                commentCount: parseInt(row.comment_count)
            })),
            period: {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            },
            date: startDate.toISOString().split('T')[0]
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
        
        // Calculate daily data for the past 30 days
        for (let i = 1; i <= 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            await this.calculateDailyDataForDate(date);
        }
        
        // Calculate weekly data for completed weeks
        await this.calculateWeeklyData();
        
        // Calculate monthly data if we have a complete month
        if (new Date().getDate() > 1) {
            await this.calculateMonthlyData();
        }
        
        console.log('Historical data population complete');
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
    
    // Schedule weekly calculation every Monday at 3 AM
    cron.schedule('0 3 * * 1', async () => {
        await calculator.calculateWeeklyData();
    });
    
    // Schedule monthly calculation on the 1st at 4 AM
    cron.schedule('0 4 1 * *', async () => {
        await calculator.calculateMonthlyData();
    });
};

module.exports = { startAnalyticsJob };