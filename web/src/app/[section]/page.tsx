import Workspace from "@/components/workspace";
export function generateStaticParams() {
  return [
    "dashboard",
    "tasks",
    "courses",
    "projects",
    "planner",
    "materials",
    "ai-assistant",
    "settings",
    "login",
    "register",
  ].map((section) => ({ section }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return <Workspace initialPage={section} />;
}
