/**
 * Malaysian Statutory Contribution Tables (KWSP/EPF, PERKESO/SOCSO, EIS)
 *
 * These functions return the OFFICIAL bracket-based contribution amounts,
 * not naive percentage approximations. This is required for compliance
 * with EPF Act 1991 (Third Schedule, Part A) and SOCSO Act 1969 (Act 4).
 *
 * Strategy:
 *  - EPF: RM20-wide wage brackets up to RM20,000 using midpoint × statutory
 *    rate, rounded to nearest RM (matches KWSP Third Schedule for employee
 *    11% / employer 13% ≤RM5k, 12% >RM5k). Above RM20k → pure percentage.
 *  - SOCSO (Cat I, age <60): RM100-wide brackets up to RM6,000 cap, using
 *    midpoint × statutory rate rounded to 5 sen.
 *  - EIS: same bracket structure as SOCSO, 0.2% each side.
 *
 * When the caller supplies a `customRate`, we honour it as a flat percentage
 * (legacy/override behaviour) instead of the table.
 */

// ─── EPF / KWSP ───────────────────────────────────────────────────────────
const EPF_EMPLOYEE_RATE = 0.11;
const EPF_EMPLOYER_RATE_LOW = 0.13;   // wage ≤ RM5,000
const EPF_EMPLOYER_RATE_HIGH = 0.12;  // wage > RM5,000
const EPF_EMPLOYER_THRESHOLD = 5000;
const EPF_TABLE_CAP = 20000;
const EPF_BRACKET = 20;

function epfBracketMidpoint(wage: number): number {
  // Bracket (lower, upper] where width = RM20
  const upper = Math.ceil(wage / EPF_BRACKET) * EPF_BRACKET;
  const lower = upper - EPF_BRACKET;
  return (lower + upper) / 2;
}

export function calcEPFStatutory(
  wage: number,
  customEmployeeRate?: number | null,
): { employee: number; employer: number; employeeRate: number; employerRate: number; bracket: string } {
  if (wage <= 0) return { employee: 0, employer: 0, employeeRate: EPF_EMPLOYEE_RATE, employerRate: EPF_EMPLOYER_RATE_LOW, bracket: "-" };

  const employerRate = wage <= EPF_EMPLOYER_THRESHOLD ? EPF_EMPLOYER_RATE_LOW : EPF_EMPLOYER_RATE_HIGH;

  // Custom rate override → pure percentage
  if (customEmployeeRate != null) {
    const r = customEmployeeRate / 100;
    return {
      employee: Math.round(wage * r * 100) / 100,
      employer: Math.round(wage * employerRate * 100) / 100,
      employeeRate: r,
      employerRate,
      bracket: "Custom %",
    };
  }

  // Above table cap → pure percentage
  if (wage > EPF_TABLE_CAP) {
    return {
      employee: Math.round(wage * EPF_EMPLOYEE_RATE * 100) / 100,
      employer: Math.round(wage * employerRate * 100) / 100,
      employeeRate: EPF_EMPLOYEE_RATE,
      employerRate,
      bracket: ">RM20,000 (rate)",
    };
  }

  const midpoint = epfBracketMidpoint(wage);
  const upper = Math.ceil(wage / EPF_BRACKET) * EPF_BRACKET;
  const lower = upper - EPF_BRACKET;

  return {
    employee: Math.round(midpoint * EPF_EMPLOYEE_RATE),  // whole RM
    employer: Math.round(midpoint * employerRate),       // whole RM
    employeeRate: EPF_EMPLOYEE_RATE,
    employerRate,
    bracket: `${lower.toFixed(2)}–${upper.toFixed(2)}`,
  };
}

