import { useEffect, useRef } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

export default function MapViewer() {
  const mapRef = useRef(null);

  useEffect(() => {
    const loader = new Loader({
      apiKey: import.meta.env.VITE_GMAPS_API_KEY,
      version: "weekly",
      libraries: ["drawing"]
    });

    loader.load().then((google) => {
      const map = new google.maps.Map(mapRef.current, {
        center: { lat: -5.9467, lng: -48.1253 },
        zoom: 12,
        disableDefaultUI: true
      });

      // Exemplo: Linha estática
      new google.maps.Polyline({
        path: [
          { lat: -5.9467, lng: -48.1253 },
          { lat: -5.9400, lng: -48.1200 }
        ],
        map: map,
        strokeColor: "#42BAB8",
        strokeWeight: 5
      });
    });
  }, []);

  return <div ref={mapRef} style={{ height: '85vh', width: '100%' }} />;
}
