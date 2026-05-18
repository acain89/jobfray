import "server-only";

const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ?? "";

export function getMapboxToken(): string {
  return MAPBOX_TOKEN;
}

type GeocodeResult = {
  latitude: number;
  longitude: number;
};

export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult | null> {
  if (!MAPBOX_TOKEN) {
    return null;
  }

  const encoded =
    encodeURIComponent(address);

  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?limit=1&access_token=${MAPBOX_TOKEN}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    features?: Array<{
      center?: [number, number];
    }>;
  };

  const feature = data.features?.[0];

  if (!feature?.center) {
    return null;
  }

  return {
    longitude: feature.center[0],
    latitude: feature.center[1],
  };
}