import Link from 'next/link';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { admin } from '@/lib/campaign';
import Dashboard from './dashboard';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  await requireChatGPTUser('/admin');
  let authorized = false;
  try {
    await admin();
    authorized = true;
  } catch {
    authorized = false;
  }
  if (authorized) return <Dashboard />;
  return (
    <main className="wrap admin">
      <Link href="/">← Back to the T-shirt</Link>
      <h1>Admin setup</h1>
      <p>Sign in with the account configured as ADMIN_EMAIL to manage the campaign.</p>
      <p className="notice">The owner needs to set ADMIN_EMAIL before dashboard access is enabled. Public checkout remains securely paused until the treasury configuration is validated.</p>
      <p>No sponsor data is available without administrator access.</p>
    </main>
  );
}
