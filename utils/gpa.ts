import type { GpaCourseEntry } from '../types';

export interface GradeResult {
  total: number;
  letter: string;
  points: number;
}

export function evaluateCourseGrade(entry: GpaCourseEntry): GradeResult {
  const total = Math.min(
    100,
    Math.max(0, Number(entry.coursework) + Number(entry.midterm) + Number(entry.finalExam))
  );

  if (total >= 90) return { total, letter: 'A+', points: 4.0 };
  if (total >= 85) return { total, letter: 'A', points: 3.7 };
  if (total >= 80) return { total, letter: 'B+', points: 3.3 };
  if (total >= 75) return { total, letter: 'B', points: 3.0 };
  if (total >= 70) return { total, letter: 'C+', points: 2.7 };
  if (total >= 65) return { total, letter: 'C', points: 2.4 };
  if (total >= 60) return { total, letter: 'D+', points: 2.2 };
  if (total >= 50) return { total, letter: 'D', points: 2.0 };
  return { total, letter: 'F', points: 0.0 };
}

export function calculateSemesterGpa(entries: GpaCourseEntry[]): {
  gpa: number;
  gpaCredits: number;
  totalCredits: number;
  passedCredits: number;
  averagePercentage: number;
  includedCount: number;
  excludedCount: number;
} {
  if (entries.length === 0) {
    return {
      gpa: 0,
      gpaCredits: 0,
      totalCredits: 0,
      passedCredits: 0,
      averagePercentage: 0,
      includedCount: 0,
      excludedCount: 0,
    };
  }

  let weightedPoints = 0;
  let gpaCredits = 0;
  let totalCredits = 0;
  let passedCredits = 0;
  let gpaScoreSum = 0;
  let includedCount = 0;
  let excludedCount = 0;

  for (const item of entries) {
    const credits = Math.max(0, Number(item.credits) || 0);
    const evaluated = evaluateCourseGrade(item);
    const isIncluded = item.includeInGpa !== false;

    totalCredits += credits;
    if (evaluated.total >= 50) {
      passedCredits += credits;
    }

    if (isIncluded) {
      weightedPoints += evaluated.points * credits;
      gpaCredits += credits;
      gpaScoreSum += evaluated.total;
      includedCount += 1;
    } else {
      excludedCount += 1;
    }
  }

  const gpa = gpaCredits > 0 ? weightedPoints / gpaCredits : 0;
  const averagePercentage = includedCount > 0 ? gpaScoreSum / includedCount : 0;

  return {
    gpa: Number(gpa.toFixed(2)),
    gpaCredits,
    totalCredits,
    passedCredits,
    averagePercentage: Number(averagePercentage.toFixed(1)),
    includedCount,
    excludedCount,
  };
}

export function formatYearLabel(year: number): string {
  switch (year) {
    case 1:
      return 'الفرقة الأولى';
    case 2:
      return 'الفرقة الثانية';
    case 3:
      return 'الفرقة الثالثة';
    case 4:
      return 'الفرقة الرابعة';
    default:
      return 'جميع الدفعات';
  }
}
