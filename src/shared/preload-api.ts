import type {
  AppSettings,
  AutoDetectedLocation,
  CountryOption,
  DeepPartial,
  GeocodeCityResult,
  NotificationLogEntry,
  OverlayPreviewPatch,
  OverlaySnapshot,
  ReverseGeocodeResult,
} from './types';

export interface PuasaNotchApi {
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: DeepPartial<AppSettings>) => Promise<AppSettings>;
  getOverlaySnapshot: () => Promise<OverlaySnapshot>;
  onOverlaySnapshot: (listener: (snapshot: OverlaySnapshot) => void) => () => void;
  toggleOverlayExpanded: () => void;
  collapseOverlay: () => void;
  previewOverlayYOffset: (yOffset: number) => void;
  previewOverlayLayout: (patch: OverlayPreviewPatch) => void;
  setExpandedContentHeight: (height: number) => void;
  refreshSchedule: () => Promise<OverlaySnapshot>;
  getNotificationLog: () => Promise<NotificationLogEntry[]>;
  detectCurrentLocation: () => Promise<AutoDetectedLocation>;
  listCountries: () => Promise<CountryOption[]>;
  listCities: (countryName: string) => Promise<string[]>;
  geocodeCity: (city: string, countryCode?: string) => Promise<GeocodeCityResult>;
  reverseGeocodeLocation: (latitude: number, longitude: number) => Promise<ReverseGeocodeResult>;
}
