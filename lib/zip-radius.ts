type ZipCoordinate = {
  zip: string;
  lat: number;
  lng: number;
};

const ZIP_COORDINATES: ZipCoordinate[] = [
  { zip: "77001", lat: 29.8301, lng: -95.4342 },
  { zip: "77002", lat: 29.7560, lng: -95.3650 },
  { zip: "77003", lat: 29.7489, lng: -95.3391 },
  { zip: "77004", lat: 29.7245, lng: -95.3638 },
  { zip: "77005", lat: 29.7174, lng: -95.4285 },
  { zip: "77006", lat: 29.7404, lng: -95.3913 },
  { zip: "77007", lat: 29.7721, lng: -95.4106 },
  { zip: "77008", lat: 29.7995, lng: -95.4184 },
  { zip: "77009", lat: 29.7938, lng: -95.3676 },
  { zip: "77010", lat: 29.7480, lng: -95.3592 },

  { zip: "77575", lat: 30.0566, lng: -94.7960 },
  { zip: "77521", lat: 29.7355, lng: -94.9774 },
  { zip: "77573", lat: 29.5075, lng: -95.0949 },
  { zip: "77373", lat: 30.0584, lng: -95.3724 },
  { zip: "77375", lat: 30.0809, lng: -95.6182 },
  { zip: "77379", lat: 30.0366, lng: -95.5302 },
  { zip: "77429", lat: 29.9776, lng: -95.6921 },
  { zip: "77433", lat: 29.8837, lng: -95.7220 },
  { zip: "77449", lat: 29.8379, lng: -95.7355 },
  { zip: "77494", lat: 29.7608, lng: -95.8118 },
];

function degreesToRadians(
  degrees: number,
): number {
  return degrees * (Math.PI / 180);
}

function calculateDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusMiles = 3958.8;

  const deltaLat = degreesToRadians(
    lat2 - lat1,
  );

  const deltaLng = degreesToRadians(
    lng2 - lng1,
  );

  const a =
    Math.sin(deltaLat / 2) *
      Math.sin(deltaLat / 2) +
    Math.cos(degreesToRadians(lat1)) *
      Math.cos(degreesToRadians(lat2)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    );

  return earthRadiusMiles * c;
}

export function getNearbyZips(
  zip: string,
  radiusMiles: number,
): string[] {
  const center =
    ZIP_COORDINATES.find(
      (entry) => entry.zip === zip,
    );

  if (!center) {
    return [zip];
  }

  return ZIP_COORDINATES.filter((entry) => {
    const distance =
      calculateDistanceMiles(
        center.lat,
        center.lng,
        entry.lat,
        entry.lng,
      );

    return distance <= radiusMiles;
  }).map((entry) => entry.zip);
}