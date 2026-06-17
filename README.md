# 🌤️ Weather AI Dashboard

A lightweight weather dashboard that pulls real-time forecasts from **Open-Meteo** and generates natural-language weather insights using **Google Gemini 2.5 Flash**. Built as a take-home assessment for the Weather-AI engineering team.

**Live demo →** `https://your-deployment-url.com` *(replace with your deployment link)*

---

## ✨ Features

- **Real-time weather** — current conditions, 12-hour hourly chart, and up to 16-day daily forecast
- **AI-generated insights** — Gemini 2.5 Flash writes a concise 2–3 sentence summary with a practical tip, tailored to the current conditions
- **Auto-geolocation** — detects the user's location via the browser Geolocation API (one click)
- **Metric / Imperial toggle** — switches temperature (°C / °F) and wind units (km/h / mph) on the fly
- **Zero-key weather** — Open-Meteo requires no API key, so the forecast works immediately out of the box
- **Health endpoint** — `GET /api/health` reports server status and whether AI is active

---

## 🏗️ Architecture

```
Browser (Vanilla JS + CSS)
        │
        │  HTTP / fetch
        ▼
Express server  (Node.js · server.js)
    ├── GET /api/weather  ──► Open-Meteo API   (weather data, no key)
    │                    ──► Gemini 2.5 Flash  (AI insight, GEMINI_API_KEY)
    ├── GET /api/geo      ──► ip-api.com        (IP geolocation, no key)
    └── GET /api/health   ──► status JSON
```

The server normalises Open-Meteo's raw response into a clean shape (`current`, `hourly[]`, `forecast[]`, `units`) before sending it to the frontend, so the UI is decoupled from the upstream API's field names.

---

## 🚀 Quick start

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm or pnpm | any recent |

### 1 — Clone the repo

```bash
git clone https://github.com/your-username/weather-ai-dashboard.git
cd weather-ai-dashboard
```

### 2 — Install dependencies

```bash
npm install
# or
pnpm install
```

### 3 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your key:

```env
# Required for AI insights — get yours free at https://aistudio.google.com/apikey
GEMINI_API_KEY=AIzaSy...

# Optional — defaults to 3000
# PORT=3000
```

> **No weather key needed.** Open-Meteo is completely free and requires no registration.

### 4 — Run the server

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

Open **http://localhost:3000** in your browser.

---

## 🔌 API reference

### `GET /api/weather`

Fetch forecast data for a coordinate pair.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lat` | number | — | **Required.** Latitude |
| `lon` | number | — | **Required.** Longitude |
| `days` | integer | `7` | Forecast days (1–16) |
| `units` | `metric` \| `imperial` | `metric` | Unit system |
| `ai` | `true` \| `false` | `true` | Include Gemini AI insight |

**Example request**
```
GET /api/weather?lat=-1.2921&lon=36.8219&days=7&units=metric&ai=true
```

**Example response**
```json
{
  "lat": -1.2921,
  "lon": 36.8219,
  "timezone": "Africa/Nairobi",
  "units": { "temp": "°C", "wind": "kmh" },
  "current": {
    "temp": 22,
    "feels_like": 21,
    "humidity": 65,
    "wind_speed": 14,
    "pressure": 1013,
    "condition": "Partly cloudy",
    "weathercode": 2
  },
  "hourly": [ ... ],
  "forecast": [ ... ],
  "ai_summary": "It feels pleasantly warm today with partly cloudy skies ..."
}
```

---

### `GET /api/geo`

Returns the approximate location of the requesting IP address (via ip-api.com).

```json
{
  "lat": -1.2921,
  "lon": 36.8219,
  "city": "Nairobi",
  "region": "Nairobi County",
  "country": "Kenya"
}
```

---

### `GET /api/health`

```json
{
  "status": "ok",
  "timestamp": "2026-06-15T10:00:00.000Z",
  "ai_ready": true
}
```

---

## ☁️ Deployment

### Render (recommended — free tier available)

1. Push your repo to GitHub.
2. Create a new **Web Service** on [render.com](https://render.com) and connect your repo.
3. Set **Build Command** → `npm install` and **Start Command** → `npm start`.
4. Add the `GEMINI_API_KEY` environment variable under **Environment**.
5. Deploy — Render provides a public URL automatically.

### Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway up
# Set env var:
railway variables set GEMINI_API_KEY=AIzaSy...
```

### Docker (optional)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t weather-ai .
docker run -p 3000:3000 -e GEMINI_API_KEY=AIzaSy... weather-ai
```

---

## 📁 Project structure

```
weather-ai-dashboard/
├── public/
│   └── index.html        # Single-page frontend (vanilla JS + CSS)
├── server.js             # Express server — Open-Meteo + Gemini integration
├── package.json
├── .env.example          # Environment variable template
└── README.md
```

---

## 🧰 Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Weather data | [Open-Meteo](https://open-meteo.com/) — free, no API key |
| AI insights | [Google Gemini 2.5 Flash](https://aistudio.google.com/) via `@google/generative-ai` |
| Geolocation | [ip-api.com](http://ip-api.com) — free, no API key |
| Frontend | Vanilla JS / CSS (no build step) |

---

## 📝 Design decisions

**Why Open-Meteo?** It provides a comprehensive forecast API (current, hourly, daily, 16-day range) with no authentication overhead, making it ideal for fast prototyping and zero operational cost at development volumes.

**Why Gemini 2.5 Flash?** The Flash variant offers very low latency and generous free-tier limits through Google AI Studio, which maps well to a real-time dashboard use case where AI insight generation happens on every weather fetch.

**Why a server-side proxy instead of calling APIs directly from the browser?** Keeps the AI API key out of the browser, allows response normalisation in one place, and makes it trivial to add caching or rate-limiting later.

---

## 📄 License

MIT © 2026 Samuel Kibunja