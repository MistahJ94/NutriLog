import pg from 'pg'

const { Pool } = pg
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_SIZE || 10),
  idleTimeoutMillis: 30_000,
})
export const query = (text, params) => pool.query(text, params)
export const closeDb = () => pool.end()
