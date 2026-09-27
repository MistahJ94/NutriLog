import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
const port = Number(process.env.PORT || 3001)
app.disable('x-powered-by')
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '1mb' }))
app.get('/api', (_req, res) => res.json({ service: 'NutriLog API', version: '0.1.0' }))
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'nutrilog-api' }))
app.listen(port, () => console.log('NutriLog API listening on port ' + port))
