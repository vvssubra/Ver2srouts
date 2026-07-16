import { useState, useEffect, useCallback, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Navigation, Search } from "lucide-react";

// Fix leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface GeofenceMapPickerProps {
  latitude: number | null;
  longitude: number | null;
  radius: number;
  onLocationChange: (lat: number, lng: number) => void;
  onRadiusChange: (radius: number) => void;
  height?: string;
}

/**
 * Uses vanilla Leaflet API instead of react-leaflet to avoid
 * Context.Consumer crashes inside Radix Dialog portals.
 */
export default function GeofenceMapPicker({
  latitude,
  longitude,
  radius,
  onLocationChange,
  onRadiusChange,
  height = "300px",
}: GeofenceMapPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const defaultCenter: [number, number] = [3.139, 101.6869];

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const center: [number, number] =
      latitude && longitude ? [latitude, longitude] : defaultCenter;

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: 15,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    // Ensure map renders correctly after DOM paint
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep onLocationChange callback fresh for the click handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (e: L.LeafletMouseEvent) => {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    };
    map.off("click");
    map.on("click", handler);
  }, [onLocationChange]);

  // Sync marker + circle when lat/lng/radius change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up old
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    if (latitude && longitude) {
      const marker = L.marker([latitude, longitude], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onLocationChange(pos.lat, pos.lng);
      });
      markerRef.current = marker;

      const circle = L.circle([latitude, longitude], {
        radius,
        color: "hsl(221.2 83.2% 53.3%)",
        fillColor: "hsl(221.2 83.2% 53.3%)",
        fillOpacity: 0.15,
      }).addTo(map);
      circleRef.current = circle;

      map.setView([latitude, longitude], map.getZoom());
    }
  }, [latitude, longitude, radius, onLocationChange]);

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onLocationChange(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [onLocationChange]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      const data = await res.json();
      if (data.length > 0) {
        onLocationChange(parseFloat(data[0].lat), parseFloat(data[0].lon));
      }
    } catch {}
    setSearching(false);
  }, [searchQuery, onLocationChange]);

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <Input
          placeholder="Search address..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="icon" onClick={handleSearch} disabled={searching}>
          <Search className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleUseMyLocation} className="gap-1.5">
          <Navigation className="h-3.5 w-3.5" /> My Location
        </Button>
      </div>

      {/* Map */}
      <div className="rounded-lg overflow-hidden border" style={{ height }} ref={mapContainerRef} />

      {/* Radius slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Radius: {radius}m</Label>
          <span className="text-[10px] text-muted-foreground">50m – 5000m</span>
        </div>
        <Slider
          min={50}
          max={5000}
          step={50}
          value={[radius]}
          onValueChange={([v]) => onRadiusChange(v)}
        />
      </div>

      {/* Coordinates display */}
      {latitude && longitude && (
        <p className="text-xs text-muted-foreground">
          📍 {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </p>
      )}
    </div>
  );
}
