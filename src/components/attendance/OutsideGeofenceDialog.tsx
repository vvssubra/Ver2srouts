import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Camera, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface OutsideGeofenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  distanceMeters: number;
  nearestLocationName: string;
  userLat: number;
  userLng: number;
  userId: string;
  onConfirm: (selfieUrl: string | null, note: string) => void;
  isPending: boolean;
  action?: "in" | "out";
}

const formatDistance = (meters: number) => {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)}m`;
};

export default function OutsideGeofenceDialog({
  open,
  onOpenChange,
  distanceMeters,
  nearestLocationName,
  userLat,
  userLng,
  userId,
  onConfirm,
  isPending,
  action = "in",
}: OutsideGeofenceDialogProps) {
  const isClockIn = action === "in";
  const actionLabel = isClockIn ? "clocking in" : "clocking out";
  const actionButton = isClockIn ? "Clock In Anyway" : "Clock Out Anyway";
  const pendingLabel = isClockIn ? "Clocking in..." : "Clocking out...";
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfieFile(file);
    const url = URL.createObjectURL(file);
    setSelfiePreview(url);
  };

  const handleConfirm = async () => {
    let selfieUrl: string | null = null;

    if (selfieFile) {
      setUploading(true);
      const today = new Date().toISOString().slice(0, 10);
      const filePath = `attendance-selfies/${userId}/${today}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(filePath, selfieFile, { upsert: true });
      if (error) {
        toast({ title: "Failed to upload selfie", description: error.message, variant: "destructive" });
        setUploading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      selfieUrl = urlData.publicUrl;
      setUploading(false);
    }

    const note = `Outside geofence: ${formatDistance(distanceMeters)} from ${nearestLocationName}. Coords: ${userLat.toFixed(6)}, ${userLng.toFixed(6)}${reason ? `. Reason: ${reason}` : ""}`;
    onConfirm(selfieUrl, note);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Outside Work Zone</DialogTitle>
          </div>
          <DialogDescription>
            You are {actionLabel} from outside your designated work area.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Distance info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/10 border border-warning/25 dark:bg-warning/40/20 dark:border-warning/50">
            <MapPin className="h-5 w-5 text-warning shrink-0" />
            <div>
              <p className="text-sm font-medium text-warning dark:text-warning">
                {formatDistance(distanceMeters)} from {nearestLocationName}
              </p>
              <p className="text-xs text-warning dark:text-warning">
                Your current location is outside the allowed geofence radius
              </p>
            </div>
          </div>

          {/* Selfie capture */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              Take a Selfie <span className="text-destructive">*</span>
            </Label>
            <p className="text-[10px] text-muted-foreground">
              A selfie is required for verification when {actionLabel} from outside the work zone.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleFileChange}
            />
            {selfiePreview ? (
              <div className="relative">
                <img
                  src={selfiePreview}
                  alt="Selfie"
                  className="w-full h-40 object-cover rounded-lg border"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="absolute bottom-2 right-2 gap-1"
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera className="h-3 w-3" /> Retake
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full h-24 flex-col gap-2 border-dashed"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Tap to take selfie</span>
              </Button>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea
              placeholder="Why are you outside the work zone?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!selfieFile || isPending || uploading}
            className="bg-warning/20 hover:bg-warning/25 text-white"
          >
            {uploading ? "Uploading..." : isPending ? pendingLabel : actionButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
