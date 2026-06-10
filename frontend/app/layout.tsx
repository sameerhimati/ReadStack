import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReadStack — your backlog, learned",
  description:
    "Turn a backlog of saved links into a topic map and grounded bite-size lessons. Right model, right GPU, per task.",
};

// No-FOUC theme: set the .dark class before first paint from localStorage,
// falling back to the OS preference. Runs synchronously in <head>.
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
