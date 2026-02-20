import type {
  AutoDetectedLocation,
  CountryOption,
  GeocodeCityResult,
  LocationSettings,
  ReverseGeocodeResult,
} from '../../shared/types';

interface IpApiCoResponse {
  city?: string;
  country_name?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

interface IpWhoIsResponse {
  success?: boolean;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: {
    id?: string;
  };
}

interface BigDataCloudAdministrativeEntry {
  name?: string;
  description?: string;
}

interface BigDataCloudResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
  localityInfo?: {
    informative?: BigDataCloudAdministrativeEntry[];
    administrative?: BigDataCloudAdministrativeEntry[];
  };
}

interface OpenMeteoGeocodeResult {
  name?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

interface OpenMeteoGeocodeResponse {
  results?: OpenMeteoGeocodeResult[];
}

interface RestCountriesResponseEntry {
  name?: {
    common?: string;
  };
  cca2?: string;
}

interface CountriesNowCitiesResponse {
  error?: boolean;
  msg?: string;
  data?: string[];
}

interface FallbackCityEntry {
  city: string;
  countryName: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export class LocationService {
  private static readonly DEFAULT_TIMEOUT_MS = 8_000;
  private static readonly FALLBACK_COUNTRIES: CountryOption[] = [{ name: 'Indonesia', code: 'ID' }];
  private static readonly FALLBACK_CITY_ENTRIES: FallbackCityEntry[] = [
    { city: 'Jakarta', countryName: 'Indonesia', countryCode: 'ID', latitude: -6.2088, longitude: 106.8456, timezone: 'Asia/Jakarta' },
    { city: 'Surabaya', countryName: 'Indonesia', countryCode: 'ID', latitude: -7.2575, longitude: 112.7521, timezone: 'Asia/Jakarta' },
    { city: 'Bandung', countryName: 'Indonesia', countryCode: 'ID', latitude: -6.9175, longitude: 107.6191, timezone: 'Asia/Jakarta' },
    { city: 'Semarang', countryName: 'Indonesia', countryCode: 'ID', latitude: -6.9667, longitude: 110.4167, timezone: 'Asia/Jakarta' },
    { city: 'Yogyakarta', countryName: 'Indonesia', countryCode: 'ID', latitude: -7.7956, longitude: 110.3695, timezone: 'Asia/Jakarta' },
    { city: 'Bengkulu', countryName: 'Indonesia', countryCode: 'ID', latitude: -3.8004, longitude: 102.2655, timezone: 'Asia/Jakarta' },
    { city: 'Medan', countryName: 'Indonesia', countryCode: 'ID', latitude: 3.5952, longitude: 98.6722, timezone: 'Asia/Jakarta' },
    { city: 'Palembang', countryName: 'Indonesia', countryCode: 'ID', latitude: -2.9761, longitude: 104.7754, timezone: 'Asia/Jakarta' },
    { city: 'Padang', countryName: 'Indonesia', countryCode: 'ID', latitude: -0.9492, longitude: 100.3543, timezone: 'Asia/Jakarta' },
    { city: 'Pekanbaru', countryName: 'Indonesia', countryCode: 'ID', latitude: 0.5071, longitude: 101.4478, timezone: 'Asia/Jakarta' },
    { city: 'Banda Aceh', countryName: 'Indonesia', countryCode: 'ID', latitude: 5.5483, longitude: 95.3238, timezone: 'Asia/Jakarta' },
    { city: 'Bandar Lampung', countryName: 'Indonesia', countryCode: 'ID', latitude: -5.4292, longitude: 105.2610, timezone: 'Asia/Jakarta' },
    { city: 'Pontianak', countryName: 'Indonesia', countryCode: 'ID', latitude: -0.0263, longitude: 109.3425, timezone: 'Asia/Jakarta' },
    { city: 'Banjarmasin', countryName: 'Indonesia', countryCode: 'ID', latitude: -3.3194, longitude: 114.5908, timezone: 'Asia/Makassar' },
    { city: 'Balikpapan', countryName: 'Indonesia', countryCode: 'ID', latitude: -1.2379, longitude: 116.8529, timezone: 'Asia/Makassar' },
    { city: 'Makassar', countryName: 'Indonesia', countryCode: 'ID', latitude: -5.1477, longitude: 119.4327, timezone: 'Asia/Makassar' },
    { city: 'Denpasar', countryName: 'Indonesia', countryCode: 'ID', latitude: -8.6705, longitude: 115.2126, timezone: 'Asia/Makassar' },
    { city: 'Mataram', countryName: 'Indonesia', countryCode: 'ID', latitude: -8.5833, longitude: 116.1167, timezone: 'Asia/Makassar' },
    { city: 'Manado', countryName: 'Indonesia', countryCode: 'ID', latitude: 1.4748, longitude: 124.8421, timezone: 'Asia/Makassar' },
    { city: 'Kendari', countryName: 'Indonesia', countryCode: 'ID', latitude: -3.9985, longitude: 122.5120, timezone: 'Asia/Makassar' },
    { city: 'Ambon', countryName: 'Indonesia', countryCode: 'ID', latitude: -3.6954, longitude: 128.1814, timezone: 'Asia/Jayapura' },
    { city: 'Jayapura', countryName: 'Indonesia', countryCode: 'ID', latitude: -2.5337, longitude: 140.7181, timezone: 'Asia/Jayapura' },
    { city: 'Sorong', countryName: 'Indonesia', countryCode: 'ID', latitude: -0.8762, longitude: 131.2558, timezone: 'Asia/Jayapura' },
  ];

  public async listCountries(): Promise<CountryOption[]> {
    try {
      const payload = (await this.fetchJson(
        'https://restcountries.com/v3.1/all?fields=name,cca2',
      )) as RestCountriesResponseEntry[];
      if (!Array.isArray(payload)) {
        throw new Error('Failed to parse country list from provider.');
      }

      const uniqueByCode = new Map<string, CountryOption>();
      for (const entry of payload) {
        const code = entry.cca2?.trim().toUpperCase();
        const name = entry.name?.common?.trim();
        if (!code || !name) {
          continue;
        }

        if (!uniqueByCode.has(code)) {
          uniqueByCode.set(code, { code, name });
        }
      }

      const countries = [...uniqueByCode.values()].sort((left, right) => {
        if (left.code === 'ID') {
          return -1;
        }
        if (right.code === 'ID') {
          return 1;
        }
        return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
      });

      if (countries.length === 0) {
        throw new Error('Country provider returned no options.');
      }

      return countries;
    } catch {
      return [...LocationService.FALLBACK_COUNTRIES];
    }
  }

  public async listCitiesByCountry(countryName: string): Promise<string[]> {
    const normalizedCountry = countryName.trim();
    if (normalizedCountry.length < 2) {
      throw new Error('Country name must contain at least 2 characters.');
    }

    try {
      const payload = (await this.fetchJson(
        'https://countriesnow.space/api/v0.1/countries/cities',
        LocationService.DEFAULT_TIMEOUT_MS,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ country: normalizedCountry }),
        },
      )) as CountriesNowCitiesResponse;

