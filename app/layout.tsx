import './globals.css';

export const metadata = {
  title: {
    default: 'School Report Management System',
    template: '%s · School Report',
  },
  description: 'Manage students, marks, approvals and report cards in one place.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1220',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
