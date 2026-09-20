import { redirect } from 'next/navigation';

/** The workbench opens on the dashboard; `/` is just an entry point. */
export default function HomePage() {
  redirect('/dashboard');
}
