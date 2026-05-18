"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";

mapboxgl.accessToken =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
  "";

type Props = {
  latitude: number;
  longitude: number;
};

export default function JobMiniMap({
  latitude,
  longitude,
}: Props): React.ReactElement {
  const mapRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style:
        "mapbox://styles/mapbox/streets-v12",

      center: [longitude, latitude],

      zoom: 13.5,

      interactive: false,
    });

    map.on("load", () => {
      map.addSource("job-area", {
        type: "geojson",

        data: {
          type: "Feature",

          geometry: {
            type: "Point",

            coordinates: [
              longitude,
              latitude,
            ],
          },

          properties: {},
        },
      });

      map.addLayer({
        id: "job-area-circle",

        type: "circle",

        source: "job-area",

        paint: {
          "circle-radius": 55,

          "circle-color": "#22c55e",

          "circle-opacity": 0.18,

          "circle-stroke-width": 2,

          "circle-stroke-color":
            "#16a34a",

          "circle-stroke-opacity":
            0.45,
        },
      });
    });

    return () => {
      map.remove();
    };
  }, [latitude, longitude]);

  return (
    <div
      ref={mapRef}
      className="mt-6 h-[320px] w-full overflow-hidden rounded-3xl border border-[#dbe7df]"
    />
  );
}