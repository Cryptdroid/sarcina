import type { Metadata } from "next";
import { Syne, DM_Sans, Geist } from "next/font/google";
import "./globals.css";
import { MainLayout } from "../components/layout/MainLayout";
import { ThemeProvider } from "../components/ThemeProvider";
import { cn } from "@/lib/utils";
import { FocusProvider } from "@/lib/FocusContext";
import { HabitProvider } from "@/lib/HabitContext";

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FlowState - Productivity Reimagined",
  description: "A smart task manager, focus timer, and daily planner with an ambient dark design.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full antialiased", syne.variable, dmSans.variable, geist.variable)}
    >
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground overflow-hidden transition-colors duration-300">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <FocusProvider>
            <HabitProvider>
              <MainLayout>{children}</MainLayout>
            </HabitProvider>
          </FocusProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
