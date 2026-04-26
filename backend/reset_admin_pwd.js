require('dotenv').config();
const { User } = require('./models');
const bcrypt = require('bcryptjs');

(async () => {
    try {
        const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
        const hashedPassword = await bcrypt.hash(password, 10);

        // Try to find by ID 1 first, then by username 'admin'
        let admin = await User.findByPk(1);
        if (!admin) {
            admin = await User.findOne({ where: { username: 'admin' } });
        }

        if (admin) {
            await admin.update({ password: hashedPassword });
            console.log(`SUCCESS: Password for user '${admin.username}' (ID: ${admin.id}) has been reset to: ${password}`);
        } else {
            console.log('Admin user not found. Creating one...');
            await User.create({
                id: 1,
                username: 'admin',
                email: 'admin@example.com',
                password: hashedPassword,
                role: 'admin',
                status: 'active'
            });
            console.log(`SUCCESS: Admin user created with password: ${password}`);
        }
    } catch (e) {
        console.error('Error resetting password:', e);
    } finally {
        process.exit();
    }
})();
