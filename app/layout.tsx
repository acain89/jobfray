import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteShell";
import { siteOrigin } from "@/lib/site";
import "./globals.css";
export const metadata: Metadata = {
    manifest: "/manifest.webmanifest",
    metadataBase: new URL(siteOrigin),
    title: {
        default: "JobFray | Your business, connected",
        template: "%s | JobFray",
    },
    description: "Free business websites, local discovery, rentals, services, quotes and reservations.",
    robots: { index: false, follow: false },
};
export default function RootLayout({ children }: {
    children: ReactNode;
}) {
    return (<html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="container main-content">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>);
}
