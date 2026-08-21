import './globals.css';

export const metadata = {
  title: '山十 行先予定表',
  description: '社内向け行先・行動予定管理システム',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ja"><body>{children}</body></html>;
}
