import { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Modern Todo Application",
  description: "Manage Your Personal Todos With Ease, Easily Share Them Across Contacts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={"w-full"}>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
