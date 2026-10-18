import type { Metadata, Viewport } from 'next';
import { Manrope, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Manrope({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: 'variable', variable: '--font-body', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Greenlight — Take the job. Protect payroll.',
  description: 'Explore the cash, evidence, and payment changes behind a fundable job. A transparent LA Hacks demonstration with a tested financial engine and measured AI workflows.',
  applicationName: 'Greenlight',
  openGraph: { title: 'Greenlight', description: 'Take the job. Protect payroll.', type: 'website' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#087F5B' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</body></html>;
}
