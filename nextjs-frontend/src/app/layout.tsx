import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AntdRegistry from "./AntdRegistry";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Goodie AI-GEO洞察平台-了解品牌在AI搜索中的可见度",
  description: "Goodie AI专注于GEO领域，依托AI技术，帮助企业实时掌握品牌和产品在各类AI搜索引擎平台的曝光与表现。融合AI对话监测、AI搜索优化、品牌与产品可见性提升、AI内容智能生成等核心能力，为企业量身定制GEO解决方案，助力数智化营销升级。",
  keywords: "Goodie AI,Goodie GEO,GEO排名查询,GEO工具,GEO优化",
  robots: "index,follow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
