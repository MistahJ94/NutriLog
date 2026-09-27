const http = require("node:http")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const postgres = require("postgres")

const PORT = Number(process.env.PORT || 3001)
const DATABASE_URL = process.env.DATABASE_URL
const CORS_ORIGIN = String(process.env.CORS_ORIGIN || "").trim() || null
const PRODUCTION = process.env.NODE_ENV === "production"
const COOKIE_SECURE = process.env.COOKIE_SECURE !== "false"

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

const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }

const hashPassword = password => new Promise((resolve, reject) => {
  const salt = crypto.randomBytes(16)
  crypto.scrypt(password, salt, 64, SCRYPT_OPTIONS, (err, derived) => {
    if (err) return reject(err)
    resolve("scrypt$" + salt.toString("base64url") + "$" + derived.toString("base64url"))
  })
})

const verifyPassword = (password, stored) => new Promise((resolve, reject) => {
  const parts = String(stored || "").split("$")
  if (parts.length !== 3 || parts[0] !== "scrypt") return resolve(false)
  const expected = Buffer.from(parts[2], "base64url")
  crypto.scrypt(password, Buffer.from(parts[1], "base64url"), expected.length, SCRYPT_OPTIONS, (err, derived) => {
    if (err) return reject(err)
    resolve(crypto.timingSafeEqual(expected, derived))
  })
})

const sessionCookie = token =>
  "nutrilog_session=" + encodeURIComponent(token) + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000" +
  (COOKIE_SECURE ? "; Secure" : "")

const validEmail = email => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const validPassword = password => typeof password === "string" && password.length >= 8 && password.length <= 128
const validRole = role => role === "admin" || role === "user"
const cryptoKey = crypto.createHash("sha256").update(DATABASE_URL + "|nutrilog-settings-v1").digest()
const encryptSecret = value => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", cryptoKey, iv)
  const encrypted = Buffer.concat([cipher.update(String(value || ""), "utf8"), cipher.final()])
  return "v1:" + iv.toString("base64url") + ":" + cipher.getAuthTag().toString("base64url") + ":" + encrypted.toString("base64url")
}
const decryptSecret = value => {
  try {
    const [version, iv, tag, encrypted] = String(value || "").split(":")
    if (version !== "v1") return ""
    const decipher = crypto.createDecipheriv("aes-256-gcm", cryptoKey, Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")
  } catch { return "" }
}
const normalizeSmtpSettings = body => ({
  host: String(body.host || "").trim(),
  port: Number(body.port || 587),
  secure: Boolean(body.secure),
  username: String(body.username || "").trim(),
  password: String(body.password || ""),
  fromEmail: String(body.fromEmail || "").trim().toLowerCase(),
  fromName: String(body.fromName || "NutriLog").trim() || "NutriLog",
  publicUrl: String(body.publicUrl || "").trim().replace(/\/$/, "")
})
const smtpSettingsValid = settings =>
  settings.host.length > 0 &&
  Number.isInteger(settings.port) && settings.port >= 1 && settings.port <= 65535 &&
  validEmail(settings.fromEmail) &&
  settings.publicUrl.length > 0 && /^https?:\/\//i.test(settings.publicUrl)

const sendSmtpEmail = async (settings, to, subject, body) => {
  if (!smtpSettingsValid(settings)) throw new Error("SMTP settings are incomplete")
  const net = require("node:net"), tls = require("node:tls")
  const secure = settings.secure || settings.port === 465
  let socket = await new Promise((resolve, reject) => {
    const s = secure
      ? tls.connect({ host: settings.host, port: settings.port, servername: settings.host }, () => resolve(s))
      : net.createConnection({ host: settings.host, port: settings.port }, () => resolve(s))
    s.once("error", reject)
  })
  const command = (value, codes) => new Promise((resolve, reject) => {
    let buffer = ""
    const onData = chunk => {
      buffer += chunk.toString()
      const lines = buffer.split("\r\n")
      buffer = lines.pop()
      for (const line of lines) if (/^\d{3} /.test(line)) {
        const code = Number(line.slice(0, 3))
        socket.off("data", onData)
        if (!codes.includes(code)) reject(new Error("SMTP command rejected (" + code + ")"))
        else resolve()
        return
      }
    }
    socket.on("data", onData)
    socket.once("error", reject)
    socket.write(value + "\r\n")
  })
  try {
    await new Promise((resolve, reject) => {
      const onData = chunk => {
        if (/^220 /.test(chunk.toString())) { socket.off("data", onData); resolve() }
      }
      socket.on("data", onData)
      socket.once("error", reject)
    })
    await command("EHLO nutrilog", [250])
    if (!secure) {
      await command("STARTTLS", [220])
      socket = await new Promise((resolve, reject) => {
        const tlsSocket = tls.connect({ socket, servername: settings.host }, () => resolve(tlsSocket))
        tlsSocket.once("error", reject)
      })
      await command("EHLO nutrilog", [250])
    }
    if (settings.username) {
      await command("AUTH LOGIN", [334])
      await command(Buffer.from(settings.username).toString("base64"), [334])
      await command(Buffer.from(settings.password).toString("base64"), [235])
    }
    const formattedFrom = settings.fromName + " <" + settings.fromEmail + ">"
    await command("MAIL FROM:<" + settings.fromEmail + ">", [250])
    await command("RCPT TO:<" + to + ">", [250, 251])
    await command("DATA", [354])
    const message = "From: " + formattedFrom + "\r\nTo: " + to + "\r\nSubject: " + subject + "\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + body + "\r\n"
    socket.write(message.replace(/^\./gm, "..") + "\r\n.\r\n")
    await new Promise((resolve, reject) => {
      const onData = chunk => {
        if (/^250 /.test(chunk.toString())) { socket.off("data", onData); resolve() }
      }
      socket.on("data", onData)
      socket.once("error", reject)
    })
  } finally { socket.end() }
}

const sendPasswordResetEmail = async (settings, email, token) => {
  const url = settings.publicUrl + "/?reset=" + encodeURIComponent(token)
  await sendSmtpEmail(settings, email, "NutriLog password reset",
    "Someone requested a NutriLog password reset.\r\n\r\nReset your password within 30 minutes:\r\n" + url + "\r\n\r\nIf you did not request this, you can safely ignore this email.")
}
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
    "SELECT u.id, u.email, u.role, u.is_active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()",
    [tokenHash(token)]
  )
  return rows[0] || null
}

