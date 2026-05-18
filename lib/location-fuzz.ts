export function createFuzzyCoordinates({
  latitude,
  longitude,
  seed,
}: {
  latitude: number;
  longitude: number;
  seed: string;
}): {
  latitude: number;
  longitude: number;
} {
  const hash = Array.from(seed).reduce(
    (total, character) =>
      total + character.charCodeAt(0),
    0,
  );

  const angle =
    (hash % 360) * (Math.PI / 180);

  const distanceMiles =
    0.15 + ((hash % 35) / 100);

  const milesPerDegreeLat = 69;

  const milesPerDegreeLng =
    69 *
    Math.cos(
      latitude * (Math.PI / 180),
    );

  return {
    latitude:
      latitude +
      (Math.sin(angle) *
        distanceMiles) /
        milesPerDegreeLat,

    longitude:
      longitude +
      (Math.cos(angle) *
        distanceMiles) /
        milesPerDegreeLng,
  };
}