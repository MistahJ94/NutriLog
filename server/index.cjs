const http = require("node:http")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const postgres = require("postgres")

const PORT = Number(process.env.PORT || 3001)
const DATABASE_URL = process.env.DATABASE_URL
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173"
const PRODUCTION = process.env.NODE_ENV === "production"

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}

const sql = postgres(DATABASE_URL, {
  max: Number(process.env.DB_POOL_SIZE || 10),
  idle_timeout: 20,
  connect_timeout: 10
})

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  })
  res.end(JSON.stringify(body))
}

const readBody = req => new Promise((resolve, reject) => {
  let body = ""
  req.on("data", chunk => {
    body += chunk
    if (body.length > 1048576) reject(new Error("Request body too large"))
  })
  req.on("end", () => {
    try { resolve(body ? JSON.parse(body) : {}) }
    catch { reject(new Error("Invalid JSON")) }
  })
  req.on("error", reject)
})

const parseCookies = value => Object.fromEntries(
  String(value || "").split(";").map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf("=")
    return [v.slice(0, i), i >= 0 ? decodeURIComponent(v.slice(i + 1)) : ""]
  })
)

const tokenHash = token => crypto.createHash("sha256").update(token).digest("hex")

const hashPassword = password => new Promise((resolve, reject) => {
  const salt = crypto.randomBytes(16)
  crypto.scrypt(password, salt, 64, { N: 32768, r: 8, p: 3 }, (err, derived) => {
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

const sessionCookie = token =>
  "nutrilog_session=" + encodeURIComponent(token) + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000" +
  (PRODUCTION ? "; Secure" : "")

const validEmail = email => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const validPassword = password => typeof password === "string" && password.length >= 8 && password.length <= 128
const authAttempts = new Map()
const authAllowed = req => {
  const key = req.socket.remoteAddress || "unknown"
  const now = Date.now()
  const recent = (authAttempts.get(key) || []).filter(timestamp => now - timestamp < 15 * 60 * 1000)
  if (recent.length >= 20) { authAttempts.set(key, recent); return false }
  recent.push(now); authAttempts.set(key, recent); return true
}
const numberValue = value => Number.isFinite(Number(value)) ? Number(value) : 0

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url")
  await sql.unsafe("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')", [tokenHash(token), userId])
  return token
}

async function userFromRequest(req) {
  const token = parseCookies(req.headers.cookie).nutrilog_session
  if (!token) return null
  const rows = await sql.unsafe(
    "SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()",
    [tokenHash(token)]
  )
  return rows[0] || null
}

async function authApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    return send(res, 200, { ok: true, service: "nutrilog-api" })
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    return send(res, 200, { user: await userFromRequest(req) })
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    if (!authAllowed(req)) return send(res, 429, { error: "Too many authentication attempts. Try again later." })
    const body = await readBody(req)
    const email = String(body.email || "").trim().toLowerCase()
    if (!validEmail(email) || !validPassword(body.password)) return send(res, 400, { error: "Valid email and password (8-128 characters) are required" })
    const existing = await sql.unsafe("SELECT id FROM users WHERE email = $1", [email])
    if (existing.length) return send(res, 409, { error: "An account with that email already exists" })
    const passwordHash = await hashPassword(body.password)
    const user = (await sql.unsafe("INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role", [email, passwordHash]))[0]
    await sql.unsafe("INSERT INTO user_goals (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [user.id])
    return send(res, 201, { user }, { "Set-Cookie": sessionCookie(await createSession(user.id)) })
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    if (!authAllowed(req)) return send(res, 429, { error: "Too many authentication attempts. Try again later." })
    const body = await readBody(req)
    const email = String(body.email || "").trim().toLowerCase()
    const rows = await sql.unsafe("SELECT id, email, role, password_hash FROM users WHERE email = $1", [email])
    if (!rows.length || !(await verifyPassword(body.password, rows[0].password_hash))) return send(res, 401, { error: "Invalid email or password" })
    const user = { id: rows[0].id, email: rows[0].email, role: rows[0].role }
    return send(res, 200, { user }, { "Set-Cookie": sessionCookie(await createSession(user.id)) })
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const token = parseCookies(req.headers.cookie).nutrilog_session
    if (token) await sql.unsafe("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)])
    return send(res, 200, { ok: true }, { "Set-Cookie": "nutrilog_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" })
  }

  return false
}

const resources = {
  foods: {
    table: "foods",
    fields: ["name","calories","protein","carbs","fat","fiber","serving_size","source"],
    select: "id, name, calories, protein, carbs, fat, fiber, serving_size, source, created_at, updated_at"
  },
  meals: {
    table: "meals",
    fields: ["name","calories","protein","carbs","fat","fiber","foods"],
    select: "id, name, calories, protein, carbs, fat, fiber, foods, created_at, updated_at"
  },
  "log-entries": {
    table: "log_entries",
    fields: ["entry_type","name","calories","protein","carbs","fat","fiber","foods","consumed_at"],
    select: "id, entry_type, name, calories, protein, carbs, fat, fiber, foods, consumed_at, created_at"
  }
}

async function protectedApi(req, res, pathname, user) {
  if (pathname === "/api/goals") {
    if (req.method === "GET") {
      const rows = await sql.unsafe("SELECT calories, protein, carbs, fat, fiber, updated_at FROM user_goals WHERE user_id = $1", [user.id])
      return send(res, 200, { goals: rows[0] || null })
    }
    if (req.method === "PUT") {
      const body = await readBody(req)
      const rows = await sql.unsafe(
        "INSERT INTO user_goals (user_id, calories, protein, carbs, fat, fiber) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO UPDATE SET calories=EXCLUDED.calories, protein=EXCLUDED.protein, carbs=EXCLUDED.carbs, fat=EXCLUDED.fat, fiber=EXCLUDED.fiber, updated_at=NOW() RETURNING calories, protein, carbs, fat, fiber, updated_at",
        [user.id, numberValue(body.calories), numberValue(body.protein), numberValue(body.carbs), numberValue(body.fat), numberValue(body.fiber)]
      )
      return send(res, 200, { goals: rows[0] })
    }
    return send(res, 405, { error: "Method not allowed" })
  }

  const match = pathname.match(/^\/api\/(foods|meals|log-entries)(?:\/([0-9a-f-]+))?$/i)
  if (!match) return false
  const config = resources[match[1]]
  const id = match[2]

  if (req.method === "GET") {
    const query = id
      ? "SELECT " + config.select + " FROM " + config.table + " WHERE user_id = $1 AND id = $2"
      : "SELECT " + config.select + " FROM " + config.table + " WHERE user_id = $1 ORDER BY created_at DESC"
    const rows = id ? await sql.unsafe(query, [user.id, id]) : await sql.unsafe(query, [user.id])
    return id
      ? (rows[0] ? send(res, 200, { item: rows[0] }) : send(res, 404, { error: "Not found" }))
      : send(res, 200, { items: rows })
  }

  if (req.method === "DELETE" && id) {
    const rows = await sql.unsafe("DELETE FROM " + config.table + " WHERE user_id = $1 AND id = $2 RETURNING id", [user.id, id])
    return rows.length ? send(res, 200, { ok: true }) : send(res, 404, { error: "Not found" })
  }

  if (req.method === "POST" && !id) {
    const body = await readBody(req)
    if (!body.name) return send(res, 400, { error: "Name is required" })
    if (match[1] === "log-entries" && !["food", "meal"].includes(body.entry_type)) return send(res, 400, { error: "Invalid entry type" })
    const values = config.fields.map(field => {
      if (["calories","protein","carbs","fat","fiber"].includes(field)) return numberValue(body[field])
      if (field === "foods") return Array.isArray(body[field]) ? JSON.stringify(body[field]) : "[]"
      if (field === "source") return body[field] || "custom"
      if (field === "serving_size") return body[field] || "1 serving"
      return body[field] ?? null
    })
    const placeholders = config.fields.map((_, i) => "$" + (i + 2)).join(", ")
    const query = "INSERT INTO " + config.table + " (user_id, " + config.fields.join(", ") + ") VALUES ($1, " + placeholders + ") RETURNING " + config.select
    const rows = await sql.unsafe(query, [user.id, ...values])
    return send(res, 201, { item: rows[0] })
  }

  return send(res, 405, { error: "Method not allowed" })
}

async function replaceUserData(res, user, body) {
  if (!body || typeof body !== "object") return send(res, 400, { error: "Invalid sync payload" })
  const goals = body.goals || {}
  const foods = Array.isArray(body.foods) ? body.foods : []
  const meals = Array.isArray(body.meals) ? body.meals : []
  const logs = Array.isArray(body.logs) ? body.logs : []

  await sql.begin(async tx => {
    await tx.unsafe("DELETE FROM log_entries WHERE user_id = $1", [user.id])
    await tx.unsafe("DELETE FROM meals WHERE user_id = $1", [user.id])
    await tx.unsafe("DELETE FROM foods WHERE user_id = $1", [user.id])

    await tx.unsafe(
      "INSERT INTO user_goals (user_id, calories, protein, carbs, fat, fiber) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO UPDATE SET calories=EXCLUDED.calories, protein=EXCLUDED.protein, carbs=EXCLUDED.carbs, fat=EXCLUDED.fat, fiber=EXCLUDED.fiber, updated_at=NOW()",
      [user.id, numberValue(goals.calories), numberValue(goals.protein), numberValue(goals.carbs), numberValue(goals.fat), numberValue(goals.fiber)]
    )

    for (const food of foods) {
      await tx.unsafe(
        "INSERT INTO foods (user_id, name, calories, protein, carbs, fat, fiber, serving_size, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [user.id, food.name, numberValue(food.calories), numberValue(food.protein), numberValue(food.carbs), numberValue(food.fat), numberValue(food.fiber), food.servingSize || food.serving_size || "1 serving", food.source || "custom"]
      )
    }

    for (const meal of meals) {
      await tx.unsafe(
        "INSERT INTO meals (user_id, name, calories, protein, carbs, fat, fiber, foods) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [user.id, meal.name, numberValue(meal.calories), numberValue(meal.protein), numberValue(meal.carbs), numberValue(meal.fat), numberValue(meal.fiber), JSON.stringify(Array.isArray(meal.foods) ? meal.foods : [])]
      )
    }

    for (const entry of logs) {
      if (!["food", "meal"].includes(entry.type || entry.entry_type) || !entry.name) continue
      await tx.unsafe(
        "INSERT INTO log_entries (user_id, entry_type, name, calories, protein, carbs, fat, fiber, foods, consumed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [user.id, entry.type || entry.entry_type, entry.name, numberValue(entry.calories), numberValue(entry.protein), numberValue(entry.carbs), numberValue(entry.fat), numberValue(entry.fiber), JSON.stringify(Array.isArray(entry.foods) ? entry.foods : []), entry.timestamp || entry.consumed_at || new Date().toISOString()]
      )
    }
  })

  return send(res, 200, { ok: true, counts: { foods: foods.length, meals: meals.length, logs: logs.length } })
}

async function serveStatic(res, pathname) {
  const root = path.resolve(process.cwd(), "dist")
  let relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "")
  if (relative.includes("..")) return false
  let file = path.join(root, relative)
  try {
    const stat = await fs.promises.stat(file)
    if (!stat.isFile()) throw new Error()
  } catch {
    file = path.join(root, "index.html")
  }
  try {
    const ext = path.extname(file)
    const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".ico":"image/x-icon" }
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable" })
    fs.createReadStream(file).pipe(res)
    return true
  } catch {
    return false
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN)
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Vary", "Origin")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  if (PRODUCTION) res.setHeader("Strict-Transport-Security", "max-age=31536000")

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
    })
    return res.end()
  }

  const pathname = new URL(req.url, "http://localhost").pathname

  try {
    const authHandled = await authApi(req, res, pathname)
    if (authHandled !== false) return

    if (req.method === "PUT" && pathname === "/api/sync") {
      const user = await userFromRequest(req)
      if (!user) return send(res, 401, { error: "Authentication required" })
      return replaceUserData(res, user, await readBody(req))
    }

    if (pathname.startsWith("/api/")) {
      const user = await userFromRequest(req)
      if (!user) return send(res, 401, { error: "Authentication required" })
      const handled = await protectedApi(req, res, pathname, user)
      if (handled !== false) return
      return send(res, 404, { error: "API route not found" })
    }

    if (!(await serveStatic(res, pathname))) return send(res, 404, { error: "Not found" })
  } catch (err) {
    console.error(err)
    return send(res, 500, { error: PRODUCTION ? "Internal server error" : err.message })
  }
})

server.listen(PORT, "0.0.0.0", () => console.log("NutriLog server listening on port " + PORT))

const shutdown = async () => {
  server.close()
  await sql.end({ timeout: 5 })
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
