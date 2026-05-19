const { Sequelize } = require('sequelize');

const isDevelopment = process.env.NODE_ENV === 'development';
const commonOptions = {
  logging: isDevelopment ? console.log : false,
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
};

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      ...commonOptions,
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    })
  : new Sequelize({
      ...commonOptions,
      dialect: 'sqlite',
      storage: process.env.DB_STORAGE || 'database.sqlite'
    });

module.exports = sequelize;
