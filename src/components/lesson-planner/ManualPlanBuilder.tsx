import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import type { LearningArea } from "./types";

interface ManualPlanBuilderProps {
  manualDays: any[];
  setManualDays: React.Dispatch<React.SetStateAction<any[]>>;
  computeDayDate: (dayIndex: number) => Date;
  learningAreas: LearningArea[];
}

function createEmptyActivity() {
  return {
    name: "", name_ms: "", duration_minutes: 30, learning_area: "",
    standards_addressed: [], description: "", materials: [], teacher_notes: "",
    expected_outcomes: "", learning_objective: "",
    procedure: { introduction: "", activity: "", conclusion: "" },
    book_page: "", differentiation_strategies: { support_needed: "", advanced_challenge: "" },
  };
}

export { createEmptyActivity };

export default function ManualPlanBuilder({
  manualDays,
  setManualDays,
  computeDayDate,
  learningAreas,
}: ManualPlanBuilderProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Pencil className="h-5 w-5 text-primary" />
          Manual Lesson Plan
        </CardTitle>
        <CardDescription>Fill in your lesson plan activities below. Click "Save Manual Plan" when done.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {manualDays.map((day, dayIdx) => (
          <div key={dayIdx} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                {format(computeDayDate(dayIdx), "EEEE, d MMM yyyy")} (Day {day.day})
              </h3>
              {manualDays.length > 1 && (
                <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={() => setManualDays(prev => prev.filter((_, i) => i !== dayIdx))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Theme Focus for this day</Label>
              <Input
                value={day.theme_focus}
                onChange={(e) => setManualDays(prev => prev.map((d, i) => i === dayIdx ? { ...d, theme_focus: e.target.value } : d))}
                placeholder="e.g., Introduction to Animals"
                className="text-sm"
              />
            </div>

            {day.activities.map((act: any, actIdx: number) => (
              <Card key={actIdx} className="border-dashed">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Activity {actIdx + 1}</p>
                    {day.activities.length > 1 && (
                      <Button variant="ghost" size="sm" className="text-destructive h-6" onClick={() => {
                        setManualDays(prev => prev.map((d, i) => i === dayIdx ? { ...d, activities: d.activities.filter((_: any, j: number) => j !== actIdx) } : d));
                      }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Name (EN)</Label>
                      <Input className="text-sm h-8" value={act.name} onChange={(e) => {
                        const updated = [...manualDays];
                        updated[dayIdx].activities[actIdx] = { ...act, name: e.target.value };
                        setManualDays(updated);
                      }} placeholder="Activity name" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Nama (BM)</Label>
                      <Input className="text-sm h-8" value={act.name_ms} onChange={(e) => {
                        const updated = [...manualDays];
                        updated[dayIdx].activities[actIdx] = { ...act, name_ms: e.target.value };
                        setManualDays(updated);
                      }} placeholder="Nama aktiviti" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Duration (min)</Label>
                      <Input className="text-sm h-8" type="number" value={act.duration_minutes} onChange={(e) => {
                        const updated = [...manualDays];
                        updated[dayIdx].activities[actIdx] = { ...act, duration_minutes: parseInt(e.target.value) || 0 };
                        setManualDays(updated);
                      }} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Tunjang / Learning Area</Label>
                      <Select value={act.learning_area} onValueChange={(v) => {
                        const updated = [...manualDays];
                        updated[dayIdx].activities[actIdx] = { ...act, learning_area: v };
                        setManualDays(updated);
                      }}>
                        <SelectTrigger className="text-sm h-8"><SelectValue placeholder="Select Tunjang" /></SelectTrigger>
                        <SelectContent>
                          {learningAreas.map((la) => (
                            <SelectItem key={la.id} value={la.code}>
                              {la.name_ms}{la.name_en ? ` / ${la.name_en}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">📖 Book/Page</Label>
                      <Input className="text-sm h-8" value={act.book_page || ""} onChange={(e) => {
                        const updated = [...manualDays];
                        updated[dayIdx].activities[actIdx] = { ...act, book_page: e.target.value };
                        setManualDays(updated);
                      }} placeholder="pg. 12" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">🎯 Learning Objective</Label>
                    <Textarea className="text-sm" rows={2} value={act.learning_objective || ""} onChange={(e) => {
                      const updated = [...manualDays];
                      updated[dayIdx].activities[actIdx] = { ...act, learning_objective: e.target.value };
                      setManualDays(updated);
                    }} placeholder="What children will learn / be able to do" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Description</Label>
                    <Textarea className="text-sm" rows={2} value={act.description} onChange={(e) => {
                      const updated = [...manualDays];
                      updated[dayIdx].activities[actIdx] = { ...act, description: e.target.value };
                      setManualDays(updated);
                    }} placeholder="What children will do" />
                  </div>
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">📋 Procedure</p>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Introduction (~5 min)</Label>
                      <Textarea className="text-sm" rows={2} value={act.procedure?.introduction || ""} onChange={(e) => {
                        const updated = [...manualDays];
                        updated[dayIdx].activities[actIdx] = { ...act, procedure: { ...(act.procedure || {}), introduction: e.target.value } };
                        setManualDays(updated);
                      }} placeholder="Opening activity, warm-up" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Main Activity (~20 min)</Label>
                      <Textarea className="text-sm" rows={2} value={act.procedure?.activity || ""} onChange={(e) => {
                        const updated = [...manualDays];
                        updated[dayIdx].activities[actIdx] = { ...act, procedure: { ...(act.procedure || {}), activity: e.target.value } };
                        setManualDays(updated);
                      }} placeholder="Core learning steps" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Conclusion (~5 min)</Label>
                      <Textarea className="text-sm" rows={2} value={act.procedure?.conclusion || ""} onChange={(e) => {
                        const updated = [...manualDays];
                        updated[dayIdx].activities[actIdx] = { ...act, procedure: { ...(act.procedure || {}), conclusion: e.target.value } };
                        setManualDays(updated);
                      }} placeholder="Reflection, wrap-up" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Materials (comma-separated)</Label>
                    <Input className="text-sm h-8" value={(act.materials || []).join(", ")} onChange={(e) => {
                      const updated = [...manualDays];
                      updated[dayIdx].activities[actIdx] = { ...act, materials: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) };
                      setManualDays(updated);
                    }} placeholder="crayons, paper, glue" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Teacher Notes</Label>
                    <Textarea className="text-sm" rows={2} value={act.teacher_notes} onChange={(e) => {
                      const updated = [...manualDays];
                      updated[dayIdx].activities[actIdx] = { ...act, teacher_notes: e.target.value };
                      setManualDays(updated);
                    }} placeholder="Facilitation notes" />
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => {
                setManualDays(prev => prev.map((d, i) => i === dayIdx ? { ...d, activities: [...d.activities, createEmptyActivity()] } : d));
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Activity
            </Button>
          </div>
        ))}

        <Button
          variant="outline"
          className="w-full"
          onClick={() => setManualDays(prev => [...prev, { day: prev.length + 1, theme_focus: "", activities: [createEmptyActivity()] }])}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Day
        </Button>
      </CardContent>
    </Card>
  );
}
