import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "AFTERBELL | AI Shadow Market",
  description: "An autonomous risk layer for tokenized U.S. equities."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
