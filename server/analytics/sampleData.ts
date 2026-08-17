import { RawRecord } from "./types";

const regions = [
  ["North", "Alexandria"],
  ["Greater Cairo", "Cairo"],
  ["Delta", "Mansoura"],
  ["Canal", "Ismailia"],
] as const;
const products = [
  ["Orbit CRM", "Software", 289, 0.32],
  ["Beacon BI", "Software", 449, 0.35],
  ["FieldKit Pro", "Hardware", 179, 0.28],
  ["Pulse Support", "Services", 129, 0.45],
  ["Atlas Suite", "Software", 629, 0.38],
  ["Signal Sensor", "Hardware", 99, 0.25],
] as const;
const customers = ["Nile Retail Group", "Cedar Logistics", "Pyramids Health", "Delta Foods", "Vertex Labs", "Harbor Trading", "Canal Industries", "Meridian Hotels"];

export const sampleQuestions = [
  "What is our total revenue?",
  "Show monthly revenue for 2026.",
  "Which product category has the highest profit?",
  "Compare revenue between Cairo and Alexandria.",
  "What are our top 10 products by revenue?",
  "Is revenue increasing or decreasing over time?",
  "Why did revenue decrease in July?",
  "Which region contributes the most revenue?",
  "What is the average order value by sales channel?",
  "Which customers are most valuable by profit?",
  "How much revenue did we generate in Cairo?",
  "Which category has the strongest profit margin?",
  "Are there unusual sales patterns by month?",
  "How does July compare with June?",
  "What should management focus on next month?",
  "Show the distribution of order revenue.",
];

export function createSampleSalesRecords(): RawRecord[] {
  const records: RawRecord[] = [];
  let order = 10001;
  for (let month = 0; month < 8; month += 1) {
    for (let day = 1; day <= 28; day += 1) {
      const i = month * 28 + day;
      const [region, city] = regions[i % regions.length];
      const [product, category, basePrice, costRate] = products[(i * 3 + month) % products.length];
      const quantity = 1 + ((i * 7) % 8);
      const channel = i % 3 === 0 ? "Partner" : i % 3 === 1 ? "Direct" : "Online";
      const discount = i % 9 === 0 ? 0.12 : i % 5 === 0 ? 0.06 : 0;
      const julyFactor = month === 6 ? 0.76 : month === 5 ? 1.09 : 1;
      const categoryFactor = month === 6 && category === "Software" ? 0.82 : 1;
      const unitPrice = Math.round(basePrice * julyFactor * categoryFactor * 100) / 100;
      const revenue = Math.round(quantity * unitPrice * (1 - discount) * 100) / 100;
      const cost = Math.round(quantity * unitPrice * costRate * 100) / 100;
      records.push({
        order_id: `SO-${order++}`,
        order_date: `2026-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        customer: customers[(i * 5) % customers.length],
        region,
        city,
        product,
        category,
        quantity,
        unit_price: unitPrice,
        discount,
        revenue,
        cost,
        profit: Math.round((revenue - cost) * 100) / 100,
        sales_channel: channel,
      });
    }
  }
  return records;
}