      if (payload.error || !Array.isArray(payload.data)) {
        throw new Error(payload.msg ?? `Failed to load city list for ${normalizedCountry}.`);
      }

      const uniqueCities = new Set<string>();
      for (const city of payload.data) {
        if (typeof city !== 'string') {
          continue;
        }

        const trimmed = city.trim();
        if (trimmed.length > 0) {
          uniqueCities.add(trimmed);
        }
      }

      const sorted = [...uniqueCities].sort((left, right) =>
        left.localeCompare(right, 'en', { sensitivity: 'base' }),
      );

      if (sorted.length === 0) {
        throw new Error(`No cities available for ${normalizedCountry}.`);
      }

      return sorted;
    } catch {
      const fallback = this.getFallbackCitiesForCountry(normalizedCountry);
      if (fallback.length > 0) {
        return fallback;
      }

      throw new Error(`Failed to load city list for ${normalizedCountry}.`);
    }
  }

  public async detectCurrentLocation(): Promise<AutoDetectedLocation> {
    const attempts = [
      () => this.detectCurrentLocationWithIpApiCo(),
      () => this.detectCurrentLocationWithIpWhoIs(),
    ];

    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw new Error(
      `Failed to auto-detect location from network provider${
        lastError instanceof Error ? `: ${lastError.message}` : ''
      }`,
    );
  }

  public async reverseGeocodeLocation(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodeResult> {
    this.assertCoordinates(latitude, longitude);

    const endpoint = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    endpoint.searchParams.set('latitude', String(latitude));
    endpoint.searchParams.set('longitude', String(longitude));
    endpoint.searchParams.set('localityLanguage', 'en');

    const payload = (await this.fetchJson(endpoint.toString())) as BigDataCloudResponse;

    const city = this.pickFirstNonEmpty(payload.city, payload.locality, payload.principalSubdivision);
    if (!city) {
      throw new Error('Reverse geocoding succeeded but city could not be resolved.');
    }

    const timezone = this.extractTimezoneFromBigDataCloud(payload);

    return {
      city,
      timezone,
      country: payload.countryName,
      source: 'api.bigdatacloud.net',
    };
  }

  public async geocodeCity(city: string, countryCode?: string): Promise<GeocodeCityResult> {
    const cityQuery = city.trim();
    if (cityQuery.length < 2) {
      throw new Error('City must contain at least 2 characters.');
    }

    const normalizedCountryCode = countryCode?.trim().toUpperCase();
    const firstResult = await this.geocodeCityWithFallback(cityQuery, normalizedCountryCode);
    if (firstResult) {
      const location = this.buildLocation(
        firstResult.name,
        firstResult.latitude,
        firstResult.longitude,
        firstResult.timezone,
        firstResult.country,
      );

      return {
        city: location.city,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: location.timezone,
        country: firstResult.country,
        source: 'geocoding-api.open-meteo.com',
      };
    }

    const fallbackGeocode = this.getFallbackGeocode(cityQuery, normalizedCountryCode);
    if (fallbackGeocode) {
      return fallbackGeocode;
    }

    throw new Error(
      `City "${cityQuery}" was not found by geocoding provider${
        normalizedCountryCode ? ` for country ${normalizedCountryCode}` : ''
      }.`,
    );
  }

  private async geocodeCityWithFallback(
    cityQuery: string,
    countryCode?: string,
  ): Promise<OpenMeteoGeocodeResult | undefined> {
    let primary: OpenMeteoGeocodeResult | undefined;
    try {
      primary = await this.geocodeCityFromOpenMeteo(cityQuery, countryCode);
    } catch {
      primary = undefined;
    }
    if (primary) {
      return primary;
    }

    if (countryCode) {
      try {
        return await this.geocodeCityFromOpenMeteo(cityQuery);
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  private async geocodeCityFromOpenMeteo(
    cityQuery: string,
    countryCode?: string,
  ): Promise<OpenMeteoGeocodeResult | undefined> {
    const endpoint = new URL('https://geocoding-api.open-meteo.com/v1/search');
    endpoint.searchParams.set('name', cityQuery);
    endpoint.searchParams.set('count', '1');
    endpoint.searchParams.set('language', 'en');
    endpoint.searchParams.set('format', 'json');
    if (countryCode) {
      endpoint.searchParams.set('countryCode', countryCode);
    }

    const payload = (await this.fetchJson(endpoint.toString())) as OpenMeteoGeocodeResponse;
    return payload.results?.[0];
  }

  private getFallbackCitiesForCountry(countryName: string): string[] {
    const normalizedCountry = countryName.trim().toLowerCase();
    const cities = LocationService.FALLBACK_CITY_ENTRIES
      .filter((entry) => entry.countryName.toLowerCase() === normalizedCountry)
      .map((entry) => entry.city)
      .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
    return [...new Set(cities)];
  }

  private getFallbackGeocode(city: string, countryCode?: string): GeocodeCityResult | null {
    const normalizedCity = city.trim().toLowerCase();
    const normalizedCountryCode = countryCode?.trim().toUpperCase();
    const match = LocationService.FALLBACK_CITY_ENTRIES.find((entry) => {
      if (entry.city.toLowerCase() !== normalizedCity) {
        return false;
      }

      if (!normalizedCountryCode) {
        return true;
      }

      return entry.countryCode === normalizedCountryCode;
    });

    if (!match) {
      return null;
    }

    return {
      city: match.city,
      latitude: match.latitude,
      longitude: match.longitude,
      timezone: match.timezone,
      country: match.countryName,
      source: 'builtin-id-cities',
    };
  }

  private async detectCurrentLocationWithIpApiCo(): Promise<AutoDetectedLocation> {
    const payload = (await this.fetchJson('https://ipapi.co/json/')) as IpApiCoResponse;

    const location = this.buildLocation(
      payload.city,
      payload.latitude,
      payload.longitude,
      payload.timezone,
      payload.country_name,
    );

    return {
      location,
      source: 'ipapi.co',
      accuracy: 'coarse',
    };
  }

  private async detectCurrentLocationWithIpWhoIs(): Promise<AutoDetectedLocation> {
    const payload = (await this.fetchJson('https://ipwho.is/')) as IpWhoIsResponse;
    if (payload.success === false) {
      throw new Error('ipwho.is returned unsuccessful response.');
    }

    const location = this.buildLocation(
      payload.city,
      payload.latitude,
      payload.longitude,
      payload.timezone?.id,
      payload.country,
    );

    return {
      location,
      source: 'ipwho.is',
      accuracy: 'coarse',
    };
  }

  private buildLocation(
    cityCandidate: string | undefined,
    latitudeCandidate: number | undefined,
    longitudeCandidate: number | undefined,
    timezoneCandidate: string | undefined,
    countryCandidate: string | undefined,
  ): LocationSettings {
    if (typeof latitudeCandidate !== 'number' || typeof longitudeCandidate !== 'number') {
      throw new Error('Location provider response did not include coordinates.');
    }

    this.assertCoordinates(latitudeCandidate, longitudeCandidate);

    const city = this.pickFirstNonEmpty(cityCandidate, countryCandidate) ?? 'Unknown city';
    const timezone = this.sanitizeTimezone(timezoneCandidate);

    return {
      city,
      latitude: latitudeCandidate,
      longitude: longitudeCandidate,
      timezone,
    };
  }

  private sanitizeTimezone(candidate: string | undefined): string {
    const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
    if (!candidate) {
      return fallback;
    }

    try {
      Intl.DateTimeFormat(undefined, { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
      return fallback;
    }
  }

  private extractTimezoneFromBigDataCloud(payload: BigDataCloudResponse): string | undefined {
    const informative = payload.localityInfo?.informative ?? [];
    for (const entry of informative) {
      if (!entry.name || !entry.description) {
        continue;
      }

      if (entry.description.toLowerCase().includes('time zone')) {
        return this.sanitizeTimezone(entry.name);
      }
    }

    const administrative = payload.localityInfo?.administrative ?? [];
    for (const entry of administrative) {
      if (!entry.name || !entry.description) {
        continue;
      }

      if (entry.description.toLowerCase().includes('time zone')) {
        return this.sanitizeTimezone(entry.name);
      }
    }

    return undefined;
  }

  private pickFirstNonEmpty(...values: Array<string | undefined>): string | undefined {
    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }

      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return undefined;
  }

  private assertCoordinates(latitude: number, longitude: number): void {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error('Latitude is out of range.');
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error('Longitude is out of range.');
    }
  }

  private async fetchJson(
    url: string,
    timeoutMs: number = LocationService.DEFAULT_TIMEOUT_MS,
    init?: RequestInit,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(init?.headers);
      headers.set('User-Agent', 'PuasaNotch/0.1.0');
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
