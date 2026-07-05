import { Poppins, Inter } from 'next/font/google';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-poppins',
});

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
});

export const metadata = {
  title: 'Uyym — Қазақстан студенттері бір жерде',
  description:
    'Uyym — верификацияланған студенттік платформа: басқа универдің студенттерімен таныс, материал бөліс, оқытушыларды бағала, ивенттерге қатыс.',
  metadataBase: new URL('https://uyym.kz'),
  openGraph: {
    title: 'Uyym — студенттер бір жерде',
    description: 'Қазақстанның верификацияланған студенттік платформасы',
    url: 'https://uyym.kz',
    siteName: 'Uyym',
    locale: 'kk_KZ',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="kk">
      <body className={`${poppins.variable} ${inter.variable}`}>{children}</body>
    </html>
  );
}
