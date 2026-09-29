/** @type {import('drizzle-kit').Config} */
module.exports = {
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/shared/db/schema.js',
  out: './src/shared/db/migrations',
};