// ─── SOCSO / PERKESO (Category I, contributions, age <60) ────────────────
// Employee side now covers SOCSO (0.50%) + Perlindungan 24 Jam (0.75%) = 1.25%.
// Applied as a flat percentage of capped wage (Salary × 1.25%), matching the
// combined contribution shown on payslips. Employer share is unchanged.
const SOCSO_EMPLOYEE_RATE = 0.0125;
const SOCSO_EMPLOYER_RATE = 0.0175;
const SOCSO_WAGE_CEILING = 6000;
const SOCSO_BRACKET = 100;

// PERKESO/EIS published schedules truncate to 5 sen (not round-half-up).
function floorTo5sen(v: number): number {
  return Math.floor(v * 20) / 20;
}

export function calcSOCSOStatutory(
  wage: number,
  customEmployeeRate?: number | null,
): { employee: number; employer: number; employeeRate: number; employerRate: number; bracket: string } {
  if (wage <= 0) return { employee: 0, employer: 0, employeeRate: SOCSO_EMPLOYEE_RATE, employerRate: SOCSO_EMPLOYER_RATE, bracket: "-" };

  const capped = Math.min(wage, SOCSO_WAGE_CEILING);

  if (customEmployeeRate != null) {
    const r = customEmployeeRate / 100;
    return {
      employee: Math.round(capped * r * 100) / 100,
      employer: Math.round(capped * SOCSO_EMPLOYER_RATE * 100) / 100,
      employeeRate: r,
      employerRate: SOCSO_EMPLOYER_RATE,
      bracket: "Custom %",
    };
  }

  const upper = Math.min(SOCSO_WAGE_CEILING, Math.ceil(capped / SOCSO_BRACKET) * SOCSO_BRACKET);
  const lower = upper - SOCSO_BRACKET;
  const midpoint = (lower + upper) / 2;

  return {
    // Employee: flat 1.25% (SOCSO 0.50% + Perlindungan 24 Jam 0.75%) on
    // capped wage, rounded to nearest sen — e.g. RM2,500 × 1.25% = RM31.25.
    employee: Math.round(capped * SOCSO_EMPLOYEE_RATE * 100) / 100,
    // Employer: unchanged — PERKESO Act 4 bracket table, floored to 5 sen.
    employer: floorTo5sen(midpoint * SOCSO_EMPLOYER_RATE),
    employeeRate: SOCSO_EMPLOYEE_RATE,
    employerRate: SOCSO_EMPLOYER_RATE,
    bracket: `${lower.toFixed(2)}–${upper.toFixed(2)}`,
  };
}

// ─── EIS (Employment Insurance System) ───────────────────────────────────
const EIS_RATE = 0.002;
const EIS_WAGE_CEILING = 6000;
const EIS_BRACKET = 100;

export function calcEISStatutory(
  wage: number,
  customEmployeeRate?: number | null,
): { employee: number; employer: number; employeeRate: number; employerRate: number; bracket: string } {
  if (wage <= 0) return { employee: 0, employer: 0, employeeRate: EIS_RATE, employerRate: EIS_RATE, bracket: "-" };

  const capped = Math.min(wage, EIS_WAGE_CEILING);

  if (customEmployeeRate != null) {
    const r = customEmployeeRate / 100;
    return {
      employee: Math.round(capped * r * 100) / 100,
      employer: Math.round(capped * EIS_RATE * 100) / 100,
      employeeRate: r,
      employerRate: EIS_RATE,
      bracket: "Custom %",
    };
  }

  const upper = Math.min(EIS_WAGE_CEILING, Math.ceil(capped / EIS_BRACKET) * EIS_BRACKET);
  const lower = upper - EIS_BRACKET;
  const midpoint = (lower + upper) / 2;

  return {
    employee: floorTo5sen(midpoint * EIS_RATE),
    employer: floorTo5sen(midpoint * EIS_RATE),
    employeeRate: EIS_RATE,
    employerRate: EIS_RATE,
    bracket: `${lower.toFixed(2)}–${upper.toFixed(2)}`,
  };
}

export const EPF_EMPLOYER_THRESHOLD_RM = EPF_EMPLOYER_THRESHOLD;