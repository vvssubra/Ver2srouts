import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Save } from "lucide-react";

export type Activity = {
  name: string;
  name_ms: string;
  duration_minutes: number;
  learning_area: string;
  standards_addressed: string[];
  description: string;
  materials: string[];
  teacher_notes: string;
  expected_outcomes: string;
  differentiation_strategies?: {
    support_needed: string;
    advanced_challenge: string;
  };
  provocation_questions?: string[];
  observation_cues?: string;
  learning_objective?: string;
  procedure?: {
    introduction: string;
    activity: string;
    conclusion: string;
  };
  book_page?: string;
  teacher_reflection?: string;
};

interface ActivityEditorProps {
  activity: Activity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: Activity) => void;
}

export default function ActivityEditor({ activity, open, onOpenChange, onSave }: ActivityEditorProps) {
  const [form, setForm] = useState<Activity>({ ...activity });

  const { data: learningAreas = [] } = useQuery({
    queryKey: ["learning-areas-editor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_areas")
        .select("id, code, name_ms, name_en")
        .order("sort_order");
      if (error) throw error;
      return data as { id: string; code: string; name_ms: string; name_en: string | null }[];
    },
  });

  const update = (field: keyof Activity, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = () => {
    onSave(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Activity</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name (EN)</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nama (BM)</Label>
              <Input value={form.name_ms} onChange={(e) => update("name_ms", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Duration (min)</Label>
              <Input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => update("duration_minutes", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tunjang / Learning Area</Label>
              <Select value={form.learning_area} onValueChange={(v) => update("learning_area", v)}>
                <SelectTrigger><SelectValue placeholder="Select Tunjang" /></SelectTrigger>
                <SelectContent>
                  {learningAreas.map((la) => (
                    <SelectItem key={la.id} value={la.code}>
                      {la.name_ms}{la.name_en ? ` / ${la.name_en}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">📖 Book / Page Reference</Label>
              <Input
                value={form.book_page || ""}
                onChange={(e) => update("book_page", e.target.value)}
                placeholder="e.g. Textbook pg. 12"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">🎯 Learning Objective</Label>
            <Textarea
              value={form.learning_objective || ""}
              onChange={(e) => update("learning_objective", e.target.value)}
              rows={2}
              placeholder="What children will learn / be able to do"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={2}
            />
          </div>

          {/* Structured Procedure */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">📋 Procedure</p>

            <div className="space-y-1.5">
              <Label className="text-xs">Introduction (~5 min)</Label>
              <Textarea
                value={form.procedure?.introduction || ""}
                onChange={(e) =>
                  update("procedure", {
                    ...(form.procedure || { introduction: "", activity: "", conclusion: "" }),
                    introduction: e.target.value,
                  })
                }
                rows={2}
                placeholder="Opening activity, warm-up, or provocation"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Main Activity (~20 min)</Label>
              <Textarea
                value={form.procedure?.activity || ""}
                onChange={(e) =>
                  update("procedure", {
                    ...(form.procedure || { introduction: "", activity: "", conclusion: "" }),
                    activity: e.target.value,
                  })
                }
                rows={3}
                placeholder="Core learning activity steps"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Conclusion (~5 min)</Label>
              <Textarea
                value={form.procedure?.conclusion || ""}
                onChange={(e) =>
                  update("procedure", {
                    ...(form.procedure || { introduction: "", activity: "", conclusion: "" }),
                    conclusion: e.target.value,
                  })
                }
                rows={2}
                placeholder="Reflection, recap, or closing circle"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Standards (comma-separated codes)</Label>
            <Input
              value={(form.standards_addressed || []).join(", ")}
              onChange={(e) =>
                update("standards_addressed", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Materials (comma-separated)</Label>
            <Input
              value={(form.materials || []).join(", ")}
              onChange={(e) =>
                update("materials", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Teacher Notes</Label>
            <Textarea
              value={form.teacher_notes}
              onChange={(e) => update("teacher_notes", e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Expected Outcomes</Label>
            <Textarea
              value={form.expected_outcomes}
              onChange={(e) => update("expected_outcomes", e.target.value)}
              rows={2}
            />
          </div>

          {/* Pedagogical Enhancement Fields */}
          <div className="border-t pt-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pedagogical Enhancements</p>

            <div className="space-y-1.5">
              <Label className="text-xs">🎯 Provocation Questions (one per line)</Label>
              <Textarea
                value={(form.provocation_questions || []).join("\n")}
                onChange={(e) =>
                  update("provocation_questions", e.target.value.split("\n").filter(Boolean))
                }
                rows={3}
                placeholder="What do you think would happen if...?&#10;How could we find out...?"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">🪜 Differentiation — Support Needed</Label>
                <Textarea
                  value={form.differentiation_strategies?.support_needed || ""}
                  onChange={(e) =>
                    update("differentiation_strategies", {
                      ...(form.differentiation_strategies || {}),
                      support_needed: e.target.value,
                    })
                  }
                  rows={2}
                  placeholder="How to scaffold for children needing extra support"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">🪜 Differentiation — Advanced Challenge</Label>
                <Textarea
                  value={form.differentiation_strategies?.advanced_challenge || ""}
                  onChange={(e) =>
                    update("differentiation_strategies", {
                      ...(form.differentiation_strategies || {}),
                      advanced_challenge: e.target.value,
                    })
                  }
                  rows={2}
                  placeholder="Extension activity for advanced learners"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">👁️ Observation Cue</Label>
              <Textarea
                value={form.observation_cues || ""}
                onChange={(e) => update("observation_cues", e.target.value)}
                rows={2}
                placeholder="What specific behavior should the teacher watch for?"
              />
            </div>
          </div>

          {/* Teacher Reflection (post-lesson) */}
          <div className="border-t pt-4 space-y-1.5">
            <Label className="text-xs">📝 Teacher Reflection (post-lesson)</Label>
            <Textarea
              value={form.teacher_reflection || ""}
              onChange={(e) => update("teacher_reflection", e.target.value)}
              rows={3}
              placeholder="How did the lesson go? What worked well? What would you change?"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-1.5" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
