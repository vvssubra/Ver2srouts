import { forwardRef } from "react";
import { format } from "date-fns";

type Activity = {
  name: string;
  name_ms: string;
  duration_minutes: number;
  learning_area: string;
  standards_addressed: string[];
  description: string;
  materials: string[];
  teacher_notes: string;
  expected_outcomes: string;
  learning_objective?: string;
  procedure?: {
    introduction: string;
    activity: string;
    conclusion: string;
  };
  book_page?: string;
  teacher_reflection?: string;
  differentiation_strategies?: {
    support_needed: string;
    advanced_challenge: string;
  };
};

type DayPlan = {
  day: number;
  date?: string;
  theme_focus: string;
  activities: Activity[];
  completed?: boolean;
};

type AssessmentItem = {
  standard_code: string;
  indicator: string;
  rating_scale: string[];
};

type GeneratedPlan = {
  title: string;
  overview: string;
  days: DayPlan[];
  assessment_checklist: AssessmentItem[];
};

interface PlanPrintViewProps {
  plan: GeneratedPlan;
  ageGroup: string;
  theme: string;
  duration: string;
}

const PlanPrintView = forwardRef<HTMLDivElement, PlanPrintViewProps>(
  ({ plan, ageGroup, theme, duration }, ref) => {
    return (
      <div ref={ref} className="p-8 bg-white text-black print:p-4" style={{ fontFamily: "Arial, sans-serif" }}>
        {/* Header */}
        <div className="text-center mb-6 border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold mb-1">{plan.title}</h1>
          <p className="text-sm text-gray-600 mb-2">{plan.overview}</p>
          <div className="flex justify-center gap-4 text-xs">
            <span className="border px-2 py-0.5 rounded">Umur: {ageGroup} tahun</span>
            <span className="border px-2 py-0.5 rounded">Tema: {theme}</span>
            <span className="border px-2 py-0.5 rounded">Tempoh: {duration}</span>
          </div>
        </div>

        {/* Days */}
        {plan.days.map((day) => (
          <div key={day.day} className="mb-6 break-inside-avoid">
            <h2 className="text-lg font-bold bg-gray-100 px-3 py-1.5 mb-3">
              {day.date ? format(new Date(day.date + "T00:00:00"), "EEEE, d MMM yyyy") : `Hari ${day.day}`}: {day.theme_focus}
            </h2>

            {day.activities.map((act, j) => (
              <div key={j} className="mb-5 ml-2 border-l-2 border-gray-300 pl-3">
                <div className="flex items-baseline justify-between mb-1">
                  <div>
                    <h3 className="font-semibold text-sm inline">{act.name}</h3>
                    <span className="text-xs text-gray-500 ml-2">({act.name_ms})</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {act.duration_minutes} min · {act.learning_area}
                    {act.book_page && ` · pg. ${act.book_page}`}
                  </div>
                </div>

                {/* Learning Objective */}
                {act.learning_objective && (
                  <div className="bg-gray-50 border border-gray-200 rounded p-2 mb-2">
                    <p className="text-[10px] font-bold text-gray-700 mb-0.5">🎯 LEARNING OBJECTIVE</p>
                    <p className="text-xs">{act.learning_objective}</p>
                  </div>
                )}

                <p className="text-xs mb-1">{act.description}</p>

                {/* Structured Procedure */}
                {act.procedure && (act.procedure.introduction || act.procedure.activity || act.procedure.conclusion) && (
                  <table className="w-full text-xs border-collapse mb-2">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border px-2 py-1 text-left w-1/3">Introduction (~5 min)</th>
                        <th className="border px-2 py-1 text-left w-1/3">Activity (~20 min)</th>
                        <th className="border px-2 py-1 text-left w-1/3">Conclusion (~5 min)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border px-2 py-1 align-top">{act.procedure.introduction || "—"}</td>
                        <td className="border px-2 py-1 align-top">{act.procedure.activity || "—"}</td>
                        <td className="border px-2 py-1 align-top">{act.procedure.conclusion || "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {act.standards_addressed?.length > 0 && (
                  <p className="text-[10px] text-gray-600 mb-1">
                    <strong>Standard:</strong> {act.standards_addressed.join(", ")}
                  </p>
                )}

                {act.materials?.length > 0 && (
                  <p className="text-[10px] text-gray-600 mb-1">
                    <strong>Bahan:</strong> {act.materials.join(", ")}
                  </p>
                )}

                {/* Differentiation */}
                {act.differentiation_strategies && (act.differentiation_strategies.support_needed || act.differentiation_strategies.advanced_challenge) && (
                  <div className="text-[10px] text-gray-600 mb-1 border-l-2 border-blue-300 pl-2">
                    <strong>Differentiation:</strong>
                    {act.differentiation_strategies.support_needed && (
                      <span> Support: {act.differentiation_strategies.support_needed}</span>
                    )}
                    {act.differentiation_strategies.advanced_challenge && (
                      <span> | Challenge: {act.differentiation_strategies.advanced_challenge}</span>
                    )}
                  </div>
                )}

                {act.teacher_notes && (
                  <p className="text-[10px] text-gray-600 italic mb-1">
                    📝 {act.teacher_notes}
                  </p>
                )}

                {act.expected_outcomes && (
                  <p className="text-[10px] text-gray-600 mb-1">
                    ✅ {act.expected_outcomes}
                  </p>
                )}

                {/* Teacher Reflection box (empty for print) */}
                {act.teacher_reflection ? (
                  <div className="border border-gray-300 rounded p-2 mt-1 bg-orange-50">
                    <p className="text-[10px] font-bold text-gray-700 mb-0.5">📝 TEACHER REFLECTION</p>
                    <p className="text-xs italic">{act.teacher_reflection}</p>
                  </div>
                ) : (
                  <div className="border border-gray-300 rounded p-2 mt-1">
                    <p className="text-[10px] font-bold text-gray-700 mb-0.5">📝 TEACHER REFLECTION</p>
                    <div className="h-8 border-b border-dotted border-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Assessment */}
        {plan.assessment_checklist?.length > 0 && (
          <div className="mt-6 break-inside-avoid">
            <h2 className="text-lg font-bold bg-gray-100 px-3 py-1.5 mb-3">
              📋 Senarai Semak Penilaian / Assessment Checklist
            </h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-2 py-1 text-left">Kod</th>
                  <th className="border px-2 py-1 text-left">Indikator</th>
                  <th className="border px-2 py-1 text-left">Skala</th>
                </tr>
              </thead>
              <tbody>
                {plan.assessment_checklist.map((item, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1 font-mono">{item.standard_code}</td>
                    <td className="border px-2 py-1">{item.indicator}</td>
                    <td className="border px-2 py-1">{item.rating_scale.join(" / ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 text-center text-[10px] text-gray-400 border-t pt-2">
          Dijana oleh AI Lesson Planner · {new Date().toLocaleDateString("ms-MY")}
        </div>
      </div>
    );
  }
);

PlanPrintView.displayName = "PlanPrintView";
export default PlanPrintView;
