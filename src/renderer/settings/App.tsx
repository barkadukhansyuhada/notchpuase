import { useEffect, useMemo, useState } from 'react';
import type {
  AppSettings,
  CountryOption,
  DeepPartial,
  NotificationLogEntry,
  PrayerMethod,
} from '../../shared/types';

const METHODS: PrayerMethod[] = ['MWL', 'ISNA', 'Egypt', 'UmmAlQura', 'Karachi'];
const FALLBACK_COUNTRIES: CountryOption[] = [{ name: 'Indonesia', code: 'ID' }];

interface FormState {
  countryName: string;
  countryCode: string;
  city: string;
  latitude: string;
  longitude: string;
  timezone: string;
  calculationMethod: PrayerMethod;
  imsakOffsetMinutes: string;
  fastingStartEvent: 'imsak' | 'fajr';
  remindersFajr: string;
  remindersDhuhr: string;
  remindersAsr: string;
  remindersMaghrib: string;
  remindersIsha: string;
  overlayEnabled: boolean;
  followMouseDisplay: boolean;
  yOffset: string;
  use24Hour: boolean;
  autoHideOutsideRamadan: boolean;
  showHijriDate: boolean;
}

function offsetsToString(offsets: number[]): string {
  return offsets.join(', ');
}

function parseOffsetString(value: string): number[] {
  const values = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((offset) => Number.isFinite(offset));

  const deduped = new Set<number>();
  for (const entry of values) {
    deduped.add(Math.round(entry));
  }

  return [...deduped].sort((a, b) => a - b);
}

function parseNumericInput(value: string): number {
  const normalized = value.trim().replace(',', '.');
  return Number(normalized);
}

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

function normalizeCityList(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  }

  return [...unique].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
}

function inferCountryCodeFromTimezone(timezone: string): string | undefined {
  if (timezone === 'Asia/Jakarta' || timezone === 'Asia/Makassar' || timezone === 'Asia/Jayapura') {
    return 'ID';
  }

  return undefined;
}

function toFormState(settings: AppSettings, country: CountryOption | null): FormState {
  return {
    countryName: country?.name ?? '',
    countryCode: country?.code ?? '',
    city: settings.location.city,
    latitude: String(settings.location.latitude),
    longitude: String(settings.location.longitude),
    timezone: settings.location.timezone,
    calculationMethod: settings.calculationMethod,
    imsakOffsetMinutes: String(settings.imsakOffsetMinutes),
    fastingStartEvent: settings.fastingStartEvent,
    remindersFajr: offsetsToString(settings.reminders.fajr),
    remindersDhuhr: offsetsToString(settings.reminders.dhuhr),
    remindersAsr: offsetsToString(settings.reminders.asr),
    remindersMaghrib: offsetsToString(settings.reminders.maghrib),
    remindersIsha: offsetsToString(settings.reminders.isha),
    overlayEnabled: settings.overlay.enabled,
    followMouseDisplay: settings.overlay.followMouseDisplay,
    yOffset: String(settings.overlay.yOffset),
    use24Hour: settings.overlay.use24Hour,
    autoHideOutsideRamadan: settings.overlay.autoHideOutsideRamadan,
    showHijriDate: settings.showHijriDate,
  };
}

function toPatch(form: FormState): DeepPartial<AppSettings> {
  return {
    location: {
      city: form.city.trim(),
      latitude: parseNumericInput(form.latitude),
      longitude: parseNumericInput(form.longitude),
      timezone: form.timezone.trim(),
    },
    calculationMethod: form.calculationMethod,
    imsakOffsetMinutes: parseNumericInput(form.imsakOffsetMinutes),
    fastingStartEvent: form.fastingStartEvent,
    reminders: {
      fajr: parseOffsetString(form.remindersFajr),
      dhuhr: parseOffsetString(form.remindersDhuhr),
      asr: parseOffsetString(form.remindersAsr),
      maghrib: parseOffsetString(form.remindersMaghrib),
      isha: parseOffsetString(form.remindersIsha),
    },
    overlay: {
      enabled: form.overlayEnabled,
      followMouseDisplay: form.followMouseDisplay,
      yOffset: parseNumericInput(form.yOffset),
      use24Hour: form.use24Hour,
      autoHideOutsideRamadan: form.autoHideOutsideRamadan,
    },
    showHijriDate: form.showHijriDate,
  };
}

