import fs from "fs";
import path from "path";

const USAGE_FILE = path.join(process.cwd(), "ai-usage.json");
const DAILY_LIMIT = 50;

export interface UsageData {
  date: string; // YYYY-MM-DD
  count: number;
}

function getTodayString(): string {
  // Get date in KST (UTC+9)
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function getAIUsage(): UsageData {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const content = fs.readFileSync(USAGE_FILE, "utf8");
      const data = JSON.parse(content) as UsageData;

      const today = getTodayString();
      if (data.date === today) {
        return data;
      }
    }
  } catch (e) {
    console.error("[aiUsage] Error reading usage file, resetting:", e);
  }

  // Return fresh/reset data if file doesn't exist or is for a different day
  return { date: getTodayString(), count: 0 };
}

export function incrementAIUsage(): number {
  const data = getAIUsage();
  data.count += 1;

  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("[aiUsage] Error writing usage file:", e);
  }

  return data.count;
}

export function getDailyLimit(): number {
  return DAILY_LIMIT;
}
