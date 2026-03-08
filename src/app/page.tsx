import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Utensils, Shield, Zap, Download } from 'lucide-react';
import Link from 'next/link';

export default async function Home() {
  const session = await auth();
  
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Utensils className="h-6 w-6" />
            <span className="text-xl font-bold">OpenNutri</span>
          </div>
          <Link href="/login">
            <Button>Sign In</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Zero-Friction Nutrition Tracking
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
            Snap a photo, get instant nutrition insights. Powered by AI, 
            built for privacy. No data selling. Ever.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/login">
              <Button size="lg">Get Started Free</Button>
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-16">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="rounded-lg border bg-card p-6 text-center">
              <Zap className="mx-auto mb-4 h-12 w-12 text-yellow-500" />
              <h3 className="mb-2 text-xl font-semibold">Snap-to-Log</h3>
              <p className="text-muted-foreground">
                Take a photo of your meal. Our AI identifies foods and estimates 
                portions instantly.
              </p>
            </div>
            <div className="rounded-lg border bg-card p-6 text-center">
              <Shield className="mx-auto mb-4 h-12 w-12 text-green-500" />
              <h3 className="mb-2 text-xl font-semibold">Privacy First</h3>
              <p className="text-muted-foreground">
                Your data stays yours. End-to-end encryption options. 
                We never sell your information.
              </p>
            </div>
            <div className="rounded-lg border bg-card p-6 text-center">
              <Download className="mx-auto mb-4 h-12 w-12 text-blue-500" />
              <h3 className="mb-2 text-xl font-semibold">Full Data Export</h3>
              <p className="text-muted-foreground">
                Download all your nutrition data anytime. JSON or CSV format. 
                Complete ownership.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16">
          <div className="rounded-lg bg-muted p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold">
              Start Tracking Today
            </h2>
            <p className="mb-6 text-muted-foreground">
              Free tier includes 5 AI scans per day. Manual logging is unlimited.
            </p>
            <Link href="/login">
              <Button size="lg">Create Free Account</Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>OpenNutri - Built with privacy and sustainability in mind.</p>
        </div>
      </footer>
    </div>
  );
}
