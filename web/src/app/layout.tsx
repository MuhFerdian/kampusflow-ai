import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "KampusFlow AI — Your academic workspace",
  description:
    "A focused workspace for courses, projects, tasks, and academic deadlines.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
