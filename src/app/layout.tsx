import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: "Offerdesk",
  description: "Запросы менеджеров и офферы рекламодателей",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="font-sans">{children}</body>
    </html>
  );
}
