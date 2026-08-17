import { RawRecord } from "./types";

export function detectSimpleOutliers(records: RawRecord[], numericColumn: string) {
  const values = records.map(record => Number(record[numericColumn])).filter(Number.isFinite);
  if (values.length < 6) return { count: 0, threshold: 0, message: "There are not enough records for anomaly detection." };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const standardDeviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  const threshold = mean + 2 * standardDeviation;
  const count = values.filter(value => value > threshold).length;
  return { count, threshold, message: count ? `${count} high-value records are more than two standard deviations above the average.` : "No high-value records exceed the two-standard-deviation threshold." };
}
