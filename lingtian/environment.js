/* 云间灵田 · a persistent sky calendar for each garden.
   Pass the synchronized clock AND the garden owner's immutable save.createdAt.
   Elapsed wall time advances while the page is closed; no session timer, saved
   countdown, random reroll or per-second database job drives the calendar. */
(function (global) {
  'use strict';

  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const OFFSET_MS = 8 * HOUR_MS;
  const SEASON_DAYS = 7;
  const SLOT_MS = 3 * HOUR_MS;
  const MAX_FORECAST_SLOTS = 8;

  const freezeList = list => Object.freeze(list.map(item => Object.freeze(item)));
  const SEASONS = freezeList([
    { id: 'spring', name: '春季', description: '山林染新绿，春雨与薄雾常来作伴。' },
    { id: 'summer', name: '夏季', description: '云高日长，晴光与清润的阵雨交替。' },
    { id: 'autumn', name: '秋季', description: '层林泛金，天高云淡，山间偶有轻雾。' },
    { id: 'winter', name: '冬季', description: '山色清宁，细雪随风，暖灯映照灵田。' }
  ]);
  const WEATHER = freezeList([
    { id: 'clear', name: '晴和', description: '云海舒展，清光落满山间。' },
    { id: 'cloudy', name: '多云', description: '流云缓缓掠过，山色温柔。' },
    { id: 'mist', name: '薄雾', description: '轻雾绕山，远峰若隐若现。' },
    { id: 'rain', name: '细雨', description: '细雨落入云海，草木含润。' },
    { id: 'snow', name: '飘雪', description: '细雪轻落，云山披上薄霜。' }
  ]);
  const PHASES = freezeList([
    { id: 'dawn', name: '晨曦' },
    { id: 'day', name: '白昼' },
    { id: 'dusk', name: '暮色' },
    { id: 'night', name: '夜晚' }
  ]);
  // Percent weights in WEATHER order. These describe a deterministic world
  // schedule, not the user's physical location or a live weather forecast.
  const WEATHER_WEIGHTS = Object.freeze({
    spring: Object.freeze([25, 20, 15, 40, 0]),
    summer: Object.freeze([45, 25, 5, 25, 0]),
    autumn: Object.freeze([55, 25, 15, 5, 0]),
    winter: Object.freeze([30, 25, 5, 0, 40])
  });
  const CONFIG = Object.freeze({
    timeZone: 'Asia/Shanghai',
    utcOffsetMinutes: 480,
    origin: 'first-entry',
    dayMs: DAY_MS,
    seasonDays: SEASON_DAYS,
    seasonMs: SEASON_DAYS * DAY_MS,
    yearDays: SEASON_DAYS * SEASONS.length,
    yearMs: SEASON_DAYS * SEASONS.length * DAY_MS,
    weatherSlotHours: 3,
    weatherSlotMs: SLOT_MS,
    frostChance: .01,
    maxForecastSlots: MAX_FORECAST_SLOTS
  });
  const positiveMod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const pad2 = value => String(value).padStart(2, '0');
  const smoothStep = value => value * value * (3 - 2 * value);

  function validTimestamp(nowMs) {
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
      throw new TypeError('Environment time must be a finite millisecond timestamp.');
    }
    // Leave enough room for the Beijing offset, a complete season and forecast.
    // Ordinary Unix timestamps are far inside the JavaScript Date range.
    if (Math.abs(nowMs) > 8640000000000000 - CONFIG.yearMs - OFFSET_MS) {
      throw new RangeError('Environment time is outside the supported date range.');
    }
    return nowMs;
  }

  function overrideChoice(overrides, key, choices) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) ||
        !Object.prototype.hasOwnProperty.call(overrides, key)) return null;
    const value = overrides[key];
    return typeof value === 'string' ? choices.find(item => item.id === value) || null : null;
  }

  function phaseAt(localDayMs) {
    const hour = localDayMs / HOUR_MS;
    if (hour >= 5 && hour < 7) return { index: 0, daylight: smoothStep((hour - 5) / 2) };
    if (hour >= 7 && hour < 17) return { index: 1, daylight: 1 };
    if (hour >= 17 && hour < 19) return { index: 2, daylight: 1 - smoothStep((hour - 17) / 2) };
    return { index: 3, daylight: 0 };
  }

  function validOrigin(startedAt) {
    validTimestamp(startedAt);
    if (!Number.isSafeInteger(startedAt) || startedAt < 0) {
      throw new RangeError('Environment origin must be a saved nonnegative integer timestamp.');
    }
    return startedAt;
  }

  function dateLabel(date) {
    return date.getUTCFullYear() + '年' + pad2(date.getUTCMonth() + 1) +
      '月' + pad2(date.getUTCDate()) + '日';
  }

  function clockLabel(date) {
    return pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes());
  }

  // A shared, read-only sky clock for scenes without a personal garden calendar.
  // It accepts neither an account origin nor weather/season preview overrides.
  function getDaylight(nowMs) {
    const localMs = validTimestamp(nowMs) + OFFSET_MS;
    const lighting = phaseAt(positiveMod(localMs, DAY_MS)), phase = PHASES[lighting.index];
    return { phaseId: phase.id, phaseName: phase.name, daylight: lighting.daylight,
      clockText: clockLabel(new Date(localMs)), timeZone: CONFIG.timeZone };
  }

  function slotRandom(slotIndex, startedAt) {
    // One garden has the same weather on every device and for every visitor.
    // Seed from its immutable origin, never from entry time or Math.random().
    let value = (slotIndex >>> 0) ^
      Math.imul(Math.floor(slotIndex / 4294967296), 0x9e3779b1) ^
      (startedAt >>> 0) ^ Math.imul(Math.floor(startedAt / 4294967296), 0x85ebca6b) ^ 0x51c47ea3;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }

  function weatherAt(slotIndex, seasonId, startedAt) {
    const target = slotRandom(slotIndex, startedAt) * 100;
    const weights = WEATHER_WEIGHTS[seasonId];
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (target < cumulative) return WEATHER[i];
    }
    return WEATHER[0];
  }

  // The cultivation engine only consumes this natural timeline. It accepts no
  // preview overrides and avoids formatting dates while settling elapsed slots.
  function getNaturalSegment(nowMs, startedAt) {
    const timestamp = validTimestamp(nowMs), origin = validOrigin(startedAt);
    const elapsed = Math.max(0, timestamp - origin);
    const seasonNumber = Math.floor(elapsed / CONFIG.seasonMs);
    const seasonId = SEASONS[positiveMod(seasonNumber, SEASONS.length)].id;
    const slotIndex = Math.floor(elapsed / SLOT_MS);
    return {
      seasonId, winterIndex: Math.floor(seasonNumber / SEASONS.length),
      seasonStartsAt: origin + seasonNumber * CONFIG.seasonMs,
      seasonEndsAt: origin + (seasonNumber + 1) * CONFIG.seasonMs,
      weatherId: weatherAt(slotIndex, seasonId, origin).id,
      weatherStartsAt: origin + slotIndex * SLOT_MS,
      weatherEndsAt: origin + (slotIndex + 1) * SLOT_MS
    };
  }

  // Read-only atmosphere for sect scenery. Wind and cloud cover are visual
  // derivatives of the existing natural slot, never new cultivation weather.
  // Separate hash offsets leave weatherAt(), rain and frost outcomes untouched.
  // Direction is in the world X/Z plane: x = cos(direction), z = sin(direction).
  function getSceneWeather(nowMs, startedAt) {
    const segment = getNaturalSegment(nowMs, startedAt);
    const slotIndex = Math.floor((segment.weatherStartsAt - startedAt) / SLOT_MS);
    const weather = WEATHER.find(item => item.id === segment.weatherId);
    const range = { clear: [.12, .94], cloudy: [.22, .90], mist: [.08, .28], rain: [.38, .66], snow: [.22, .58] }[weather.id];
    const cloudRange = { clear: [.22, .38], cloudy: [.48, .70], mist: [.36, .58], rain: [.62, .84], snow: [.46, .68] }[weather.id];
    const rounded = value => Math.round(value * 1000) / 1000;
    const windStrength = rounded(range[0] + (range[1] - range[0]) * slotRandom(slotIndex + 1979, startedAt));
    const cloudAmount = windStrength >= .7 ? 0 : rounded(cloudRange[0] + (cloudRange[1] - cloudRange[0]) * slotRandom(slotIndex + 15401, startedAt));
    return {
      weatherId: weather.id, weatherName: weather.name, windStrength,
      windDirection: slotRandom(slotIndex + 7919, startedAt) * Math.PI * 2,
      cloudAmount, weatherStartsAt: segment.weatherStartsAt, weatherEndsAt: segment.weatherEndsAt
    };
  }

  function frostRoll(seed, winterIndex) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295 || !Number.isSafeInteger(winterIndex) || winterIndex < 0) {
      throw new TypeError('A frost check needs a persisted plant seed and a nonnegative winter index.');
    }
    let value = (seed >>> 0) ^ Math.imul(winterIndex + 1, 0x9e3779b1) ^
      Math.imul(Math.floor(winterIndex / 4294967296), 0x85ebca6b) ^ 0x36ad7f21;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }

  function getState(nowMs, overrides, startedAt) {
    const timestamp = validTimestamp(nowMs);
    const origin = validOrigin(startedAt);
    const localMs = timestamp + OFFSET_MS;
    // All calendar arithmetic uses UTC getters after a fixed Beijing offset;
    // the operating system's timezone and daylight-saving settings do not apply.
    const localDate = new Date(localMs);
    // A local clock rollback must not send a newly-created garden into an
    // imaginary previous year. Online callers always use the server clock.
    const elapsedMs = Math.max(0, timestamp - origin);
    const elapsedDays = Math.floor(elapsedMs / DAY_MS);
    const seasonNumber = Math.floor(elapsedDays / SEASON_DAYS);
    const actualSeason = SEASONS[positiveMod(seasonNumber, SEASONS.length)];
    const actualPhase = getDaylight(timestamp);
    const previewSeason = overrideChoice(overrides, 'seasonId', SEASONS);
    const previewPhase = overrideChoice(overrides, 'phaseId', PHASES);
    const previewWeather = overrideChoice(overrides, 'weatherId', WEATHER);
    const season = previewSeason || actualSeason;
    const phase = previewPhase || { id: actualPhase.phaseId, name: actualPhase.phaseName };
    const slotIndex = Math.floor(elapsedMs / SLOT_MS);
    // A season-only preview uses that season's possible weather. Explicit
    // weather previews may freely combine a scene, such as a snowy spring.
    const weather = previewWeather || weatherAt(slotIndex, season.id, origin);
    const previewLight = { dawn: 0.5, day: 1, dusk: 0.5, night: 0 };

    return {
      timestamp,
      startedAt: origin,
      firstEntryLabel: dateLabel(new Date(origin + OFFSET_MS)) + ' ' + clockLabel(new Date(origin + OFFSET_MS)),
      elapsedMs,
      elapsedDays,
      worldDay: elapsedDays + 1,
      clockLabel: actualPhase.clockText,
      dateLabel: dateLabel(localDate),
      seasonId: season.id,
      seasonName: season.name,
      seasonDay: positiveMod(elapsedDays, SEASON_DAYS) + 1,
      seasonLength: SEASON_DAYS,
      seasonStartsAt: origin + seasonNumber * CONFIG.seasonMs,
      seasonEndsAt: origin + (seasonNumber + 1) * CONFIG.seasonMs,
      year: Math.floor(elapsedDays / CONFIG.yearDays) + 1,
      phaseId: phase.id,
      phaseName: phase.name,
      daylight: previewPhase ? previewLight[phase.id] : actualPhase.daylight,
      weatherId: weather.id,
      weatherName: weather.name,
      weatherDescription: weather.description,
      weatherStartsAt: origin + slotIndex * SLOT_MS,
      weatherEndsAt: origin + (slotIndex + 1) * SLOT_MS,
      preview: !!(previewSeason || previewPhase || previewWeather)
    };
  }

  function getForecast(nowMs, count = 4, startedAt) {
    const timestamp = validTimestamp(nowMs);
    const origin = validOrigin(startedAt);
    if (!Number.isInteger(count) || count < 0 || count > MAX_FORECAST_SLOTS) {
      throw new RangeError('Forecast count must be an integer from 0 to ' + MAX_FORECAST_SLOTS + '.');
    }
    const nextSlot = origin + (Math.floor(Math.max(0, timestamp - origin) / SLOT_MS) + 1) * SLOT_MS;
    const forecast = [];
    for (let i = 0; i < count; i++) {
      const startsAt = nextSlot + i * SLOT_MS;
      const state = getState(startsAt, null, origin);
      forecast.push(Object.assign(state, { startsAt, endsAt: state.weatherEndsAt }));
    }
    return forecast;
  }

  global.SpiritEnvironment = Object.freeze({ CONFIG, SEASONS, WEATHER, PHASES, getDaylight, getState, getForecast, getNaturalSegment, getSceneWeather, frostRoll });
})(typeof window !== 'undefined' ? window : globalThis);
