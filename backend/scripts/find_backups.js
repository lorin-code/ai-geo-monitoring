const sequelize = require('../config/database');

(async () => {
    try {
        const [results] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%result_detail%';");
        console.log('Tables matching "result_detail":', results);

        // Check record counts for any found tables
        for (const table of results) {
            try {
                const [count] = await sequelize.query(`SELECT COUNT(*) as c FROM \`${table.name}\``);
                console.log(`Count for ${table.name}:`, count[0].c);
            } catch (e) {
                console.log(`Could not count ${table.name}:`, e.message);
            }
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
