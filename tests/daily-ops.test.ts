import test from "node:test";
import assert from "node:assert/strict";
import { hoursBetween, computeWorkedHours, attendanceRollup, canEditDailyLog, dailyLogIsConfirmed, isValidAttendanceStatus } from "../lib/daily-ops.ts";

const shift = { start: "07:00", end: "16:00" };

test("§S: default crew shift hours (07:00–16:00 = 9h)", () => {
  assert.equal(hoursBetween("07:00", "16:00"), 9);
  assert.equal(hoursBetween("07:30", "16:00"), 8.5);
  assert.equal(hoursBetween("16:00", "07:00"), 0, "never negative");
  assert.equal(hoursBetween("", "16:00"), 0, "invalid → 0");
});

test("§T: a present crew member gets the full default shift with no per-person entry", () => {
  assert.equal(computeWorkedHours({ status: "Present" }, shift), 9);
});

test("§U: late arrival — individual start overrides the shift start", () => {
  assert.equal(computeWorkedHours({ status: "Late", startTime: "09:00" }, shift), 7);
});

test("§V: left early — individual end overrides the shift end", () => {
  assert.equal(computeWorkedHours({ status: "Left early", endTime: "12:00" }, shift), 5);
});

test("§W: an absent employee has zero worked hours", () => {
  assert.equal(computeWorkedHours({ status: "Absent", startTime: "07:00", endTime: "16:00" }, shift), 0);
});

test("§X/Y: per-person hours and the day's total man-hours + present/absent counts", () => {
  const entries = [
    { status: "Present", workedHours: computeWorkedHours({ status: "Present" }, shift) },       // 9
    { status: "Late", workedHours: computeWorkedHours({ status: "Late", startTime: "09:00" }, shift) }, // 7
    { status: "Left early", workedHours: computeWorkedHours({ status: "Left early", endTime: "12:00" }, shift) }, // 5
    { status: "Absent", workedHours: computeWorkedHours({ status: "Absent" }, shift) },          // 0
  ];
  const roll = attendanceRollup(entries);
  assert.equal(roll.present, 3);
  assert.equal(roll.absent, 1);
  assert.equal(roll.manHours, 21, "9 + 7 + 5 + 0");
  assert.ok(isValidAttendanceStatus("Present") && !isValidAttendanceStatus("Vacation"));
});

test("daily-log edit gate: draft editable, confirmed immutable", () => {
  assert.equal(canEditDailyLog("Draft"), true);
  assert.equal(canEditDailyLog("Confirmed"), false);
  assert.equal(dailyLogIsConfirmed("Confirmed"), true);
  assert.equal(dailyLogIsConfirmed("Draft"), false);
});
