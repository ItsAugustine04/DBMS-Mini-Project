import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'CloudKitchen',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 10),
  namedPlaceholders: true
});

export default pool;

