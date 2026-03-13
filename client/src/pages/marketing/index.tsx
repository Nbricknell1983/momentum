import { useEffect, useRef, useState } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Zap, Target, TrendingUp, Users, BarChart3, Brain,
  CheckCircle2, ChevronRight, Play, Building2, Clock,
  Globe, Sparkles, X, Menu, Layers, Eye, Bell, Shield,
  Rocket, Phone, Mail,
} from 'lucide-react';

const G = {
  bg: '#08051a',
  nav: 'rgba(8,5,26,0.88)',
  card: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(139,92,246,0.16)',
  violet: '#7c3aed',
  violetGlow: 'rgba(124,58,237,0.35)',
  violet2: '#a855f7',
  text: '#f0e6ff',
  muted: '#9ca3af',
};

function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf: number;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const N = 70;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
      r: Math.random() * 1.6 + 0.4,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139,92,246,0.5)'; ctx.fill();
      });
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) {
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(139,92,246,${0.1 * (1 - d / 130)})`; ctx.lineWidth = 0.5; ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
}

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}>
      {children}
    </motion.div>
  );
}

function GlassCard({ children, className = '', glow = false, hover = true }: {
  children: React.ReactNode; className?: string; glow?: boolean; hover?: boolean;
}) {
  return (
    <motion.div
      whileHover={hover ? { y: -5, boxShadow: `0 8px 50px rgba(124,58,237,0.3)` } : undefined}
      transition={{ duration: 0.22 }}
      className={className}
      style={{
        background: G.card, border: `1px solid ${G.cardBorder}`,
        borderRadius: 20, backdropFilter: 'blur(16px)',
        boxShadow: glow ? `0 0 70px ${G.violetGlow}` : undefined,
      }}>
      {children}
    </motion.div>
  );
}

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);
  const navLinks = [
    { label: 'Features', id: 'features' },
    { label: 'How It Works', id: 'how' },
    { label: 'AI Engine', id: 'ai' },
    { label: "Who It's For", id: 'audience' },
    { label: 'Get Started', id: 'cta' },
  ];
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };
  return (
    <motion.nav
      initial={{ y: -56, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: scrolled ? G.nav : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(139,92,246,0.12)' : 'none',
        transition: 'background 0.3s, border-color 0.3s',
      }}
      className="flex items-center justify-between px-6 md:px-12 py-4">
      <img src="/momentum-logo.png" alt="Momentum" style={{ height: 32, filter: 'brightness(0) invert(1) drop-shadow(0 0 8px rgba(139,92,246,0.6))' }} />
      <div className="hidden md:flex items-center gap-8">
        {navLinks.map(l => (
          <button key={l.id} onClick={() => scrollTo(l.id)}
            className="text-sm font-medium transition-colors hover:text-violet-400"
            style={{ color: G.muted, background: 'none', border: 'none', cursor: 'pointer' }}>
            {l.label}
          </button>
        ))}
      </div>
      <motion.a href="mailto:nathan@battlescore.com.au" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
        className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${G.violet}, ${G.violet2})`, boxShadow: `0 0 22px ${G.violetGlow}` }}>
        Book a Demo
      </motion.a>
      <button className="md:hidden text-white" onClick={() => setMobileOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: G.nav, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${G.cardBorder}`, padding: '24px' }}
            className="flex flex-col gap-4">
            {navLinks.map(l => (
              <button key={l.id} onClick={() => scrollTo(l.id)}
                className="text-left text-base font-medium text-white hover:text-violet-400"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                {l.label}
              </button>
            ))}
            <a href="mailto:nathan@battlescore.com.au"
              className="text-center px-5 py-3 rounded-xl text-sm font-bold text-white mt-2"
              style={{ background: `linear-gradient(135deg, ${G.violet}, ${G.violet2})` }}>
              Book a Demo
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

function DashboardMockup() {
  const cards = [
    { title: 'Pipeline Overview', value: '$284,500', sub: '24 active deals', color: '#7c3aed', delay: 0.15 },
    { title: 'AI Opportunity', value: 'High potential', sub: 'Master Metals — 3 service gaps', color: '#a855f7', delay: 0.28 },
    { title: 'Follow-Up Tasks', value: '7 due today', sub: '2 overdue · 5 upcoming', color: '#06b6d4', delay: 0.4 },
    { title: 'Activity Feed', value: '12 actions today', sub: 'Calls · Emails · Meetings', color: '#10b981', delay: 0.52 },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 40, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      style={{ borderRadius: 20, border: '1px solid rgba(139,92,246,0.25)', backdropFilter: 'blur(20px)', background: 'rgba(124,58,237,0.07)', boxShadow: '0 0 80px rgba(124,58,237,0.2)', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(239,68,68,0.7)' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(234,179,8,0.7)' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(34,197,94,0.7)' }} />
        <div style={{ flex: 1, marginLeft: 8, height: 20, borderRadius: 6, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>momentum.battlescore.com.au</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {cards.map(c => (
          <motion.div key={c.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: c.delay, duration: 0.45 }}
            style={{ borderRadius: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.14)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.color }} />
              <span style={{ color: G.muted, fontSize: 10, fontWeight: 600 }}>{c.title}</span>
            </div>
            <p style={{ color: 'white', fontSize: 13, fontWeight: 700, margin: 0 }}>{c.value}</p>
            <p style={{ color: G.muted, fontSize: 10, margin: '3px 0 0' }}>{c.sub}</p>
          </motion.div>
        ))}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
        style={{ marginTop: 12, borderRadius: 12, padding: '10px 14px', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#a78bfa', animation: 'pulse 2s infinite' }} />
          <span style={{ color: '#c4b5fd', fontSize: 11, fontWeight: 600 }}>AI Sales Engine active</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>GPT-4o</span>
      </motion.div>
    </motion.div>
  );
}

function HeroSection() {
  const chips = ['AI Sales Engine', 'Pipeline Intelligence', 'Follow-Up Prompts', 'Client Growth Insights', 'CRM + Marketing Visibility'];
  return (
    <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', paddingTop: 120, paddingBottom: 80, position: 'relative', overflow: 'hidden' }}
      className="px-6 md:px-12">
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 75% 55% at 50% 38%, rgba(124,58,237,0.17) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 1280, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr', gap: 64, alignItems: 'center', position: 'relative', zIndex: 1 }}
        className="lg:grid-cols-2">
        <div>
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 100, background: 'rgba(124,58,237,0.14)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd', fontSize: 12, fontWeight: 600, marginBottom: 24 }}>
            <Sparkles size={12} /> AI-Powered Sales &amp; Growth Platform
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{ fontSize: 'clamp(44px, 6vw, 76px)', fontWeight: 900, lineHeight: 1.03, letterSpacing: '-0.02em', color: G.text, margin: '0 0 24px' }}>
            Stop<br />
            <span style={{ background: 'linear-gradient(135deg, #a855f7, #c084fc, #e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Guessing.
            </span><br />
            Start Growing.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.55 }}
            style={{ fontSize: 17, lineHeight: 1.7, color: G.muted, marginBottom: 16 }}>
            Momentum gives service businesses and sales teams the clarity, structure, and AI-powered insights they need to capture leads, manage pipeline, follow up consistently, and grow revenue.
          </motion.p>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.55 }}
            style={{ fontSize: 15, lineHeight: 1.7, color: 'rgba(156,163,175,0.78)', marginBottom: 36 }}>
            Most teams don't lose deals because of a lack of opportunity. They lose them because of missed follow-ups, unclear pipeline visibility, and no clear next action.{' '}
            <strong style={{ color: '#a78bfa' }}>Momentum fixes that.</strong>
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
            <motion.a href="mailto:nathan@battlescore.com.au" whileHover={{ scale: 1.04, boxShadow: '0 0 44px rgba(168,85,247,0.5)' }} whileTap={{ scale: 0.97 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 14, background: `linear-gradient(135deg, ${G.violet}, ${G.violet2})`, boxShadow: `0 0 26px ${G.violetGlow}`, color: 'white', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
              Book a Demo <ArrowRight size={16} />
            </motion.a>
            <motion.button onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 24px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: G.text, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
              <Play size={14} /> See How It Works
            </motion.button>
          </motion.div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {chips.map((c, i) => (
              <motion.span key={c} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.52 + i * 0.07 }}
                style={{ padding: '6px 14px', borderRadius: 100, fontSize: 12, fontWeight: 500, background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd' }}>
                {c}
              </motion.span>
            ))}
          </div>
        </div>
        <div className="hidden lg:block">
          <DashboardMockup />
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const problems = [
    { icon: <Clock size={20} />, title: 'Leads go cold', body: 'Follow-up is inconsistent. Opportunities disappear because no one acted in time.' },
    { icon: <Eye size={20} />, title: 'No clear next action', body: 'Sales reps waste time figuring out who to call and what to say — every single day.' },
    { icon: <BarChart3 size={20} />, title: 'Pipeline is invisible', body: "Managers can't see what's real. Is this deal progressing? When was the last touch?" },
    { icon: <TrendingUp size={20} />, title: "Clients aren't expanded", body: 'Existing clients are the biggest missed opportunity. Upsells rarely happen without a system.' },
  ];
  return (
    <section style={{ padding: '96px 0', position: 'relative' }} className="px-6 md:px-12">
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <Reveal className="text-center" style={{ marginBottom: 64 } as any}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a78bfa', marginBottom: 16 }}>The Problem</p>
          <h2 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 900, color: 'white', lineHeight: 1.1, margin: 0 }}>
            Most businesses don't have<br />a <span style={{ color: '#a855f7' }}>lead problem.</span>
          </h2>
          <p style={{ marginTop: 16, fontSize: 18, color: G.muted }}>They have a visibility and follow-up problem.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          {problems.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.1}>
              <GlassCard className="h-full" style={{ padding: 28 } as any}>
                <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,58,237,0.18)', color: '#a78bfa', marginBottom: 16 }}>{p.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '0 0 8px' }}>{p.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: G.muted, margin: 0 }}>{p.body}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function SolutionSection() {
  const modules = [
    { icon: <Brain size={16} />, label: 'Pre-Call Intelligence', color: '#7c3aed' },
    { icon: <Zap size={16} />, label: 'AI Sales Engine', color: '#a855f7' },
    { icon: <BarChart3 size={16} />, label: 'Pipeline Dashboard', color: '#06b6d4' },
    { icon: <TrendingUp size={16} />, label: 'Client Growth Engine', color: '#10b981' },
    { icon: <Globe size={16} />, label: 'Online Visibility Insights', color: '#f59e0b' },
    { icon: <Bell size={16} />, label: 'Momentum Planner', color: '#ec4899' },
  ];
  return (
    <section style={{ padding: '96px 0', background: 'rgba(124,58,237,0.04)' }} className="px-6 md:px-12">
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: 64, alignItems: 'center' }} className="lg:grid-cols-2">
        <div>
          <Reveal>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a78bfa', marginBottom: 16 }}>The Solution</p>
            <h2 style={{ fontSize: 'clamp(30px, 3.5vw, 48px)', fontWeight: 900, color: 'white', lineHeight: 1.12, margin: '0 0 24px' }}>
              Momentum turns scattered activity into <span style={{ color: '#a855f7' }}>structured growth.</span>
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.7, color: G.muted, margin: '0 0 16px' }}>
              In one platform, Momentum combines CRM, pipeline visibility, AI meeting preparation, follow-up automation, client growth intelligence, opportunity detection, and sales performance insights.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'rgba(156,163,175,0.78)', margin: 0 }}>
              Every activity, every lead, every client — visible, managed, and moving forward.
            </p>
          </Reveal>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {modules.map((m, i) => (
            <Reveal key={m.label} delay={i * 0.08}>
              <GlassCard style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 } as any}>
                <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${m.color}1f`, color: m.color, flexShrink: 0 }}>{m.icon}</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'white', flex: 1 }}>{m.label}</span>
                <ChevronRight size={14} style={{ color: G.muted }} />
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    { icon: <Target size={22} />, title: 'Know who to call and what to say.', body: 'Momentum analyses businesses and surfaces real opportunities before you even pick up the phone.', color: '#7c3aed' },
    { icon: <Layers size={22} />, title: 'Run a cleaner pipeline.', body: "Track deals, stages, next actions, and follow-ups without leads slipping through the cracks.", color: '#a855f7' },
    { icon: <Brain size={22} />, title: 'AI-powered sales preparation.', body: 'Momentum generates call insights, talking points, and follow-up emails automatically.', color: '#06b6d4' },
    { icon: <TrendingUp size={22} />, title: 'Grow existing clients.', body: 'Identify upsell opportunities, service gaps, and expansion potential inside your existing accounts.', color: '#10b981' },
    { icon: <BarChart3 size={22} />, title: 'See performance instantly.', body: 'Understand pipeline value, sales activity, and opportunity health in one dashboard.', color: '#f59e0b' },
    { icon: <Building2 size={22} />, title: 'Built for service businesses.', body: 'Momentum was designed for companies that rely on leads, follow-up, and customer relationships to grow.', color: '#ec4899' },
  ];
  return (
    <section id="features" style={{ padding: '96px 0' }} className="px-6 md:px-12">
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <Reveal className="text-center" style={{ marginBottom: 64 } as any}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a78bfa', marginBottom: 16 }}>Features</p>
          <h2 style={{ fontSize: 'clamp(30px, 3.5vw, 52px)', fontWeight: 900, color: 'white', lineHeight: 1.1, margin: 0 }}>
            Everything your team needs<br />to move <span style={{ color: '#a855f7' }}>faster.</span>
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.07}>
              <GlassCard style={{ padding: 28, height: '100%' } as any}>
                <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${f.color}1a`, color: f.color, marginBottom: 20 }}>{f.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', margin: '0 0 10px' }}>{f.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: G.muted, margin: 0 }}>{f.body}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    { n: '01', icon: <Target size={24} />, title: 'Capture the lead', body: 'Add leads instantly from any source. Territory-aware, organised from day one.' },
    { n: '02', icon: <Eye size={24} />, title: 'Understand the opportunity', body: 'AI analyses the business, surfaces gaps, and shows you the biggest revenue opportunity.' },
    { n: '03', icon: <Brain size={24} />, title: 'Use AI to prepare and follow up', body: 'Generate call scripts, objection responses, and personalised follow-up emails in seconds.' },
    { n: '04', icon: <Rocket size={24} />, title: 'Close, grow, repeat', body: 'Move deals forward, expand existing clients, and let the system keep you accountable.' },
  ];
  return (
    <section id="how" style={{ padding: '96px 0', background: 'rgba(124,58,237,0.04)' }} className="px-6 md:px-12">
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <Reveal className="text-center" style={{ marginBottom: 64 } as any}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a78bfa', marginBottom: 16 }}>How It Works</p>
          <h2 style={{ fontSize: 'clamp(30px, 3.5vw, 52px)', fontWeight: 900, color: 'white', lineHeight: 1.1, margin: 0 }}>
            Four steps.<br /><span style={{ color: '#a855f7' }}>Endless momentum.</span>
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <GlassCard style={{ padding: 28, height: '100%', position: 'relative', overflow: 'hidden' } as any}>
                <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 52, fontWeight: 900, color: 'rgba(124,58,237,0.1)', lineHeight: 1 }}>{s.n}</div>
                <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,58,237,0.18)', color: '#c4b5fd', marginBottom: 20 }}>{s.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '0 0 10px' }}>{s.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: G.muted, margin: 0 }}>{s.body}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AISection() {
  const insights = [
    { label: 'Business Snapshot', value: 'Local plumbing · 8 staff · Est. 2012 · Brisbane Northside', color: '#7c3aed' },
    { label: 'Strengths', value: 'Strong local reputation, high review volume, established customer base', color: '#10b981' },
    { label: 'Missed Opportunities', value: 'No Google Ads, weak social presence, no email nurture sequence', color: '#f59e0b' },
    { label: 'Biggest Revenue Opportunity', value: 'SEO + Google Ads package — est. $4,200/mo incremental', color: '#a855f7' },
    { label: 'Suggested Opening Line', value: '"We found 3 competitors outranking you for emergency plumbing Brisbane..."', color: '#06b6d4' },
    { label: 'Follow-Up Email Draft', value: 'Hi James, it was great connecting today. Based on what you shared about your goals...', color: '#ec4899' },
  ];
  return (
    <section id="ai" style={{ padding: '96px 0' }} className="px-6 md:px-12">
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: 64, alignItems: 'center' }} className="lg:grid-cols-2">
        <div>
          <Reveal>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a78bfa', marginBottom: 16 }}>AI Engine</p>
            <h2 style={{ fontSize: 'clamp(30px, 3.5vw, 48px)', fontWeight: 900, color: 'white', lineHeight: 1.12, margin: '0 0 24px' }}>
              Your AI Sales and <span style={{ color: '#a855f7' }}>Growth Engine.</span>
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.7, color: G.muted, margin: '0 0 24px' }}>
              Momentum is not just a CRM database. It actively helps your team prepare for calls, identify opportunities, generate follow-up messages, structure sales activity, and grow client accounts.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['Prepare for every call in 30 seconds', 'Auto-generate personalised follow-up emails', 'Identify the biggest revenue opportunity per prospect', 'Surface upsell opportunities in existing accounts', 'Transcribe and summarise every meeting automatically'].map((t, i) => (
                <Reveal key={t} delay={i * 0.06}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CheckCircle2 size={15} style={{ color: '#a78bfa', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: G.muted }}>{t}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.2}>
          <GlassCard glow hover={false} style={{ padding: 24 } as any}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa' }} className="animate-pulse" />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa' }}>AI Sales Engine · Live Insight</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {insights.map(ins => (
                <div key={ins.label} style={{ borderRadius: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.12)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: ins.color, margin: '0 0 6px' }}>{ins.label}</p>
                  <p style={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(255,255,255,0.78)', margin: 0 }}>{ins.value}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}

function AudienceSection() {
  const cards = [
    { icon: <Phone size={20} />, title: 'Sales Reps', body: 'Know exactly who to call, what to say, and what to do next — every day.' },
    { icon: <Users size={20} />, title: 'Sales Managers', body: 'Full pipeline visibility, team accountability, and performance metrics in one view.' },
    { icon: <Building2 size={20} />, title: 'Local Service Businesses', body: 'Manage leads and clients without complexity. Simple, fast, and built for your world.' },
    { icon: <Target size={20} />, title: 'Marketing Agencies', body: 'Sell smarter, retain longer, and grow accounts with AI-powered client intelligence.' },
    { icon: <Rocket size={20} />, title: 'Business Owners', body: 'See your pipeline, your team, and your growth — without being buried in spreadsheets.' },
    { icon: <Zap size={20} />, title: 'Growth Operators', body: 'Run systematic, data-driven lead generation with AI doing the heavy lifting.' },
  ];
  return (
    <section id="audience" style={{ padding: '96px 0', background: 'rgba(124,58,237,0.04)' }} className="px-6 md:px-12">
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <Reveal className="text-center" style={{ marginBottom: 64 } as any}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a78bfa', marginBottom: 16 }}>Who It's For</p>
          <h2 style={{ fontSize: 'clamp(30px, 3.5vw, 52px)', fontWeight: 900, color: 'white', lineHeight: 1.1, margin: 0 }}>
            Built for teams that need<br /><span style={{ color: '#a855f7' }}>momentum,</span> not more admin.
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 }}>
          {cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.07}>
              <GlassCard style={{ padding: 28, height: '100%' } as any}>
                <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,58,237,0.18)', color: '#a78bfa', marginBottom: 16 }}>{c.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '0 0 8px' }}>{c.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: G.muted, margin: 0 }}>{c.body}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function OutcomeSection() {
  const outcomes = [
    { icon: <Zap size={20} />, title: 'Faster lead response', body: 'Prioritised follow-up lists mean the right leads get contacted at the right time.' },
    { icon: <Brain size={20} />, title: 'Better meeting preparation', body: 'Walk into every call knowing the opportunity, the angles, and the best opening line.' },
    { icon: <Bell size={20} />, title: 'Consistent follow-up', body: 'Traffic light reminders and automated prompts keep every lead in motion.' },
    { icon: <Eye size={20} />, title: 'Clearer pipeline visibility', body: "Managers see exactly where every deal stands and what's needed to move it forward." },
    { icon: <TrendingUp size={20} />, title: 'More upsell opportunities', body: 'AI flags service gaps and expansion potential in your existing client base.' },
    { icon: <Shield size={20} />, title: 'Stronger accountability', body: 'Activity tracking and momentum scoring keep the whole team performing.' },
  ];
  return (
    <section style={{ padding: '96px 0' }} className="px-6 md:px-12">
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <Reveal className="text-center" style={{ marginBottom: 64 } as any}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a78bfa', marginBottom: 16 }}>Results</p>
          <h2 style={{ fontSize: 'clamp(30px, 3.5vw, 52px)', fontWeight: 900, color: 'white', lineHeight: 1.1, margin: 0 }}>
            What Momentum<br /><span style={{ color: '#a855f7' }}>Improves.</span>
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {outcomes.map((o, i) => (
            <Reveal key={o.title} delay={i * 0.07}>
              <GlassCard style={{ padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' } as any}>
                <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,58,237,0.18)', color: '#a78bfa', flexShrink: 0 }}>{o.icon}</div>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'white', margin: '0 0 6px' }}>{o.title}</h3>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: G.muted, margin: 0 }}>{o.body}</p>
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section id="cta" style={{ padding: '96px 0' }} className="px-6 md:px-12">
      <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <motion.div
            animate={{ boxShadow: ['0 0 40px rgba(124,58,237,0.28)', '0 0 90px rgba(168,85,247,0.42)', '0 0 40px rgba(124,58,237,0.28)'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ borderRadius: 28, padding: '64px 48px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(139,92,246,0.25)', backdropFilter: 'blur(20px)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a78bfa', marginBottom: 20 }}>Get Started</p>
            <h2 style={{ fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 900, color: 'white', lineHeight: 1.05, margin: '0 0 24px' }}>
              Stop Guessing.<br />
              <span style={{ background: 'linear-gradient(135deg, #a855f7, #c084fc, #e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Start Growing.
              </span>
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.7, color: G.muted, margin: '0 auto 40px', maxWidth: 540 }}>
              If your team needs better visibility, stronger follow-up, and smarter sales execution, Momentum gives you the structure and intelligence to move faster.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
              <motion.a href="mailto:nathan@battlescore.com.au" whileHover={{ scale: 1.05, boxShadow: '0 0 55px rgba(168,85,247,0.5)' }} whileTap={{ scale: 0.97 }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', borderRadius: 14, background: `linear-gradient(135deg, ${G.violet}, ${G.violet2})`, boxShadow: `0 0 32px ${G.violetGlow}`, color: 'white', fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
                Book a Demo <ArrowRight size={18} />
              </motion.a>
              <motion.a href="tel:0403338733" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: G.text, fontWeight: 600, fontSize: 16, textDecoration: 'none' }}>
                <Phone size={16} /> Talk to Us
              </motion.a>
            </div>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(139,92,246,0.12)', padding: '48px 0' }} className="px-6 md:px-12">
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 40, marginBottom: 40 }}>
          <div>
            <img src="/momentum-logo.png" alt="Momentum" style={{ height: 28, marginBottom: 12, filter: 'brightness(0) invert(1) drop-shadow(0 0 6px rgba(139,92,246,0.5))' }} />
            <p style={{ fontSize: 14, color: G.muted, margin: 0 }}>Turn activity into revenue.</p>
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a78bfa', marginBottom: 12 }}>Platform</p>
            {['Features', 'How It Works', 'AI Engine', "Who It's For"].map(l => (
              <button key={l} style={{ display: 'block', fontSize: 14, color: G.muted, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8, padding: 0 }}
                className="hover:text-violet-400 transition-colors">{l}</button>
            ))}
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a78bfa', marginBottom: 12 }}>Contact</p>
            <a href="mailto:nathan@battlescore.com.au" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: G.muted, textDecoration: 'none', marginBottom: 10 }} className="hover:text-violet-400">
              <Mail size={13} /> nathan@battlescore.com.au
            </a>
            <a href="tel:0403338733" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: G.muted, textDecoration: 'none', marginBottom: 10 }} className="hover:text-violet-400">
              <Phone size={13} /> 0403 338 733
            </a>
            <a href="https://battlescore.com.au" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: G.muted, textDecoration: 'none' }} className="hover:text-violet-400">
              <Globe size={13} /> battlescore.com.au
            </a>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(139,92,246,0.1)', paddingTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 12, color: 'rgba(156,163,175,0.45)', margin: 0 }}>© {new Date().getFullYear()} Momentum by BattleScore. All rights reserved.</p>
          <p style={{ fontSize: 12, color: 'rgba(156,163,175,0.45)', margin: 0 }}>momentum.battlescore.com.au</p>
        </div>
      </div>
    </footer>
  );
}

export default function MarketingHome() {
  return (
    <div style={{ background: G.bg, color: G.text, minHeight: '100vh', position: 'relative' }}>
      <ParticleBackground />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Navbar />
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <HowItWorksSection />
        <AISection />
        <AudienceSection />
        <OutcomeSection />
        <CTASection />
        <Footer />
      </div>
    </div>
  );
}
