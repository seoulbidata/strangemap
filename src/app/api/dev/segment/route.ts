/**
 * dev 전용 — 경로 에디터의 세그먼트 라이브러리 저장 API.
 * public/courses/segments/<A>__<B>.json (areaName 사전순 쌍 키)에 write 한다.
 * points는 항상 "키의 앞 이름 → 뒤 이름" 방향으로 정규화해 저장한다.
 * production에서는 404를 반환한다.
 */
import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeName, segmentKey } from "@/lib/segmentLibrary";

type StopPayload = { name: string; lat: number; lng: number };

function isValidStop(s: unknown): s is StopPayload {
  const v = s as StopPayload;
  return (
    typeof v?.name === "string" &&
    v.name.trim().length > 0 &&
    Number.isFinite(v?.lat) &&
    Number.isFinite(v?.lng)
  );
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    a: StopPayload;
    b: StopPayload;
    mode: "walk" | "transit";
    points: { lat: number; lng: number }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ["JSON body 파싱 실패"] }, { status: 400 });
  }

  const errors: string[] = [];
  if (!isValidStop(body?.a) || !isValidStop(body?.b)) errors.push("a/b 스톱 정보(name, lat, lng)가 필요합니다");
  if (body?.mode !== "walk" && body?.mode !== "transit") errors.push(`mode "${body?.mode}" 무효`);
  if (
    !Array.isArray(body?.points) ||
    body.points.length < 2 ||
    body.points.some((p) => !Number.isFinite(p?.lat) || !Number.isFinite(p?.lng))
  ) {
    errors.push("points는 유한 좌표 2개 이상이어야 합니다");
  }
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const key = segmentKey(body.a.name, body.b.name);
  // segmentKey가 파일명 위험 문자를 제거하지만 방어적으로 한 번 더 확인
  if (key.includes("/") || key.includes("\\") || key.includes("..")) {
    return NextResponse.json({ ok: false, errors: [`무효한 키: ${key}`] }, { status: 400 });
  }

  // 키는 사전순 쌍 — a가 키의 뒤 이름이면 reverse해서 "앞 이름 → 뒤 이름" 방향으로 통일
  const aFirst = key.split("__")[0] === sanitizeName(body.a.name);
  const points = (aFirst ? body.points : [...body.points].reverse()).map((p) => ({
    lat: p.lat,
    lng: p.lng,
  }));

  const dir = join(process.cwd(), "public", "courses", "segments");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${key}.json`), JSON.stringify({ mode: body.mode, points }));

  return NextResponse.json({ ok: true, key, path: `public/courses/segments/${key}.json` });
}
