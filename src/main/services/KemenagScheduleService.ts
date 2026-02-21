import { DateTime } from 'luxon';
import type { ComputedDailyTimes, LocationSettings } from '../../shared/types';

interface MyQuranCityEntry {
  id?: string | number;
  lokasi?: string;
}

interface MyQuranCitySearchResponse {
  status?: boolean;
  data?: MyQuranCityEntry[];
}

interface MyQuranScheduleRow {
  date?: string;
  imsak?: string;
  subuh?: string;
  terbit?: string;
  dhuha?: string;
  dzuhur?: string;
  ashar?: string;
  maghrib?: string;
  isya?: string;
}

interface MyQuranScheduleResponse {
  status?: boolean;
  data?: {
    jadwal?: MyQuranScheduleRow;
  };
}

export interface KemenagSchedulePair {
  today: ComputedDailyTimes;
  tomorrow: ComputedDailyTimes;
}

export class KemenagScheduleService {
  private static readonly BASE_URL = 'https://api.myquran.com/v2/sholat';
  private static readonly DEFAULT_TIMEOUT_MS = 8_000;
  private readonly cityIdCache = new Map<string, string>();

  public async fetchTodayAndTomorrow(now: Date, location: LocationSettings): Promise<KemenagSchedulePair> {
    const zonedNow = DateTime.fromJSDate(now, { zone: location.timezone });
    const todayIso = zonedNow.toISODate();
    const tomorrowIso = zonedNow.plus({ days: 1 }).toISODate();

    if (!todayIso || !tomorrowIso) {
      throw new Error('Tidak bisa menentukan tanggal hari ini/besok untuk sinkron Kemenag.');
    }

    const cityId = await this.resolveCityId(location.city);
    const [today, tomorrow] = await Promise.all([
      this.fetchDaily(cityId, todayIso, location),
      this.fetchDaily(cityId, tomorrowIso, location),
    ]);

    return { today, tomorrow };
  }

  private async resolveCityId(city: string): Promise<string> {
    const normalizedCity = this.normalizeRegionName(city);
    if (normalizedCity.length < 2) {
      throw new Error('Nama kota terlalu pendek untuk sinkron Kemenag.');
    }

    const cached = this.cityIdCache.get(normalizedCity);
    if (cached) {
      return cached;
    }

    const endpoint = `${KemenagScheduleService.BASE_URL}/kota/cari/${encodeURIComponent(city)}`;
    const payload = (await this.fetchJson(endpoint)) as MyQuranCitySearchResponse;
    if (!payload.status || !Array.isArray(payload.data) || payload.data.length === 0) {
      throw new Error(`Kota "${city}" tidak ditemukan di provider jadwal Kemenag.`);
    }

    const best = this.pickBestCityEntry(city, payload.data);
    if (!best?.id) {
      throw new Error(`Kota "${city}" tidak memiliki ID jadwal valid pada provider Kemenag.`);
    }

    const cityId = String(best.id).padStart(4, '0');
    this.cityIdCache.set(normalizedCity, cityId);
    return cityId;
  }

  private pickBestCityEntry(city: string, entries: MyQuranCityEntry[]): MyQuranCityEntry | null {
    const target = this.normalizeRegionName(city);
    if (!target) {
      return entries[0] ?? null;
    }

    const targetTokens = new Set(target.split(' '));
    let best: { score: number; entry: MyQuranCityEntry } | null = null;

    for (const entry of entries) {
      const rawName = entry.lokasi ?? '';
      const normalizedName = this.normalizeRegionName(rawName);
      if (!normalizedName) {
        continue;
      }

      let score = 0;
      if (normalizedName === target) {
        score += 200;
      } else if (normalizedName.includes(target)) {
        score += 120;
      } else if (target.includes(normalizedName)) {
        score += 90;
      }

      const candidateTokens = normalizedName.split(' ');
      let overlap = 0;
      for (const token of candidateTokens) {
        if (targetTokens.has(token)) {
          overlap += 1;
        }
      }
      score += overlap * 12;

      if ((entry.lokasi ?? '').toUpperCase().includes('KOTA')) {
        score += 6;
      }

      if (!best || score > best.score) {
        best = { score, entry };
      }
    }

    return best?.entry ?? entries[0] ?? null;
  }

  private async fetchDaily(
    cityId: string,
    requestedDateIso: string,
    location: LocationSettings,
  ): Promise<ComputedDailyTimes> {
    const dateParts = requestedDateIso.split('-');
    if (dateParts.length !== 3) {
      throw new Error(`Format tanggal tidak valid untuk sinkron Kemenag: ${requestedDateIso}`);
    }

    const [year, month, day] = dateParts;
    const endpoint = `${KemenagScheduleService.BASE_URL}/jadwal/${cityId}/${year}/${month}/${day}`;
    const payload = (await this.fetchJson(endpoint)) as MyQuranScheduleResponse;

    const row = payload.data?.jadwal;
    if (!payload.status || !row) {
      throw new Error(`Provider Kemenag tidak mengembalikan jadwal untuk tanggal ${requestedDateIso}.`);
    }

    const resolvedDate = row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : requestedDateIso;
    const imsak = this.parseEventDate(resolvedDate, row.imsak, location.timezone, 'Imsak');
    const fajr = this.parseEventDate(resolvedDate, row.subuh, location.timezone, 'Subuh');
    const sunrise = this.parseEventDate(resolvedDate, row.terbit, location.timezone, 'Terbit');
    const dhuha = this.parseEventDate(resolvedDate, row.dhuha, location.timezone, 'Dhuha');
    const dhuhr = this.parseEventDate(resolvedDate, row.dzuhur, location.timezone, 'Zuhur');
    const asr = this.parseEventDate(resolvedDate, row.ashar, location.timezone, 'Asar');
    const maghrib = this.parseEventDate(resolvedDate, row.maghrib, location.timezone, 'Maghrib');
    const isha = this.parseEventDate(resolvedDate, row.isya, location.timezone, 'Isya');

    return {
      date: resolvedDate,
      timezone: location.timezone,
      imsak,
      fajr,
      sunrise,
      dhuha,
      dhuhr,
      asr,
      maghrib,
      isha,
    };
  }

  private parseEventDate(dateIso: string, hhmm: string | undefined, timezone: string, label: string): Date {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm.trim())) {
      throw new Error(`Format waktu ${label} tidak valid dari provider Kemenag.`);
    }

    const dt = DateTime.fromFormat(`${dateIso} ${hhmm.trim()}`, 'yyyy-MM-dd HH:mm', {
      zone: timezone,
    });

    if (!dt.isValid) {
      throw new Error(`Tidak bisa parsing waktu ${label} dari provider Kemenag.`);
    }

    return dt.toJSDate();
  }

  private normalizeRegionName(value: string): string {
    return value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\b(kota|kabupaten|kab)\b/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async fetchJson(
    url: string,
    timeoutMs: number = KemenagScheduleService.DEFAULT_TIMEOUT_MS,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Timeout saat mengakses provider Kemenag: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
