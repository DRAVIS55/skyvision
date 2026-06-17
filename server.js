// server.js — Weather-AI Dashboard backend
// Weather data : Open-Meteo (https://open-meteo.com/) — free, no API key required.
// AI insights  : Google Gemini 2.5 Flash
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

const PORT          = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY
    ? new GoogleGenerativeAI(GEMINI_API_KEY)
    : null;

if (!GEMINI_API_KEY) {
    console.warn(' GEMINI_API_KEY not set — AI insights will be disabled.');
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Safe fetch helper — prevents "Unexpected token 'N'" in production ────────
// If a host returns an HTML error page instead of JSON, this surfaces a clear
// error message rather than crashing with a JSON parse exception.
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 120)}`);
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 120)}`);
  }
}

// ── WMO weather-code helpers ─────────────────────────────────────────────────

const WMO_DESC = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ heavy hail',
};
const wmoDesc = code => WMO_DESC[code] ?? `Code ${code}`;

// ── Open-Meteo fetch + response normalisation ─────────────────────────────────

async function fetchOpenMeteo(lat, lon, days, units) {
  const tempUnit = units === 'imperial' ? 'fahrenheit' : 'celsius';
  const windUnit = units === 'imperial' ? 'mph' : 'kmh';

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  const p   = url.searchParams;
  p.set('latitude',           lat);
  p.set('longitude',          lon);
  p.set('forecast_days',      days);
  p.set('temperature_unit',   tempUnit);
  p.set('wind_speed_unit',    windUnit);
  p.set('precipitation_unit', 'mm');
  p.set('timezone',           'auto');
  p.set('current', [
    'temperature_2m', 'apparent_temperature', 'weathercode',
    'windspeed_10m',  'relativehumidity_2m',  'precipitation',
    'surface_pressure',
  ].join(','));
  p.set('hourly', [
    'temperature_2m', 'precipitation_probability',
    'weathercode',    'windspeed_10m',
  ].join(','));
  p.set('daily', [
    'weathercode', 'temperature_2m_max', 'temperature_2m_min',
    'precipitation_sum', 'precipitation_probability_max',
    'windspeed_10m_max', 'sunrise', 'sunset',
  ].join(','));

  const raw = await fetchJSON(url.toString());

  // ── Build normalised current ────────────────────────────────────────
  const cur = raw.current || {};
  const current = {
    temp:        cur.temperature_2m,
    feels_like:  cur.apparent_temperature,
    humidity:    cur.relativehumidity_2m,
    wind_speed:  cur.windspeed_10m,
    wind_unit:   windUnit,
    pressure:    cur.surface_pressure != null ? Math.round(cur.surface_pressure) : null,
    condition:   wmoDesc(cur.weathercode),
    weathercode: cur.weathercode,
  };

  // ── Build normalised hourly (next 24 h, one entry per hour) ─────────
  const rh     = raw.hourly || {};
  const times  = rh.time || [];
  const now    = new Date();
  const hourly = times.reduce((acc, t, i) => {
    if (acc.length >= 24 && new Date(t) >= now) return acc;
    if (new Date(t) < now) return acc;              // skip past hours
    if (acc.length >= 24) return acc;
    acc.push({
      time:      t,
      temp:      rh.temperature_2m?.[i],
      precip_prob: rh.precipitation_probability?.[i],
      wind_speed:  rh.windspeed_10m?.[i],
      condition:   wmoDesc(rh.weathercode?.[i]),
    });
    return acc;
  }, []);

  // ── Build normalised daily forecast ─────────────────────────────────
  const rd       = raw.daily || {};
  const forecast = (rd.time || []).map((date, i) => ({
    date,
    temp_max:    rd.temperature_2m_max?.[i],
    temp_min:    rd.temperature_2m_min?.[i],
    precipitation: rd.precipitation_probability_max?.[i] ?? null,
    precip_mm:   rd.precipitation_sum?.[i],
    condition:   wmoDesc(rd.weathercode?.[i]),
    weathercode: rd.weathercode?.[i],
    sunrise:     rd.sunrise?.[i],
    sunset:      rd.sunset?.[i],
  }));

  return {
    lat:      raw.latitude,
    lon:      raw.longitude,
    timezone: raw.timezone,
    units:    { temp: tempUnit === 'celsius' ? '°C' : '°F', wind: windUnit },
    current,
    hourly,
    forecast,
  };
}

// ── AI insight via Google Gemini 2.5 Flash ─────────────────────────────

async function generateAiInsight(weather) {

    if (!genAI) return null;

    const { current, forecast, units } = weather;

    const prompt = `
You are a professional weather assistant.

Write a concise 2–3 sentence weather insight.

Include:
- What today's weather feels like.
- Any important weather trends over the coming days.
- One useful recommendation.

Current Weather

Temperature: ${current.temp}${units.temp}
Feels Like: ${current.feels_like}${units.temp}
Condition: ${current.condition}
Humidity: ${current.humidity}%
Wind Speed: ${current.wind_speed} ${units.wind}

Forecast

${forecast.map(day =>
`${day.date}
High: ${day.temp_max}${units.temp}
Low: ${day.temp_min}${units.temp}
Condition: ${day.condition}`
).join("\n\n")}
`;

    try {

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash"
        });

        const result = await model.generateContent(prompt);

        return result.response.text();

    } catch (err) {

        console.error("Gemini Error:", err.message);

        return null;

    }

}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/weather?lat=&lon=&days=&units=&ai=
app.get('/api/weather', async (req, res) => {
  const { lat, lon, days = 7, units = 'metric', ai = 'true' } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required' });

  try {
    const weather    = await fetchOpenMeteo(lat, lon, Number(days), units);
    const ai_summary = ai === 'true' ? await generateAiInsight(weather) : null;
    return res.json({ ...weather, ai_summary });
  } catch (err) {
    console.error('Weather route error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/geo  — IP geolocation via ip-api.com (free, no key)
app.get('/api/geo', async (req, res) => {
  try {
    const data = await fetchJSON('http://ip-api.com/json/?fields=lat,lon,city,regionName,country,status,message');
    if (data.status !== 'success') return res.status(502).json({ error: data.message ?? 'Geo lookup failed' });
    return res.json({ lat: data.lat, lon: data.lon, city: data.city, region: data.regionName, country: data.country });
  } catch (err) {
    console.error('Geo error:', err.message);
    return res.status(500).json({ error: 'Geo lookup failed' });
  }
});

// GET /api/health
app.get('/api/health', (_req, res) => res.json({
  status:    'ok',
  timestamp: new Date().toISOString(),
  ai_ready: !!GEMINI_API_KEY,
}));

app.listen(PORT, () => {
  console.log(`  Weather-AI server → http://localhost:${PORT}`);
  console.log(`   Weather : Open-Meteo (no key required)`);
  console.log(
    `   AI      : ${
        GEMINI_API_KEY
            ? 'Google Gemini 2.5 Flash ✓'
            : 'disabled (set GEMINI_API_KEY)'
    }`
);
});
