import type { Metadata, Viewport } from "next";
import { Archivo, Atkinson_Hyperlegible } from "next/font/google";
import { AppToaster } from "@/components/atoms/AppToaster";
import { NavigationProgress } from "@/components/atoms/NavigationProgress";
import "./globals.css";

const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display" });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: { default: "BeeDock", template: "%s · BeeDock" },
  description: "Gestão de pedidos, entradas e saídas para estamparias.",
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
      <body className="flex min-h-full flex-col">
        <NavigationProgress />
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
