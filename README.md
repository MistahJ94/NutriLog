# 🥗 NutriLog

A modern, privacy-focused nutrition and macro tracking platform for managing daily nutrition, foods, meals, and personal goals.

NutriLog is being developed as a **self-hosted, offline-capable, multi-user platform**. The application now has database-backed accounts, authenticated sessions, user-scoped API storage, local browser caching, legacy local-data migration, and a Debian LXC deployment path.

## Current Features

- 📊 Daily calorie and macro tracking
- 🎯 Custom calorie, protein, carbohydrate, fat, and fiber goals
- 🥑 Personal food database
- 🔍 USDA FoodData Central search
- 🍽️ Meal builder and saved meals
- 📅 Historical daily logs
- 💾 JSON import/export backups
- 📱 Responsive desktop and mobile UI
- ⚡ React + Vite
- 🔒 Local-first data storage in the current release

## Platform

NutriLog is being structured so the current UI can evolve without being tied directly to browser storage.

- 👤 User accounts and authentication
- 🗄️ PostgreSQL-backed storage
- 🌐 Node.js backend API
- 👥 User-scoped multi-user isolation
- ☁️ Cross-device synchronization through the self-hosted API
- 📱 Local browser cache for responsive/offline viewing
- 🔐 Secure session management
- 🖥️ Self-hosted Proxmox LXC deployment
- 🔄 Simple in-container updates using the `update` command

## Proxmox

The target deployment is a dedicated Linux Container (LXC) on Proxmox VE.

```text
Proxmox VE
   │
   └── NutriLog LXC
        ├── Web application
        ├── API
        ├── Database
        ├── Persistent data
        └── /usr/bin/update
```

The deployment includes an installer modeled around the Proxmox helper-script experience. Once installed, updates will be performed from inside the LXC with:

```bash
update
```

The update process will preserve application configuration, database contents, and user data while updating the application and applying required database migrations.

## Development

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Open `http://localhost:5173`.

#### Production server

Build the frontend and run the combined API/static server:

```bash
npm run build
npm start
```

The server expects `DATABASE_URL` and listens on port `3001` by default.

## Build

```bash
npm run build
```

## Architecture Direction

The application is intentionally moving away from direct UI-to-localStorage coupling.

```text
                    NutriLog UI
                         │
                         ▼
                  Application Layer
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        Local Storage          NutriLog API
              │                     │
              │                PostgreSQL
              │                     │
              └──────── Sync ───────┘
```

This allows offline functionality to remain available while providing a path to authenticated, multi-user, cross-device operation.

## License

MIT License

## Platform foundation

The PostgreSQL data model in `db/schema.sql` uses a per-user ownership model for goals, foods, meals, and log entries. The browser keeps a local cache, while authenticated create/delete/goal operations are persisted through the API.

### Platform status

The platform foundation is implemented on this development branch:

1. Authentication and HTTP-only session handling
2. PostgreSQL schema and user-scoped API CRUD
3. Local browser cache synchronized through authenticated mutations
4. Legacy localStorage migration into the first authenticated account
5. Debian-based Proxmox LXC installer
6. `/usr/bin/update` maintenance command
7. systemd service for the NutriLog API and production web application

For public deployment, place NutriLog behind HTTPS such as Nginx Proxy Manager. The application itself should not be exposed directly to the Internet on port 3001.



### Proxmox LXC deployment

The intended production target is a dedicated Debian-based LXC. The installer is:

```bash
bash scripts/install-lxc.sh
```

After installation, updates are performed with:

```bash
update
```

The update workflow fetches the `main` branch, installs dependencies, applies the PostgreSQL schema, rebuilds the application, and restarts the systemd service. Database credentials live outside the repository in `/etc/nutrilog/nutrilog.env`.

### Security notes

- Authentication uses server-side sessions stored as SHA-256 token hashes in PostgreSQL.
- Passwords are hashed with Node.js `scrypt` using per-password salts.
- Session cookies are HTTP-only and SameSite protected; production cookies also use Secure.
- Authentication attempts are rate limited in-process.
- PostgreSQL is intended to remain bound to localhost in the LXC.
- The application should be published through HTTPS/reverse proxy rather than exposing port 3001 directly.
- Do not commit `.env` files, database credentials, or session secrets.
