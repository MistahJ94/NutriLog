# 🥗 NutriLog

A self-hosted nutrition and macro tracking platform for managing daily nutrition, foods, meals, personal goals, and user accounts across multiple devices.

NutriLog is designed around a simple goal: keep nutrition data under the operator's control while providing the convenience of a modern web application. It combines a browser-friendly local cache with an authenticated PostgreSQL-backed API so users can access their data across devices.

## ✨ Current Features

- 📊 Daily calorie and macro tracking
- 🎯 Custom calorie, protein, carbohydrate, fat, and fiber goals
- 🥑 Personal food database
- 🍽️ Meal builder and saved meals
- 📏 Explicit serving amounts and serving units for foods and meals
- 🔢 Fractional serving quantities when logging nutrition
- 🧮 Nutrition totals automatically scale with the quantity consumed
- 📅 Historical daily logs
- 💾 JSON import/export backups
- 🎨 Light and dark appearance modes
- 🌈 Multiple accent color presets plus a custom color picker
- 📱 Responsive desktop and mobile UI
- ⚡ React + Vite frontend
- 👤 User accounts and authentication
- 🔐 HTTP-only server-side sessions
- 👥 Multi-user accounts with per-user data isolation
- 🛡️ Administrator account and user management
- 🔑 Administrator password resets and session revocation
- 🔐 User self-service password changes
- 📱 Sign out of other active sessions
- ✉️ Admin-managed email password-reset recovery
- 🚫 Account enable/disable controls
- 🌐 Cross-device access through the self-hosted API
- 💾 Browser-side caching for responsive/offline-capable use
- 🔄 Legacy local-data migration into an authenticated account
- 🐘 PostgreSQL database
- 🖥️ Dedicated Proxmox LXC deployment
- ⚙️ systemd-managed production service
- 🔄 Simple in-container updates with the `update` command

## 🔐 Authentication & User Management

NutriLog supports a private, multi-user deployment rather than relying on public registration indefinitely.

### First-run setup

When a fresh database has no users, NutriLog provides an initial administrator setup flow. Once the first administrator is created, public registration is disabled.

Administrators can manage users from the application, including:

- Create users
- Create additional administrators
- Enable or disable accounts
- Promote users to administrators
- Demote administrators to regular users
- Reset user passwords
- Revoke user sessions
- Delete users

Administrators cannot disable, demote, or delete their own account through the admin interface.

## 🍽️ Nutrition & Serving Sizes

Foods store an explicit serving amount and serving unit. Nutrition values entered for a food represent one serving.

When logging a food or meal, the user can enter the number of servings consumed, including fractional quantities such as `0.5`, `1.5`, or `2.5`. NutriLog previews and stores the resulting nutrition totals based on the quantity consumed.

For example:

```text
Serving: 100 g
Calories: 165
Servings consumed: 2.5
Total calories: 412.5
```

## 🎨 Appearance

NutriLog provides browser-local appearance settings under Settings:

- Light mode
- Dark mode
- Sage
- Ocean
- Berry
- Citrus
- Teal
- Ruby
- Rose
- Indigo
- Gold
- Slate
- Custom accent color

Appearance preferences are stored locally in the user's browser, allowing each device/browser to maintain its own appearance settings.

## 🔐 Password Management & Email Recovery

Users can change their own password and revoke other active sessions from Settings.

Password recovery can be enabled through the administrator-controlled SMTP configuration.

Administrators can configure SMTP from the **Admin → Email & SMTP** panel without editing server files.

SMTP settings include:

- SMTP host
- SMTP port
- STARTTLS
- SSL/TLS
- No encryption
- SMTP username
- SMTP password
- Sender email address
- Sender name
- Public application URL
- Test email address

SMTP credentials are stored encrypted on the server and the SMTP password is never displayed back through the administrator interface.

Password recovery uses single-use, 30-minute reset tokens.

If SMTP is not configured, administrators can continue to reset user passwords from the administrator interface.

## 🏗️ Architecture

NutriLog uses a hybrid local-cache/API architecture:

```text
                    NutriLog Web UI
                           │
                           ▼
                   Application Layer
                     /           \
                    /             \
             Browser Cache      NutriLog API
                    │                │
                    │           PostgreSQL
                    │                │
                    └──── Sync ──────┘
```

The API is responsible for authentication, user ownership, persistent data, and cross-device synchronization. The browser maintains local cached data so the UI remains responsive and can support offline-capable viewing.

### Production layout

```text
Internet
   │
   ▼
Cloudflare
   │
   ▼
Nginx Proxy Manager
   │ HTTPS
   ▼
NutriLog LXC
   ├── React/Vite application
   ├── Node.js API :3001
   ├── PostgreSQL :5432 (localhost)
   └── systemd nutrilog.service
```

For public deployments, NutriLog should be placed behind HTTPS through a reverse proxy such as Nginx Proxy Manager. PostgreSQL should remain private to the LXC.

## 🖥️ Proxmox LXC Deployment

The intended production target is a dedicated Debian-based Linux Container (LXC) on Proxmox VE.

The repository includes a Proxmox helper-script-style deployment path:

