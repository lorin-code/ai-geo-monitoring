const { UsageCounter, MembershipPlan, User } = require('../models');
const { consumeQuotaDirect } = require('../middleware/quota');

(async () => {
    try {
        const userId = 1;
        const user = await User.findByPk(userId);
        console.log('User:', user.username, 'Role:', user.role);

        const counter = await UsageCounter.findOne({ where: { user_id: userId, feature: 'detection' } });
        console.log('Usage Counter:', counter ? counter.count : 'None');

        const plan = await MembershipPlan.findOne({ where: { level: user.membership_level || 'free' } });
        console.log('Plan Limit:', plan ? plan.daily_limit_detection : 'Unknown');

        // Dry run consume
        const consume = await consumeQuotaDirect(userId, 'detection', 1);
        console.log('Dry Run Consume Result:', consume);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
