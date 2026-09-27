const http = require("node:http")
const crypto = require("node:crypto")
const postgres = require("postgres")

const PORT = Number(process.env.PORT || 3001)
const DATABASE_URL = process.env.DATABASE_URL
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173"
const PRODUCTION = process.env.NODE_ENV === "production"

if (!DATABASE_URL) { console.error("DATABASE_URL is required"); process.exit(1) }
const sql = postgres(DATABASE_URL, { max: Number(process.env.DB_POOL_SIZE || 10), idle_timeout: 20, connect_timeout: 10 })

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers })
  res.end(JSON.stringify(body))
}
const readBody = req => new Promise((resolve, reject) => {
  let body = ""
  req.on("data", chunk => { body += chunk; if (body.length > 1048576) reject(new Error("Request body too large")) })
  req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}) } catch { reject(new Error("Invalid JSON")) } })
  req.on("error", reject)
})
const parseCookies = value => Object.fromEntries(String(value || "").split(";").map(v => v.trim()).filter(Boolean).map(v => { const i = v.indexOf("="); return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))] }))
const hashToken = token => crypto.createHash("sha256").update(token).digest("hex")
const hashPassword = password => new Promise((resolve, reject) => {
  const salt = crypto.randomBytes(16)
  crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derived) => {
    if (err) return reject(err)
    resolve("scrypt$" + salt.toString("base64url") + "$" + derived.toString("base64url"))
  })
})
const verifyPassword = (password, stored) => new Promise((resolve, reject) => {
  const parts = String(stored || "").split("$")
  if (parts.length !== 3 || parts[0] !== "scrypt") return resolve(false)
  const expected = Buffer.from(parts[2], "base64url")
  crypto.scrypt(password, Buffer.from(parts[1], "base64url"), expected.length, { N: 16384, r: 8, p: 1 }, (err, derived) => {
    if (err) return reject(err)
    resolve(crypto.timingSafeEqual(expected, derived))
  })
})
const cookie = token => "nutrilog_session=" + encodeURIComponent(token) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" + (PRODUCTION ? "; Secure" : "")
const validEmail = email => typeof email === "string" && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)
const validPassword = password => typeof password === "string" && password.length >= 8 && password.length <= 128

async function session(userId) {
  const token = crypto.randomBytes(32).toString("base64url")
  await sql.unsafe("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')", [hashToken(token), userId])
  return token
}
async function userFromRequest(req) {
  const token = parseCookies(req.headers.cookie).nutrilog_session
  if (!token) return null
  const rows = await sql.unsafe("SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()", [hashToken(token)])
  return rows[0] || null
}

async function api(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") return send(res, 200, { ok: true, service: "nutrilog-api" })
  if (req.method === "GET" && pathname === "/api/auth/me") return send(res, 200, { user: await userFromRequest(req) })
  if (req.method === "POST" && pathname === "/api/auth/register") {
    const body = await readBody(req)
    const email = String(body.email || "").trim().toLowerCase()
    if (!validEmail(email) || !validPassword(body.password)) return send(res, 400, { error: "Valid email and password (8-128 characters) are required" })
    const existing = await sql.unsafe("SELECT id FROM users WHERE email = $1", [email])
    if (existing.length) return send(res, 409, { error: "An account with that email already exists" })
    const passwordHash = await hashPassword(body.password)
    const rows = await sql.unsafe("INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role", [email, passwordHash])
    await sql.unsafe("INSERT INTO user_goals (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [rows[0].id])
    return send(res, 201, { user: rows[0] }, { "Set-Cookie": cookie(await session(rows[0].id)) })
  }
  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readBody(req)
    const email = String(body.email || "").trim().toLowerCase()
    const rows = await sql.unsafe("SELECT id, email, role, password_hash FROM users WHERE email = $1", [email])
    if (!rows.length || !(await verifyPassword(body.password, rows[0].password_hash))) return send(res, 401, { error: "Invalid email or password" })
    const user = { id: rows[0].id, email: rows[0].email, role: rows[0].role }
    return send(res, 200, { user }, { "Set-Cookie": cookie(await session(user.id)) })
  }
  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const token = parseCookies(req.headers.cookie).nutrilog_session
    if (token) await sql.unsafe("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)])
    return send(res, 200, { ok: true }, { "Set-Cookie": "nutrilog_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" })
  }
  return false
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN)
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Vary", "Origin")
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": CORS_ORIGIN, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS" }); return res.end() }
  const pathname = new URL(req.url, "http://localhost").pathname
  try {
    const handled = await api(req, res, pathname)
    if (handled !== false) return
    if (pathname.startsWith("/api/")) return send(res, 404, { error: "API route not found" })
    return send(res, 404, { error: "Static serving is handled by the production proxy for now" })
  } catch (err) {
    console.error(err)
    return send(res, 500, { error: PRODUCTION ? "Internal server error" : err.message })
  }
})

server.listen(PORT, "0.0.0.0", () => console.log("NutriLog API listening on port " + PORT))
process.on("SIGTERM", async () => { server.close(); await sql.end({ timeout: 5 }); process.exit(0) })
process.on("SIGINT", async () => { server.close(); await sql.end({ timeout: 5 }); process.exit(0) })
