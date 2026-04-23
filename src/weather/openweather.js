/**
 * OpenWeather 天气
 * 免费 key: https://openweathermap.org/api
 */

const KEY = process.env.OPENWEATHER_API_KEY;
const CITY = process.env.WEATHER_CITY || 'Shanghai';

let cache = { t: 0, v: null };
const TTL = 30 * 60 * 1000; // 30 min

export async function weather() {
  if (!KEY) return null;
  if (Date.now() - cache.t < TTL && cache.v) return cache.v;

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(CITY)}&appid=${KEY}&units=metric&lang=zh_cn`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const d = await res.json();

  const v = {
    city: d.name,
    desc: d.weather?.[0]?.description || '',
    temp: Math.round(d.main?.temp),
    feelsLike: Math.round(d.main?.feels_like),
    humidity: d.main?.humidity,
    wind: Math.round(d.wind?.speed || 0),
    clouds: d.clouds?.all,
    sunrise: new Date((d.sys?.sunrise || 0) * 1000).toTimeString().slice(0, 5),
    sunset: new Date((d.sys?.sunset || 0) * 1000).toTimeString().slice(0, 5),
  };
  cache = { t: Date.now(), v };
  return v;
}

/** 人话描述，喂给 prompt */
export function weatherText(w) {
  if (!w) return '';
  return `${w.city} ${w.temp}°C ${w.desc}，体感 ${w.feelsLike}°，湿度 ${w.humidity}%`;
}
