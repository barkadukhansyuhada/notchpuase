import { describe, expect, it, vi } from 'vitest';
import { LocationService } from '../src/main/services/LocationService';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LocationService', () => {
  it('resolves Indonesian administrative city prefixes through the canonical city name', async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const query = new URL(String(input)).searchParams.get('name');
      if (query === 'Bengkulu') {
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                name: 'Bengkulu',
                latitude: -3.80044,
                longitude: 102.26554,
                timezone: 'Asia/Jakarta',
                country: 'Indonesia',
              },
            ],
          }),
        );
      }

      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new LocationService().geocodeCity('Kota Bengkulu', 'ID');

    expect(result).toMatchObject({
      city: 'Bengkulu',
      latitude: -3.80044,
      longitude: 102.26554,
      timezone: 'Asia/Jakarta',
      country: 'Indonesia',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the built-in coordinates when the provider is unavailable', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network unavailable')));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new LocationService().geocodeCity('Kota Bengkulu', 'ID');

    expect(result).toMatchObject({
      city: 'Bengkulu',
      latitude: -3.8004,
      longitude: 102.2655,
      timezone: 'Asia/Jakarta',
      source: 'builtin-id-cities',
    });
  });
});