async function isAdmin(user) {
  return Boolean(user && user.role === "admin")
}

async function authApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    return send(res, 200, { ok: true, service: "nutrilog-api" })
  }

  if (req.method === "GET" && pathname === "/api/setup") {
    const rows = await sql.unsafe("SELECT COUNT(*)::int AS count FROM users")
    return send(res, 200, { setupRequired: Number(rows[0]?.count || 0) === 0 })
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    return send(res, 200, { user: await userFromRequest(req) })
  }

  if (req.method === "POST" && pathname === "/api/auth/setup") {
    if (!authAllowed(req)) return send(res, 429, { error: "Too many authentication attempts. Try again later." })
    const countRows = await sql.unsafe("SELECT COUNT(*)::int AS count FROM users")
    if (Number(countRows[0]?.count || 0) !== 0) return send(res, 409, { error: "Initial setup has already been completed" })
    const body = await readBody(req)
    const email = String(body.email || "").trim().toLowerCase()
    if (!validEmail(email) || !validPassword(body.password)) return send(res, 400, { error: "Valid email and password (8-128 characters) are required" })
    const passwordHash = await hashPassword(body.password)
    const user = (await sql.unsafe("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin') RETURNING id, email, role, is_active", [email, passwordHash]))[0]
    await sql.unsafe("INSERT INTO user_goals (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [user.id])
    return send(res, 201, { user }, { "Set-Cookie": sessionCookie(await createSession(user.id)) })
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {

    if (!authAllowed(req)) return send(res, 429, { error: "Too many authentication attempts. Try again later." })
    const body = await readBody(req)
    const email = String(body.email || "").trim().toLowerCase()
    if (!validEmail(email) || !validPassword(body.password)) return send(res, 400, { error: "Valid email and password (8-128 characters) are required" })
    const countRows = await sql.unsafe("SELECT COUNT(*)::int AS count FROM users")
    if (Number(countRows[0]?.count || 0) !== 0) return send(res, 403, { error: "Public registration is disabled. Ask an administrator to create your account." })
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
    const rows = await sql.unsafe("SELECT id, email, role, password_hash, is_active FROM users WHERE email = $1", [email])
    if (!rows.length || !(await verifyPassword(body.password, rows[0].password_hash))) return send(res, 401, { error: "Invalid email or password" })
    if (!rows[0].is_active) return send(res, 403, { error: "This account has been disabled" })
    const user = { id: rows[0].id, email: rows[0].email, role: rows[0].role }
    return send(res, 200, { user }, { "Set-Cookie": sessionCookie(await createSession(user.id)) })
  }

  if (req.method === "POST" && pathname === "/api/auth/change-password") { const user=await userFromRequest(req); if(!user)return send(res,401,{error:"Authentication required"}); if(!authAllowed(req))return send(res,429,{error:"Too many authentication attempts. Try again later."}); const body=await readBody(req); if(!validPassword(body.newPassword))return send(res,400,{error:"Password must be 8-128 characters"}); const row=(await sql.unsafe("SELECT password_hash FROM users WHERE id=$1 AND is_active=TRUE",[user.id]))[0]; if(!row||!(await verifyPassword(body.currentPassword,row.password_hash)))return send(res,401,{error:"Current password is incorrect"}); await sql.unsafe("UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2",[await hashPassword(body.newPassword),user.id]); const current=parseCookies(req.headers.cookie).nutrilog_session; await sql.unsafe("DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2",[user.id,tokenHash(current||"")]); return send(res,200,{ok:true}) }
  if (req.method === "POST" && pathname === "/api/auth/revoke-other-sessions") { const user=await userFromRequest(req); if(!user)return send(res,401,{error:"Authentication required"}); const current=parseCookies(req.headers.cookie).nutrilog_session; await sql.unsafe("DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2",[user.id,tokenHash(current||"")]); return send(res,200,{ok:true}) }
  if (req.method === "POST" && pathname === "/api/auth/forgot-password") { if(!authAllowed(req))return send(res,429,{error:"Too many requests. Try again later."}); const body=await readBody(req); const email=String(body.email||"").trim().toLowerCase(); const generic={message:"If an account exists for that email, a password reset link has been sent."}; if(!validEmail(email))return send(res,200,generic); const row=(await sql.unsafe("SELECT id FROM users WHERE email=$1 AND is_active=TRUE",[email]))[0]; if(!row||!SMTP_HOST||!SMTP_FROM||!PUBLIC_URL)return send(res,200,generic); const token=crypto.randomBytes(32).toString("base64url"); await sql.unsafe("DELETE FROM password_reset_tokens WHERE user_id=$1 OR expires_at<=NOW()",[row.id]); await sql.unsafe("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')",[tokenHash(token),row.id]); try{await sendPasswordResetEmail(settings,email,token)}catch(err){console.error("Password reset email failed:",err.message)} return send(res,200,generic) }
  if (req.method === "POST" && pathname === "/api/auth/reset-password") { if(!authAllowed(req))return send(res,429,{error:"Too many requests. Try again later."}); const body=await readBody(req); if(!validPassword(body.newPassword)||typeof body.token!=="string")return send(res,400,{error:"A valid reset token and password (8-128 characters) are required"}); const rows=await sql.unsafe("SELECT user_id FROM password_reset_tokens WHERE token_hash=$1 AND expires_at>NOW()",[tokenHash(body.token)]); if(!rows.length)return send(res,400,{error:"This password reset link is invalid or has expired."}); await sql.unsafe("UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2",[await hashPassword(body.newPassword),rows[0].user_id]); await sql.unsafe("DELETE FROM sessions WHERE user_id=$1",[rows[0].user_id]); await sql.unsafe("DELETE FROM password_reset_tokens WHERE user_id=$1",[rows[0].user_id]); return send(res,200,{ok:true}) }
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
    fields: ["name","calories","protein","carbs","fat","fiber","serving_size","serving_amount","serving_unit","source"],
    select: "id, name, calories, protein, carbs, fat, fiber, serving_size, serving_amount, serving_unit, source, created_at, updated_at"
  },
  meals: {
    table: "meals",
    fields: ["name","calories","protein","carbs","fat","fiber","foods"],
    select: "id, name, calories, protein, carbs, fat, fiber, foods, created_at, updated_at"
  },
  "log-entries": {
    table: "log_entries",
    fields: ["entry_type","name","calories","protein","carbs","fat","fiber","foods","quantity","consumed_at"],
    select: "id, entry_type, name, calories, protein, carbs, fat, fiber, foods, quantity, consumed_at, created_at"
  }
}

