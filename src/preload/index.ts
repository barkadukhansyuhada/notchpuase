import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc';
import type { PuasaNotchApi } from '../shared/preload-api';
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
} from '../shared/types';

const api: PuasaNotchApi = {
  getSettings: async () => {
    return ipcRenderer.invoke(IPC_CHANNELS.settingsGet) as Promise<AppSettings>;
  },

  updateSettings: async (patch: DeepPartial<AppSettings>) => {
    return ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, patch) as Promise<AppSettings>;
  },

  getOverlaySnapshot: async () => {
    return ipcRenderer.invoke(IPC_CHANNELS.overlayGetSnapshot) as Promise<OverlaySnapshot>;
  },

  onOverlaySnapshot: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: OverlaySnapshot) => {
      listener(snapshot);
    };

    ipcRenderer.on(IPC_CHANNELS.overlaySnapshotUpdated, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.overlaySnapshotUpdated, wrapped);
    };
  },

  toggleOverlayExpanded: () => {
    ipcRenderer.send(IPC_CHANNELS.overlayToggleExpanded);
  },

  collapseOverlay: () => {
    ipcRenderer.send(IPC_CHANNELS.overlayCollapse);
  },

  previewOverlayYOffset: (yOffset: number) => {
    ipcRenderer.send(IPC_CHANNELS.overlayPreviewYOffset, yOffset);
  },

  previewOverlayLayout: (patch: OverlayPreviewPatch) => {
    ipcRenderer.send(IPC_CHANNELS.overlayPreviewLayout, patch);
  },

  setExpandedContentHeight: (height: number) => {
    ipcRenderer.send(IPC_CHANNELS.overlaySetExpandedContentHeight, height);
  },

  refreshSchedule: async () => {
    return ipcRenderer.invoke(IPC_CHANNELS.scheduleRefresh) as Promise<OverlaySnapshot>;
  },

  getNotificationLog: async () => {
    return ipcRenderer.invoke(IPC_CHANNELS.notificationsGetLog) as Promise<NotificationLogEntry[]>;
  },

  detectCurrentLocation: async () => {
    return ipcRenderer.invoke(IPC_CHANNELS.locationDetectCurrent) as Promise<AutoDetectedLocation>;
  },

  listCountries: async () => {
    return ipcRenderer.invoke(IPC_CHANNELS.locationListCountries) as Promise<CountryOption[]>;
  },

  listCities: async (countryName: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.locationListCities, countryName) as Promise<string[]>;
  },

  geocodeCity: async (city: string, countryCode?: string) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.locationGeocodeCity,
      city,
      countryCode,
    ) as Promise<GeocodeCityResult>;
  },

  reverseGeocodeLocation: async (latitude: number, longitude: number) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.locationReverseGeocode,
      latitude,
      longitude,
    ) as Promise<ReverseGeocodeResult>;
  },
};

contextBridge.exposeInMainWorld('puasaNotch', api);
