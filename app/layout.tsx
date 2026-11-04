import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { AppToaster } from "@/components/atoms/AppToaster";
import { NavigationProgress } from "@/components/atoms/NavigationProgress";
import { ServiceWorkerRegister } from "@/components/atoms/ServiceWorkerRegister";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["wdth", "opsz"], variable: "--font-display" });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: { default: "BeeDock", template: "%s · BeeDock" },
  description: "Gestão de pedidos, entradas e saídas para estamparias.",
  appleWebApp: { capable: true, title: "BeeDock", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e160c" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0a05" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} h-full antialiased`}>
      {/* extensões do navegador (ex.: ColorZilla) injetam atributos no body antes da hidratação */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <NavigationProgress />
        <ServiceWorkerRegister />
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
