import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobFray | Local jobs, quick help, and free stuff",
  description:
    "Post local jobs, find quick work, and browse free stuff by ZIP code.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}