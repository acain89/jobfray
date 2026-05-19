type ZipPlace = {
  zip: string;
  city: string;
  state: string;
  stateName: string;
  lat: number;
  lng: number;
};

const ZIP_PLACES: ZipPlace[] = [
  { zip: "77001", city: "Houston", state: "TX", stateName: "Texas", lat: 29.8301, lng: -95.4342 },
  { zip: "77002", city: "Houston", state: "TX", stateName: "Texas", lat: 29.756, lng: -95.365 },
  { zip: "77003", city: "Houston", state: "TX", stateName: "Texas", lat: 29.7489, lng: -95.3391 },
  { zip: "77004", city: "Houston", state: "TX", stateName: "Texas", lat: 29.7245, lng: -95.3638 },
  { zip: "77005", city: "West University Place", state: "TX", stateName: "Texas", lat: 29.7174, lng: -95.4285 },
  { zip: "77006", city: "Houston", state: "TX", stateName: "Texas", lat: 29.7404, lng: -95.3913 },
  { zip: "77007", city: "Houston", state: "TX", stateName: "Texas", lat: 29.7721, lng: -95.4106 },
  { zip: "77008", city: "Houston", state: "TX", stateName: "Texas", lat: 29.7995, lng: -95.4184 },
  { zip: "77009", city: "Houston", state: "TX", stateName: "Texas", lat: 29.7938, lng: -95.3676 },
  { zip: "77010", city: "Houston", state: "TX", stateName: "Texas", lat: 29.748, lng: -95.3592 },
  { zip: "77575", city: "Liberty", state: "TX", stateName: "Texas", lat: 30.0566, lng: -94.796 },
  { zip: "77521", city: "Baytown", state: "TX", stateName: "Texas", lat: 29.7355, lng: -94.9774 },
  { zip: "77573", city: "League City", state: "TX", stateName: "Texas", lat: 29.5075, lng: -95.0949 },
  { zip: "77373", city: "Spring", state: "TX", stateName: "Texas", lat: 30.0584, lng: -95.3724 },
  { zip: "77375", city: "Tomball", state: "TX", stateName: "Texas", lat: 30.0809, lng: -95.6182 },
  { zip: "77379", city: "Spring", state: "TX", stateName: "Texas", lat: 30.0366, lng: -95.5302 },
  { zip: "77429", city: "Cypress", state: "TX", stateName: "Texas", lat: 29.9776, lng: -95.6921 },
  { zip: "77433", city: "Cypress", state: "TX", stateName: "Texas", lat: 29.8837, lng: -95.722 },
  { zip: "77449", city: "Katy", state: "TX", stateName: "Texas", lat: 29.8379, lng: -95.7355 },
  { zip: "77494", city: "Katy", state: "TX", stateName: "Texas", lat: 29.7608, lng: -95.8118 },
];

function normalizeZip(zip: string): string {
  return zip.replace(/\D/g, "").slice(0, 5);
}

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function calculateDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusMiles = 3958.8;
  const deltaLat = degreesToRadians(lat2 - lat1);
  const deltaLng = degreesToRadians(lng2 - lng1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(degreesToRadians(lat1)) *
      Math.cos(degreesToRadians(lat2)) *
      Math.sin(deltaLng / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getZipPlace(zip: string): ZipPlace | null {
  const normalized = normalizeZip(zip);
  return ZIP_PLACES.find((entry) => entry.zip === normalized) ?? null;
}

export function isValidZip(zip: string): boolean {
  return getZipPlace(zip) !== null;
}

export function formatZipPlace(zip: string): string {
  const place = getZipPlace(zip);

  if (!place) {
    return normalizeZip(zip);
  }

  return `${place.city}, ${place.stateName}`;
}

export function getNearbyZips(zip: string, radiusMiles: number): string[] {
  const center = getZipPlace(zip);

  if (!center) {
    return [];
  }

  return ZIP_PLACES.filter((entry) => {
    const distance = calculateDistanceMiles(
      center.lat,
      center.lng,
      entry.lat,
      entry.lng,
    );

    return distance <= radiusMiles;
  }).map((entry) => entry.zip);
}