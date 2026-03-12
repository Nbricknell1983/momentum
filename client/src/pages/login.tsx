import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, ShieldCheck, ArrowLeft } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; opacity: number; hue: number; phase: number; speed: number;
}

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);

  const initParticles = useCallback((w: number, h: number) => {
    const count = Math.min(Math.floor((w * h) / 10000), 120);
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 2.5 + 0.5, opacity: Math.random() * 0.6 + 0.2,
      hue: Math.random() * 60 + 240, phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.3 + 0.1,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const w = canvas.width; const h = canvas.height;
      timeRef.current += 0.008;
      const t = timeRef.current;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#0d0520'); grad.addColorStop(0.4, '#130834');
      grad.addColorStop(0.8, '#1e0d52'); grad.addColorStop(1, '#0a0318');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(0, h);
        const waveY = h * (0.3 + i * 0.18); const amp = 60 + i * 20; const freq = 0.003 + i * 0.001;
        for (let x = 0; x <= w; x += 4) {
          const y = waveY + Math.sin(x * freq + t + i * 1.2) * amp + Math.sin(x * freq * 2 - t * 0.7) * (amp * 0.4);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath();
        const wg = ctx.createLinearGradient(0, waveY - amp, 0, waveY + amp);
        const alpha = 0.04 - i * 0.006;
        wg.addColorStop(0, `rgba(139, 92, 246, ${alpha})`); wg.addColorStop(1, `rgba(109, 40, 217, 0)`);
        ctx.fillStyle = wg; ctx.fill();
      }
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.vy += Math.sin(p.phase + t * p.speed) * 0.008;
        p.vx += Math.cos(p.phase * 0.7 + t * p.speed * 0.6) * 0.005;
        p.vx *= 0.99; p.vy *= 0.99;
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]; const dx = p.x - q.x; const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `hsla(${(p.hue + q.hue) / 2}, 80%, 70%, ${(1 - dist / 130) * 0.25})`;
            ctx.lineWidth = 0.8; ctx.stroke();
          }
        }
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        glow.addColorStop(0, `hsla(${p.hue}, 90%, 80%, ${p.opacity * 0.4})`); glow.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 85%, ${p.opacity})`; ctx.fill();
      }
      animFrameRef.current = requestAnimationFrame(draw);
    };
    animFrameRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animFrameRef.current); window.removeEventListener('resize', resize); };
  }, [initParticles]);

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ zIndex: 0 }} />;
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, user, loading } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // 2FA state
  const [twoFAStep, setTwoFAStep] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAUid, setTwoFAUid] = useState('');
  const [twoFAOrgId, setTwoFAOrgId] = useState('');
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const pendingTwoFA = useRef(false);

  useEffect(() => {
    if (!loading && user && !pendingTwoFA.current) {
      setLocation('/dashboard');
    }
  }, [loading, user, setLocation]);

  if (loading || (user && !twoFAStep)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0d0520]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
      setLocation('/dashboard');
    } catch (error: any) {
      toast({ title: 'Sign-in failed', description: error.message || 'Could not sign in with Google', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEmailSignIn() {
    if (!email || !password) {
      toast({ title: 'Missing fields', description: 'Please enter your email and password', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      pendingTwoFA.current = true;
      await signInWithEmail(email, password);

      // Check if user has 2FA enabled
      const auth = (await import('firebase/auth')).getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Auth failed');

      // Resolve orgId from Firestore
      const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
      const orgId = userSnap.data()?.orgId as string | undefined;

      if (orgId) {
        const statusRes = await fetch('/api/2fa/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.uid, orgId }),
        });
        const { enabled } = await statusRes.json();

        if (enabled) {
          setTwoFAUid(currentUser.uid);
          setTwoFAOrgId(orgId);
          setTwoFAStep(true);
          setIsSubmitting(false);
          return;
        }
      }

      // No 2FA — proceed normally
      pendingTwoFA.current = false;
      setLocation('/dashboard');
    } catch (error: any) {
      pendingTwoFA.current = false;
      toast({ title: 'Sign-in failed', description: error.message || 'Invalid email or password', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify2FA() {
    const code = twoFACode.replace(/\s/g, '');
    if (code.length !== 6) {
      toast({ title: 'Enter your 6-digit code', description: 'Open your authenticator app to get the code', variant: 'destructive' });
      return;
    }
    setIsVerifying2FA(true);
    try {
      const res = await fetch('/api/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: twoFAUid, orgId: twoFAOrgId, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code');
      pendingTwoFA.current = false;
      setLocation('/dashboard');
    } catch (error: any) {
      toast({ title: 'Incorrect code', description: error.message || 'The code is incorrect or expired', variant: 'destructive' });
    } finally {
      setIsVerifying2FA(false);
    }
  }

  async function handleEmailSignUp() {
    if (!email || !password) {
      toast({ title: 'Missing fields', description: 'Please enter your email and password', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Weak password', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      await signUpWithEmail(email, password);
      setLocation('/dashboard');
    } catch (error: any) {
      toast({ title: 'Sign-up failed', description: error.message || 'Could not create account', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!resetEmail) {
      toast({ title: 'Email required', description: 'Please enter your email address', variant: 'destructive' });
      return;
    }
    setIsResetting(true);
    try {
      await resetPassword(resetEmail);
      toast({ title: 'Reset email sent', description: 'Check your inbox for a password reset link' });
      setForgotPasswordOpen(false);
      setResetEmail('');
    } catch (error: any) {
      toast({ title: 'Reset failed', description: error.message || 'Could not send reset email', variant: 'destructive' });
    } finally {
      setIsResetting(false);
    }
  }

  const glassCard = {
    zIndex: 10,
    background: 'rgba(15, 8, 40, 0.75)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(139, 92, 246, 0.25)',
    boxShadow: '0 0 60px rgba(109, 40, 217, 0.2), 0 25px 50px rgba(0,0,0,0.5)',
  } as React.CSSProperties;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden">
      <ParticleCanvas />

      {/* 2FA verification step */}
      {twoFAStep ? (
        <div className="relative w-full max-w-sm rounded-2xl p-8 shadow-2xl" style={glassCard}>
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-violet-600/20 border border-violet-500/30 mb-4">
              <ShieldCheck className="h-7 w-7 text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Two-factor authentication</h2>
            <p className="text-sm text-violet-200/60">Enter the 6-digit code from your authenticator app</p>
          </div>

          <div className="space-y-4">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="000 000"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify2FA()}
              maxLength={6}
              autoFocus
              data-testid="input-2fa-code"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-violet-500 focus:ring-violet-500/20 rounded-xl text-center text-2xl tracking-[0.5em] font-mono"
            />
            <button
              type="button"
              onClick={handleVerify2FA}
              disabled={isVerifying2FA || twoFACode.length !== 6}
              data-testid="button-verify-2fa"
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-lg shadow-violet-900/40 disabled:opacity-50"
            >
              {isVerifying2FA ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Verify
            </button>
            <button
              type="button"
              onClick={async () => {
                const { getAuth, signOut } = await import('firebase/auth');
                await signOut(getAuth());
                pendingTwoFA.current = false;
                setTwoFAStep(false);
                setTwoFACode('');
              }}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-violet-300/50 hover:text-violet-300 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to sign in
            </button>
          </div>
        </div>
      ) : (
        /* Main login card */
        <div className="relative w-full max-w-md rounded-2xl p-8 shadow-2xl" style={glassCard}>
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-lg bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white" stroke="currentColor" strokeWidth="2.2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-xl font-bold text-white tracking-tight">Momentum</span>
            </div>
            <p className="text-sm text-violet-200/60">Sign in to access your CRM dashboard</p>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            data-testid="button-google-signin"
            className="w-full flex items-center justify-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium text-white border border-white/10 bg-white/5 hover:bg-white/10 transition-colors mb-5 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SiGoogle className="h-4 w-4" />}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-violet-300/50 uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-white/5 border border-white/10 rounded-xl mb-5">
              <TabsTrigger value="signin" data-testid="tab-signin"
                className="rounded-lg data-[state=active]:bg-violet-600 data-[state=active]:text-white text-violet-300/70">
                Sign In
              </TabsTrigger>
              <TabsTrigger value="signup" data-testid="tab-signup"
                className="rounded-lg data-[state=active]:bg-violet-600 data-[state=active]:text-white text-violet-300/70">
                Sign Up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-4 mt-0">
              <div className="space-y-1.5">
                <Label htmlFor="signin-email" className="text-violet-200/80 text-xs uppercase tracking-wide">Email</Label>
                <Input id="signin-email" type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleEmailSignIn()}
                  data-testid="input-signin-email"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-violet-500 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signin-password" className="text-violet-200/80 text-xs uppercase tracking-wide">Password</Label>
                <Input id="signin-password" type="password" placeholder="Enter your password" value={password}
                  onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleEmailSignIn()}
                  data-testid="input-signin-password"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-violet-500 rounded-xl" />
              </div>
              <button type="button" onClick={handleEmailSignIn} disabled={isSubmitting} data-testid="button-signin"
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-lg shadow-violet-900/40 disabled:opacity-50">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Sign In
              </button>
              <button type="button"
                className="w-full text-xs text-violet-300/50 hover:text-violet-300 transition-colors underline-offset-2 hover:underline"
                onClick={() => { setResetEmail(email); setForgotPasswordOpen(true); }}
                data-testid="button-forgot-password">
                Forgot password?
              </button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4 mt-0">
              <div className="space-y-1.5">
                <Label htmlFor="signup-email" className="text-violet-200/80 text-xs uppercase tracking-wide">Email</Label>
                <Input id="signup-email" type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} data-testid="input-signup-email"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-violet-500 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-password" className="text-violet-200/80 text-xs uppercase tracking-wide">Password</Label>
                <Input id="signup-password" type="password" placeholder="Create a password (min 6 chars)" value={password}
                  onChange={(e) => setPassword(e.target.value)} data-testid="input-signup-password"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-violet-500 rounded-xl" />
              </div>
              <button type="button" onClick={handleEmailSignUp} disabled={isSubmitting} data-testid="button-signup"
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-lg shadow-violet-900/40 disabled:opacity-50">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Create Account
              </button>
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-forgot-password">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>Enter your email and we'll send a reset link.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input id="reset-email" type="email" placeholder="you@example.com" value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)} data-testid="input-reset-email" />
            </div>
            <Button className="w-full gap-2" onClick={handleForgotPassword} disabled={isResetting} data-testid="button-send-reset">
              {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send Reset Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
