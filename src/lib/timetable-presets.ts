/**
 * Ready-made starter schedules so a brand-new class can go from
 * empty → fully scheduled in one click. These are inserted as
 * regular `timetable_slots` rows — no schema change, fully editable.
 *
 * Each slot covers a 30-minute window. day_of_week: 1=Mon … 5=Fri.
 */

export type PresetSlot = {
  day_of_week: number;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  subject_name: string;
};

export type SchedulePreset = {
  id: string;
  name: string;
  tagline: string;
  hours: string;
  emoji: string;
  slots: PresetSlot[];
};

const WEEKDAYS = [1, 2, 3, 4, 5];

// Helper to build a weekday template from a list of (start, end, subject)
function buildWeek(rows: Array<[string, string, string]>): PresetSlot[] {
  return WEEKDAYS.flatMap((day) =>
    rows.map(([start_time, end_time, subject_name]) => ({
      day_of_week: day,
      start_time,
      end_time,
      subject_name,
    })),
  );
}

// Kindergarten — Full Day (8:00 – 14:30)
const KSPK_FULL: Array<[string, string, string]> = [
  ["08:00", "08:30", "Assembly"],
  ["08:30", "09:00", "Circle Time"],
  ["09:00", "09:30", "English"],
  ["09:30", "10:00", "Maths"],
  ["10:00", "10:30", "Break"],
  ["10:30", "11:00", "Bahasa Melayu"],
  ["11:00", "11:30", "Phonics"],
  ["11:30", "12:00", "Islamic Studies"],
  ["12:00", "12:30", "Free Play"],
  ["12:30", "13:00", "Break"],
  ["13:00", "13:30", "Art & Craft"],
  ["13:30", "14:00", "Physical Education"],
  ["14:00", "14:30", "Music"],
];

// Kindergarten — Half Day (8:00 – 12:30)
const KSPK_HALF: Array<[string, string, string]> = [
  ["08:00", "08:30", "Assembly"],
  ["08:30", "09:00", "Circle Time"],
  ["09:00", "09:30", "English"],
  ["09:30", "10:00", "Maths"],
  ["10:00", "10:30", "Break"],
  ["10:30", "11:00", "Bahasa Melayu"],
  ["11:00", "11:30", "Phonics"],
  ["11:30", "12:00", "Art & Craft"],
  ["12:00", "12:30", "Free Play"],
];

// Taska / Toddler Day (8:00 – 17:00) — play-led, light academics
const TASKA: Array<[string, string, string]> = [
  ["08:00", "08:30", "Free Play"],
  ["08:30", "09:00", "Circle Time"],
  ["09:00", "09:30", "Music & Movement"],
  ["09:30", "10:00", "Break"],
  ["10:00", "10:30", "Practical Life Skills"],
  ["10:30", "11:00", "Outdoor Adventure & Nature"],
  ["11:00", "11:30", "Free Play"],
  ["11:30", "12:00", "Break"],
  ["12:00", "14:00", "Free Play"], // nap window — schools relabel as needed
  ["14:00", "14:30", "Drama & Storytelling"],
  ["14:30", "15:00", "Break"],
  ["15:00", "15:30", "Arts & Craft"],
  ["15:30", "16:00", "Music & Movement"],
  ["16:00", "17:00", "Free Play"],
];

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    id: "kspk-full",
    name: "Kindergarten — Full Day",
    tagline: "Assembly · core subjects · enrichment afternoon",
    hours: "8:00 AM – 2:30 PM",
    emoji: "🌞",
    slots: buildWeek(KSPK_FULL),
  },
  {
    id: "kspk-half",
    name: "Kindergarten — Half Day",
    tagline: "Mornings only — core academic subjects",
    hours: "8:00 AM – 12:30 PM",
    emoji: "📚",
    slots: buildWeek(KSPK_HALF),
  },
  {
    id: "taska",
    name: "Taska / Toddler",
    tagline: "Play-led day with naps, snacks and outdoor time",
    hours: "8:00 AM – 5:00 PM",
    emoji: "🧸",
    slots: buildWeek(TASKA),
  },
];