```text
Proxmox VE
   │
   └── NutriLog LXC
        ├── Node.js 20
        ├── PostgreSQL 17
        ├── NutriLog application
        ├── systemd service
        └── /usr/bin/update
```

### Install

From the **Proxmox host**, run:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MistahJ94/NutriLog/main/install.sh)"
```

The installer creates the dedicated LXC and installs the application, PostgreSQL, Node.js, and systemd service.

The in-container installer includes a safety check so it will not run directly on a Proxmox host.

### Update

Enter the NutriLog LXC and run:

```bash
update
```

The update workflow:

1. Checks the current application version and commit.
2. Checks GitHub for a newer `main` commit.
3. Reports the previous and new versions when an update is available.
4. Updates the application source.
5. Installs the exact dependency lockfile with `npm ci`.
6. Applies the PostgreSQL schema.
7. Builds the frontend.
8. Removes development dependencies.
9. Restarts the systemd service.
10. Performs an application health check.

If no update is available, the command exits without changing the running application.

Application configuration and database credentials are kept outside the Git repository in:

```text
/etc/nutrilog/nutrilog.env
```

## 🛠️ Development

### Requirements

- Node.js 20+
- PostgreSQL 17
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

### Production server

Build the frontend and run the combined API/static server:

```bash
npm run build
npm start
```

The production server listens on port `3001` by default and expects `DATABASE_URL`.

### Build/check

```bash
npm run check
npm run build
```

## ⚙️ Configuration

The production environment file is:

```text
/etc/nutrilog/nutrilog.env
```

Important settings include:

- `DATABASE_URL` — PostgreSQL connection string.
- `PORT` — API/static server port; defaults to `3001`.
- `DB_POOL_SIZE` — PostgreSQL connection pool size.
- `COOKIE_SECURE` — set to `true` when authentication is served over HTTPS.
- `CORS_ORIGIN` — optional. Leave empty or unset for the normal same-origin deployment. Set it to the exact frontend origin only when the API is intentionally used cross-origin.

SMTP and password-recovery email settings are managed from the administrator interface under **Admin → Email & SMTP**.

The SMTP configuration supports:

- SMTP host and port
- STARTTLS
- SSL/TLS
- No encryption
- SMTP username and password
- Sender email address
- Sender name
- Public application URL
- Test email address

The SMTP password is encrypted before being stored in PostgreSQL.

For a standard NutriLog deployment behind a reverse proxy, the frontend and API are served from the same origin, so `CORS_ORIGIN` does not need to be configured.

## 🔒 Security

NutriLog is designed for private, self-hosted deployments.

- Passwords use Node.js `scrypt` with per-password salts.
- Authentication uses server-side sessions.
- Session tokens are stored as SHA-256 hashes in PostgreSQL rather than plaintext.
- Session cookies are HTTP-only and SameSite protected.
- Secure cookies can be enabled when the application is served over HTTPS.
- Authentication attempts are rate limited in-process.
- Security-related HTTP headers are applied by the API server.
- User-owned data is scoped by authenticated user ID.
- PostgreSQL is intended to remain bound to localhost inside the LXC.
- Port 3001 should not be forwarded directly from the Internet.
- Public deployments should use HTTPS through a reverse proxy.
- Database credentials, environment files, and session secrets must never be committed to Git.
- Password-reset tokens are stored as hashes and expire after 30 minutes.
- Password-reset tokens are single-use.
- Resetting a password revokes existing user sessions.
- SMTP credentials are encrypted before being stored in PostgreSQL.

## 📁 Repository Layout

```text
NutriLog/
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions CI
├── ct/
│   └── nutrilog.sh               # Proxmox LXC definition
├── db/
│   └── schema.sql                # PostgreSQL schema/migrations
├── install/
│   └── nutrilog-install.sh       # In-container installer
├── scripts/
│   └── update.sh                 # /usr/bin/update source
├── server/
│   └── index.cjs                 # Node.js API/static server
├── src/                          # React frontend
├── install.sh                    # Public Proxmox installer
└── README.md
```

## 🧪 Continuous Integration

NutriLog uses GitHub Actions to verify changes submitted through pull requests and changes pushed to `main`.

The CI workflow:

1. Checks out the repository.
2. Installs Node.js 20.
3. Installs dependencies with `npm ci`.
4. Runs the production build.

The project also supports the local validation commands:

```bash
npm run check
npm run build
```

## 📌 Platform Status

The platform foundation is implemented on `main`, including:

1. User authentication and HTTP-only session handling
2. First-run administrator setup
3. Administrator user management
4. PostgreSQL schema and user-scoped API storage
5. Food and meal serving-size support
6. Quantity-based nutrition logging
7. Local browser caching
8. Cross-device authenticated API access
9. Legacy local-data migration
10. Responsive desktop/mobile interface
11. Appearance modes and accent customization
12. Self-service password management
13. Password recovery through administrator-managed SMTP
14. Proxmox LXC installation
15. systemd production service
16. `/usr/bin/update` maintenance workflow
17. Application health checking
18. GitHub Actions build validation

NutriLog is actively being developed. Nutrition features and the user experience will continue to evolve while the self-hosted platform foundation remains the core deployment model.

## 📄 License

MIT License