async function adminApi(req, res, pathname, user) {
  if (!(await isAdmin(user))) return send(res, 403, { error: "Administrator access required" })

  if (req.method === "GET" && pathname === "/api/admin/smtp") {
    const rows = await sql.unsafe("SELECT host, port, secure, username, password_encrypted, from_email, from_name, public_url, updated_at FROM smtp_settings WHERE id=TRUE")
    const settings = rows[0]
    return send(res, 200, { configured: Boolean(settings), settings: settings ? {
      host: settings.host, port: Number(settings.port), secure: settings.secure,
      username: settings.username || "", fromEmail: settings.from_email,
      fromName: settings.from_name, publicUrl: settings.public_url,
      hasPassword: Boolean(decryptSecret(settings.password_encrypted)), updatedAt: settings.updated_at
    } : null })
  }

  if (req.method === "PUT" && pathname === "/api/admin/smtp") {
    const body = await readBody(req)
    const settings = normalizeSmtpSettings(body)
    if (!smtpSettingsValid(settings)) return send(res, 400, { error: "SMTP host, valid port, from email, and a valid public URL are required" })
    const existing = (await sql.unsafe("SELECT password_encrypted FROM smtp_settings WHERE id=TRUE"))[0]
    if (!settings.password && existing) settings.password = decryptSecret(existing.password_encrypted)
    await sql.unsafe("INSERT INTO smtp_settings (id, host, port, secure, username, password_encrypted, from_email, from_name, public_url, updated_at) VALUES (TRUE,$1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT (id) DO UPDATE SET host=EXCLUDED.host,port=EXCLUDED.port,secure=EXCLUDED.secure,username=EXCLUDED.username,password_encrypted=EXCLUDED.password_encrypted,from_email=EXCLUDED.from_email,from_name=EXCLUDED.from_name,public_url=EXCLUDED.public_url,updated_at=NOW()", [settings.host, settings.port, settings.secure, settings.username, encryptSecret(settings.password), settings.fromEmail, settings.fromName, settings.publicUrl])
    return send(res, 200, { ok: true })
  }

  if (req.method === "DELETE" && pathname === "/api/admin/smtp") {
    await sql.unsafe("DELETE FROM smtp_settings WHERE id=TRUE")
    return send(res, 200, { ok: true })
  }

  if (req.method === "POST" && pathname === "/api/admin/smtp/test") {
    const body = await readBody(req)
    const settings = normalizeSmtpSettings(body)
    const existing = (await sql.unsafe("SELECT password_encrypted FROM smtp_settings WHERE id=TRUE"))[0]
    if (!settings.password && existing) settings.password = decryptSecret(existing.password_encrypted)
    if (!smtpSettingsValid(settings)) return send(res, 400, { error: "Complete the SMTP settings before testing" })
    const to = String(body.testEmail || "").trim().toLowerCase()
    if (!validEmail(to)) return send(res, 400, { error: "A valid test email address is required" })
    try {
      await sendSmtpEmail(settings, to, "NutriLog SMTP test", "This is a test email from NutriLog.\r\n\r\nSMTP configuration is working.")
      return send(res, 200, { ok: true })
    } catch (err) {
      console.error("SMTP test failed:", err.message)
      return send(res, 502, { error: "SMTP test failed: " + err.message })
    }
  }

  if (req.method === "GET" && pathname === "/api/admin/users") {
    const rows = await sql.unsafe("SELECT id, email, role, is_active, created_at, updated_at FROM users ORDER BY created_at ASC")
    return send(res, 200, { users: rows })
  }

  if (req.method === "POST" && pathname === "/api/admin/users") {
    const body = await readBody(req)
    const email = String(body.email || "").trim().toLowerCase()
    const password = body.password
    const role = body.role || "user"
    if (!validEmail(email) || !validPassword(password) || !validRole(role)) return send(res, 400, { error: "Valid email, password (8-128 characters), and role are required" })
    const existing = await sql.unsafe("SELECT id FROM users WHERE email = $1", [email])
    if (existing.length) return send(res, 409, { error: "An account with that email already exists" })
    const passwordHash = await hashPassword(password)
    const created = (await sql.unsafe("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, is_active, created_at, updated_at", [email, passwordHash, role]))[0]
    await sql.unsafe("INSERT INTO user_goals (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [created.id])
    return send(res, 201, { user: created })
  }

  const revokeMatch = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)\/sessions\/revoke$/i)
  const passwordMatch = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)\/password$/i)
  const userMatch = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)$/i)
  const targetId = revokeMatch?.[1] || passwordMatch?.[1] || userMatch?.[1]
  if (!targetId) return send(res, 404, { error: "Admin route not found" })

  if (revokeMatch && req.method === "POST") {
    const target = (await sql.unsafe("SELECT id FROM users WHERE id = $1", [targetId]))[0]
    if (!target) return send(res, 404, { error: "User not found" })
    await sql.unsafe("DELETE FROM sessions WHERE user_id = $1", [targetId])
    return send(res, 200, { ok: true })
  }

  if (passwordMatch && req.method === "POST") {
    const body = await readBody(req)
    if (!validPassword(body.password)) return send(res, 400, { error: "Password must be 8-128 characters" })
    const target = (await sql.unsafe("SELECT id FROM users WHERE id = $1", [targetId]))[0]
    if (!target) return send(res, 404, { error: "User not found" })
    const passwordHash = await hashPassword(body.password)
    await sql.unsafe("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [passwordHash, targetId])
    await sql.unsafe("DELETE FROM sessions WHERE user_id = $1", [targetId])
    return send(res, 200, { ok: true })
  }

  if (!userMatch) return send(res, 404, { error: "Admin route not found" })

  if (req.method === "PUT") {
    const body = await readBody(req)
    const target = (await sql.unsafe("SELECT id, email, role, is_active FROM users WHERE id = $1", [targetId]))[0]
    if (!target) return send(res, 404, { error: "User not found" })
    if (body.role !== undefined && !validRole(body.role)) return send(res, 400, { error: "Invalid role" })
    if (target.id === user.id && body.is_active === false) return send(res, 400, { error: "You cannot disable your own account" })
    if (target.id === user.id && body.role === "user") return send(res, 400, { error: "You cannot remove your own administrator role" })
    const nextRole = body.role === undefined ? target.role : body.role
    const nextActive = body.is_active === undefined ? target.is_active : Boolean(body.is_active)
    const rows = await sql.unsafe("UPDATE users SET role = $1, is_active = $2, updated_at = NOW() WHERE id = $3 RETURNING id, email, role, is_active, created_at, updated_at", [nextRole, nextActive, targetId])
    if (!nextActive) await sql.unsafe("DELETE FROM sessions WHERE user_id = $1", [targetId])
    return send(res, 200, { user: rows[0] })
  }

  if (req.method === "DELETE") {
    if (targetId === user.id) return send(res, 400, { error: "You cannot delete your own account" })
    const rows = await sql.unsafe("DELETE FROM users WHERE id = $1 RETURNING id", [targetId])
    return rows.length ? send(res, 200, { ok: true }) : send(res, 404, { error: "User not found" })
  }

  return send(res, 405, { error: "Method not allowed" })
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
      if (field === "serving_amount") return numberValue(body[field] || 1)
      if (field === "serving_unit") return body[field] || "serving"
      if (field === "quantity") return numberValue(body[field] || 1)
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
        "INSERT INTO foods (user_id, name, calories, protein, carbs, fat, fiber, serving_size, serving_amount, serving_unit, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [user.id, food.name, numberValue(food.calories), numberValue(food.protein), numberValue(food.carbs), numberValue(food.fat), numberValue(food.fiber), food.servingSize || food.serving_size || "1 serving", numberValue(food.servingAmount || food.serving_amount || 1), food.servingUnit || food.serving_unit || "serving", food.source || "custom"]
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
        "INSERT INTO log_entries (user_id, entry_type, name, calories, protein, carbs, fat, fiber, foods, quantity, consumed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [user.id, entry.type || entry.entry_type, entry.name, numberValue(entry.calories), numberValue(entry.protein), numberValue(entry.carbs), numberValue(entry.fat), numberValue(entry.fiber), JSON.stringify(Array.isArray(entry.foods) ? entry.foods : []), numberValue(entry.quantity || 1), entry.timestamp || entry.consumed_at || new Date().toISOString()]
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
  if (CORS_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN)
    res.setHeader("Access-Control-Allow-Credentials", "true")
    res.setHeader("Vary", "Origin")
  }
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  if (PRODUCTION) res.setHeader("Strict-Transport-Security", "max-age=31536000")

  if (req.method === "OPTIONS") {
    if (CORS_ORIGIN) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      })
    } else {
      res.writeHead(204)
    }
    return res.end()
  }

  const pathname = new URL(req.url, "http://localhost").pathname

  try {
    const authHandled = await authApi(req, res, pathname)
    if (authHandled !== false) return

    if (pathname.startsWith("/api/admin/")) {
      const user = await userFromRequest(req)
      if (!user) return send(res, 401, { error: "Authentication required" })
      return adminApi(req, res, pathname, user)
    }

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