function sortCountries(options: CountryOption[]): CountryOption[] {
  return [...options].sort((left, right) => {
    if (left.code === 'ID') {
      return -1;
    }
    if (right.code === 'ID') {
      return 1;
    }
    return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
  });
}

export function SettingsApp() {
  const [form, setForm] = useState<FormState | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [locationBusy, setLocationBusy] = useState<boolean>(false);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [logs, setLogs] = useState<NotificationLogEntry[]>([]);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const [settings, notificationLog] = await Promise.all([
          window.puasaNotch.getSettings(),
          window.puasaNotch.getNotificationLog(),
        ]);

        if (disposed) {
          return;
        }

        setLogs(notificationLog);
        const inferredCountryCode = inferCountryCodeFromTimezone(settings.location.timezone) ?? 'ID';
        const inferredCountry =
          FALLBACK_COUNTRIES.find((entry) => entry.code === inferredCountryCode) ??
          FALLBACK_COUNTRIES[0];

        setForm(
          toFormState(settings, inferredCountry ?? null),
        );

        let orderedCountries = [...FALLBACK_COUNTRIES];
        try {
          orderedCountries = sortCountries(await window.puasaNotch.listCountries());
        } catch (caughtError: unknown) {
          const message =
            caughtError instanceof Error
              ? caughtError.message
              : 'Gagal memuat daftar negara online, memakai fallback.';
          setError(message);
        }

        if (disposed) {
          return;
        }

        setCountries(orderedCountries);

        let selectedCountry =
          orderedCountries.find((entry) => entry.code === inferredCountryCode) ??
          orderedCountries.find((entry) => entry.code === 'ID') ??
          orderedCountries[0];

        if (!selectedCountry) {
          selectedCountry = inferredCountry ?? FALLBACK_COUNTRIES[0];
        }

        let cityOptions: string[] = [];
        if (selectedCountry) {
          try {
            cityOptions = normalizeCityList(await window.puasaNotch.listCities(selectedCountry.name));
          } catch (caughtError: unknown) {
            const message =
              caughtError instanceof Error
                ? caughtError.message
                : `Gagal memuat kota untuk ${selectedCountry.name}.`;
            setError(message);
            cityOptions = settings.location.city ? [settings.location.city] : [];
          }
        }

        if (disposed) {
          return;
        }

        const selectedCity = cityOptions.includes(settings.location.city)
          ? settings.location.city
          : (cityOptions[0] ?? settings.location.city);

        setCities(cityOptions);
        setForm((prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            countryCode: selectedCountry.code,
            countryName: selectedCountry.name,
            city: selectedCity,
          };
        });
      } catch (caughtError: unknown) {
        if (disposed) {
          return;
        }

        const message = caughtError instanceof Error ? caughtError.message : 'Failed to load settings';
        setError(message);
        setCountries([...FALLBACK_COUNTRIES]);
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, []);

  const validationError = useMemo(() => {
    if (!form) {
      return '';
    }

    if (!form.countryCode) {
      return 'Pilih negara terlebih dahulu.';
    }

    if (!form.city.trim()) {
      return 'Pilih kota terlebih dahulu.';
    }

    const imsakOffset = parseNumericInput(form.imsakOffsetMinutes);
    if (!Number.isFinite(imsakOffset) || imsakOffset < 0 || imsakOffset > 90) {
      return 'Imsak offset must be between 0 and 90 minutes.';
    }

    return '';
  }, [form]);

  if (!form) {
    return (
      <main className="settings-shell">
        <header>
          <h1>PuasaNotch Settings</h1>
        </header>
        {error ? <div className="message error">{error}</div> : <p>Loading settings...</p>}
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        [key]: value,
      };
    });
  };

  const applyResolvedCoordinates = (latitude: number, longitude: number, timezone: string) => {
    updateField('latitude', formatCoordinate(latitude));
    updateField('longitude', formatCoordinate(longitude));
    updateField('timezone', timezone);
  };

  const loadCitiesForCountry = async (country: CountryOption): Promise<void> => {
    setStatus('');
    setError('');
    setLocationBusy(true);

    try {
      const cityOptions = normalizeCityList(await window.puasaNotch.listCities(country.name));
      setCities(cityOptions);

      const firstCity = cityOptions[0];
      if (!firstCity) {
        updateField('city', '');
        setError(`Daftar kota untuk ${country.name} kosong.`);
        return;
      }

      updateField('city', firstCity);
      const resolved = await window.puasaNotch.geocodeCity(firstCity, country.code);
      applyResolvedCoordinates(resolved.latitude, resolved.longitude, resolved.timezone);
      setStatus(`Negara ${country.name} dipilih. Kota default: ${firstCity}.`);
    } catch (caughtError: unknown) {
      const message =
        caughtError instanceof Error ? caughtError.message : `Failed to load cities for ${country.name}`;
      setError(message);
      const fallbackCities = form.city ? [form.city] : [];
      setCities(fallbackCities);
      if (fallbackCities.length === 0) {
        updateField('city', '');
      }
    } finally {
      setLocationBusy(false);
    }
  };

  const onCountryChanged = async (countryCode: string) => {
    const nextCountry = countries.find((entry) => entry.code === countryCode);
    if (!nextCountry) {
      return;
    }

    updateField('countryCode', nextCountry.code);
    updateField('countryName', nextCountry.name);
    updateField('city', '');
    setCities([]);

    await loadCitiesForCountry(nextCountry);
  };

  const onCityChanged = async (city: string) => {
    updateField('city', city);

    if (!city || !form.countryCode) {
      return;
    }

    setStatus('');
    setError('');
    setLocationBusy(true);

    try {
      const resolved = await window.puasaNotch.geocodeCity(city, form.countryCode);
      applyResolvedCoordinates(resolved.latitude, resolved.longitude, resolved.timezone);
      setStatus(`Lokasi ${city} diperbarui otomatis.`);
    } catch (caughtError: unknown) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to resolve city coordinates';
      setError(message);
    } finally {
      setLocationBusy(false);
    }
  };

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('');
    setError('');

    if (validationError) {
      setError(validationError);
      return;
    }

    setLocationBusy(true);

    try {
      const resolved = await window.puasaNotch.geocodeCity(form.city.trim(), form.countryCode);
      const nextForm: FormState = {
        ...form,
        latitude: formatCoordinate(resolved.latitude),
        longitude: formatCoordinate(resolved.longitude),
        timezone: resolved.timezone,
      };

      const updated = await window.puasaNotch.updateSettings(toPatch(nextForm));
      setForm({
        ...toFormState(updated, {
          name: form.countryName,
          code: form.countryCode,
        }),
        city: nextForm.city,
      });
      const updatedLog = await window.puasaNotch.getNotificationLog();
      setLogs(updatedLog);
      setStatus('Settings saved. Lokasi, schedule, dan notifikasi sudah di-refresh.');
      await window.puasaNotch.refreshSchedule();
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to save settings';
      setError(message);
    } finally {
      setLocationBusy(false);
    }
  };

  const onRefresh = async () => {
    setStatus('');
    setError('');

    try {
      await window.puasaNotch.refreshSchedule();
      const updatedLog = await window.puasaNotch.getNotificationLog();
      setLogs(updatedLog);
      setStatus('Schedule refreshed.');
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to refresh schedule';
      setError(message);
    }
  };

  return (
    <main className="settings-shell">
      <header>
        <h1>PuasaNotch Settings</h1>
        <p>Pilih negara dan kota dari dropdown. Latitude, longitude, timezone diisi otomatis.</p>
      </header>

      <div className="message-stack">
        {validationError ? <div className="message error">{validationError}</div> : null}
        {error ? <div className="message error">{error}</div> : null}
        {status ? <div className="message success">{status}</div> : null}
      </div>

      <form onSubmit={onSave} className="settings-form">
        <section>
          <h2>Location</h2>
          <label>
            Negara
            <select
              value={form.countryCode}
              onChange={(event) => {
                void onCountryChanged(event.target.value);
              }}
              disabled={locationBusy || countries.length === 0}
              required
            >
              <option value="">Pilih negara</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Kota
            <select
              value={form.city}
              onChange={(event) => {
                void onCityChanged(event.target.value);
              }}
              disabled={locationBusy || cities.length === 0 || !form.countryCode}
              required
            >
              <option value="">Pilih kota</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>

          <label>
            Latitude
            <input type="number" step="0.0001" value={form.latitude} readOnly />
          </label>
          <label>
            Longitude
            <input type="number" step="0.0001" value={form.longitude} readOnly />
          </label>
          <label>
            Timezone
            <input value={form.timezone} readOnly />
          </label>
          <small>
            Prayer-time calculation tetap offline. Internet hanya dipakai untuk list negara/kota dan
            resolve koordinat.
          </small>
        </section>

        <section>
          <h2>Prayer Calculation</h2>
          <label>
            Method
            <select
              value={form.calculationMethod}
              onChange={(event) => updateField('calculationMethod', event.target.value as PrayerMethod)}
            >
              {METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label>
            Imsak offset (minutes before Fajr)
            <input
              type="number"
              min={0}
              max={90}
              value={form.imsakOffsetMinutes}
              onChange={(event) => updateField('imsakOffsetMinutes', event.target.value)}
            />
          </label>
          <label>
            Fasting start event
            <select
              value={form.fastingStartEvent}
              onChange={(event) =>
                updateField('fastingStartEvent', event.target.value as 'imsak' | 'fajr')
              }
            >
              <option value="imsak">Imsak</option>
              <option value="fajr">Subuh</option>
            </select>
          </label>
        </section>

        <section>
          <h2>Reminder Offsets (wajib, minutes, comma-separated)</h2>
          <label>
            Subuh offsets
            <input
              value={form.remindersFajr}
              onChange={(event) => updateField('remindersFajr', event.target.value)}
            />
          </label>
          <label>
            Zuhur offsets
            <input
              value={form.remindersDhuhr}
              onChange={(event) => updateField('remindersDhuhr', event.target.value)}
            />
          </label>
          <label>
            Asar offsets
            <input
              value={form.remindersAsr}
              onChange={(event) => updateField('remindersAsr', event.target.value)}
            />
          </label>
          <label>
            Maghrib offsets
            <input
              value={form.remindersMaghrib}
              onChange={(event) => updateField('remindersMaghrib', event.target.value)}
            />
          </label>
          <label>
            Isya offsets
            <input
              value={form.remindersIsha}
              onChange={(event) => updateField('remindersIsha', event.target.value)}
            />
          </label>
          <small>
            Default wajib reminders are -15, -10, -5, 0. Non-wajib events (Imsak/Syuruq/Dhuha)
            remain available in backend but are not exposed here.
          </small>
        </section>

        <section>
          <h2>Overlay</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.overlayEnabled}
              onChange={(event) => updateField('overlayEnabled', event.target.checked)}
            />
            Enable overlay
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.followMouseDisplay}
              onChange={(event) => updateField('followMouseDisplay', event.target.checked)}
            />
            Follow mouse display
          </label>
          <label>
            Y offset fine tune (px, notch baseline)
            <input
              type="number"
              value={form.yOffset}
              onChange={(event) => updateField('yOffset', event.target.value)}
            />
          </label>
          <small>Tip: lower values move the island up, higher values move it down.</small>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.use24Hour}
              onChange={(event) => updateField('use24Hour', event.target.checked)}
            />
            Use 24-hour clock
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.autoHideOutsideRamadan}
              onChange={(event) => updateField('autoHideOutsideRamadan', event.target.checked)}
            />
            Auto-hide outside Ramadan (optional)
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.showHijriDate}
              onChange={(event) => updateField('showHijriDate', event.target.checked)}
            />
            Show Hijri date on expanded panel
          </label>
        </section>

        <div className="actions">
          <button type="submit" disabled={locationBusy}>
            {locationBusy ? 'Saving...' : 'Save Settings'}
          </button>
          <button type="button" onClick={onRefresh}>
            Refresh Schedule
          </button>
        </div>
      </form>

      <section className="log-section">
        <h2>Recent Notifications</h2>
        {logs.length === 0 ? (
          <p>No notifications fired in this session.</p>
        ) : (
          <ul>
            {logs.slice(0, 12).map((entry) => (
              <li key={entry.id}>
                <strong>{entry.event}</strong> ({entry.reminderOffsetMinutes}m) fired at{' '}
                {new Date(entry.firedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
