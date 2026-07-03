/**
 * dev 전용 — 큐레이션 경로 에디터 진입점.
 * production 빌드에서는 404.
 */
import { notFound } from "next/navigation";
import RouteEditor from "./RouteEditor";

export default function RouteEditorPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <RouteEditor />;
}
