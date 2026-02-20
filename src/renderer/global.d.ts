import type { PuasaNotchApi } from '../shared/preload-api';

declare global {
  interface Window {
    puasaNotch: PuasaNotchApi;
  }
}

export {};
