import type { MatrixCellData } from "@/components/primitives/ComparisonMatrix";
import type { AccentKey } from "@/content/schema";

export const matrixData = {
  rowHeaders: ["single\nagent", "multi-\nagent"] as [string, string],
  rowAccents: ["cyan", "amber"] as [AccentKey, AccentKey],
  colHeaders: ["sequential tasks", "parallel tasks"] as [string, string],
  tl: {
    value: "28 / 28",
    delta: "wins · McEntire",
    accent: "cyan",
  } satisfies MatrixCellData,
  tr: {
    value: "100%",
    delta: "baseline",
    accent: "cyan",
  } satisfies MatrixCellData,
  bl: {
    value: "−55%",
    delta: "−39 to −70% · Google",
    accent: "burnt",
  } satisfies MatrixCellData,
  br: {
    value: "+81%",
    delta: "parallel gain · Google",
    accent: "amber",
  } satisfies MatrixCellData,
};
