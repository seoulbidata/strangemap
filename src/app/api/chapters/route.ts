import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import type { RegionChapter } from "@/types/quest";

export async function GET() {
  const p = path.join(process.cwd(), "public/data/story-chapters.json");
  const chapters: RegionChapter[] = JSON.parse(readFileSync(p, "utf-8"));
  return NextResponse.json({ chapters });
}
