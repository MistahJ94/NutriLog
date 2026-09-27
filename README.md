# 🥗 NutriLog

A modern, privacy-focused nutrition and macro tracking platform for managing daily nutrition, foods, meals, and personal goals.

NutriLog is being developed as a **self-hosted, offline-capable, multi-user platform**. The current application is a browser-based single-user implementation using local storage. The project is being expanded toward a backend API, database-backed accounts, synchronization, and Proxmox LXC deployment.

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

## Planned Platform

NutriLog is being structured so the current UI can evolve without being tied directly to browser storage.

- 👤 User accounts and authentication
- 🗄️ Database-backed storage
- 🌐 Backend API
- 👥 Multi-user isolation
- ☁️ Optional cloud/cross-device synchronization
- 📱 Offline synchronization
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

The final deployment will provide an installer modeled around the Proxmox helper-script experience. Once installed, updates will be performed from inside the LXC with:

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

### Build

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
