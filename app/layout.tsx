import type { Metadata, Viewport } from 'next';
import { Manrope, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Manrope({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: 'variable', variable: '--font-body', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://headroom-lahacks.vercel.app'),
  title: 'Headroom — Take the next job. Keep room for payday.',
  description: 'Can you take the next big job without borrowing or missing payroll? Headroom connects cash, contract evidence, and payment terms to show a supported path forward.',
  applicationName: 'Headroom',
  openGraph: {
    title: 'Headroom — Take the next job. Keep room for payday.',
    description: 'Evidence-backed decisions for small business.',
    type: 'website',
    images: [{ url: '/brand/headroom-banner.png', width: 1672, height: 941, alt: 'Headroom: a mint cash path clears the payroll threshold and opens room to grow.' }],
  },
  twitter: { card: 'summary_large_image', title: 'Headroom', description: 'Take the next job. Keep room for payday.', images: ['/brand/headroom-banner.png'] },
  icons: { icon: '/brand/headroom-mark.png', apple: '/brand/headroom-mark.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#087F5B' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</body></html>;
}
