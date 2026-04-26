require('dotenv').config();
const models = require('../models');
const SchedulerService = require('../services/SchedulerService');
const { consumeQuotaDirect } = require('../middleware/quota');

// Mock consumeQuotaDirect to always return ok for testing
// Note: We can't easily mock module exports in this script context without extensive hacking.
// Instead, we will increment the user's quota or create a plan that allows it.

(async () => {
    try {
        // Ensure user 1 has high quota for testing
        const UsageCounter = models.UsageCounter;
        await UsageCounter.destroy({ where: { user_id: 1, feature: 'detection' } });

        console.log('Reset quota for test user.');

        console.log('Creating test schedule...');
        const schedule = await models.DetectionSchedule.create({
            user_id: 1,
            brand: 'TestBrand',
            question: 'Test Question for Verification',
            platforms: ['deepseek'],
            daily_time: '12:00',
            enabled: false
        });

        console.log('Triggering runNow...');
        await SchedulerService.runNow(schedule.id);

        console.log('Waiting for completion...');
        // Sleep a bit to ensure async db writes complete if any are loose
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Checking for QuestionRecord...');
        const record = await models.QuestionRecord.findOne({
            where: { question: 'Test Question for Verification' },
            include: [{ model: models.ResultDetail, as: 'resultDetail' }],
            order: [['created_at', 'DESC']]
        });

        if (record) {
            console.log('Record Found ID:', record.id);
            console.log('Status:', record.status);
            console.log('Error Message:', record.error_message);
            if (record.resultDetail) {
                console.log('ResultDetail Found! ID:', record.resultDetail.id);
                console.log('Content Length:', record.resultDetail.ai_response_original.length);
            } else {
                console.log('ResultDetail MISSING.');
            }
        } else {
            console.log('No record found.');
        }

        // Cleanup
        await schedule.destroy();
        if (record) {
            if (record.resultDetail) await record.resultDetail.destroy();
            await record.destroy();
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
