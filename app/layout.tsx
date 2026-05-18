import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://www.jobfray.com",
  ),

  title:
    "JobFray | Local jobs, quick help, and free stuff",

  description:
    "Post local jobs, find quick work, and browse free stuff by ZIP code.",

  openGraph: {
    title:
      "JobFray | Local jobs, quick help, and free stuff",

    description:
      "Post local jobs, find quick work, and browse free stuff by ZIP code.",

    url: "https://www.jobfray.com",

    siteName: "JobFray",

    type: "website",
  },

  robots: {
    index: true,
    follow: true,
  },
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