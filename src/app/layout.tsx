import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Teamville Montessori School | Ibadan", template: "%s | Teamville" },
  description: "Meet Teamville Montessori School in Ibadan and explore the school community, learning journey and pupil portal.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-NG"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
