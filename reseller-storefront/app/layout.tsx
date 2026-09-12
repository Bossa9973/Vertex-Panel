import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Datacore — Your Networks. One Rapid Interface.',
  description: 'Say hello to Datacore v3.2. High-performance network orchestration, rapid edge infrastructure, and sub-millisecond cloud instances.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cabin:ital,wght@0,400..700;1,400..700&family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#06070a] text-slate-100 antialiased selection:bg-[#7b39fc]/40 selection:text-white min-h-screen overflow-x-hidden">
        {children}
      </body>
    </html>
  )
}
