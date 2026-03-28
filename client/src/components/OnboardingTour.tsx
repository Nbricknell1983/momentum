import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { X, ChevronRight, ChevronLeft, Sparkles, Kanban, Users, Calendar, Inbox, Mic, Brain, LayoutDashboard } from 'lucide-react';

// ─── Tour Steps ──────────────────────────────────────────────────────────────

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: typeof Sparkles;
  targetSelector?: string;     // CSS selector to highlight
  navigateTo?: string;         // Auto-navigate to this page
  position: 'center' | 'bottom-left' | 'bottom-right' | 'top-center';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Momentum',
    description: "Momentum is your AI-powered sales growth engine. It finds opportunities, manages your pipeline, and makes sure nothing falls through the cracks. Let's take a quick tour.",
    icon: Sparkles,
    position: 'center',
  },
  {
    id: 'dashboard',
    title: 'Your Dashboard',
    description: 'This is your command centre. See your pipeline health, daily targets, momentum score, and what needs attention — all at a glance.',
    icon: LayoutDashboard,
    navigateTo: '/dashboard',
    targetSelector: '[data-testid="link-nav-dashboard"]',
    position: 'bottom-left',
  },
  {
    id: 'pipeline',
    title: 'Your Pipeline',
    description: 'Drag leads through your sales stages. Every lead gets a momentum score so you know who to focus on and who needs a nudge.',
    icon: Kanban,
    navigateTo: '/pipeline',
    targetSelector: '[data-testid="link-nav-pipeline"]',
    position: 'bottom-left',
  },
  {
    id: 'clients',
    title: 'Client Management',
    description: "Once a lead converts, they become a client here. Track their health, spot churn risk early, and find upsell opportunities before they come to you.",
    icon: Users,
    navigateTo: '/clients',
    targetSelector: '[data-testid="link-nav-clients"]',
    position: 'bottom-left',
  },
  {
    id: 'daily-plan',
    title: 'Your Daily Plan',
    description: 'Every morning, AI builds your schedule — who to call, what to follow up, and which deals need attention. Just work the plan.',
    icon: Calendar,
    navigateTo: '/daily-plan',
    targetSelector: '[data-testid="link-nav-daily-plan"]',
    position: 'bottom-left',
  },
  {
    id: 'my-work',
    title: 'My Work',
    description: "Tasks and actions assigned to you land here. The red badge tells you how many items need attention. Think of it as your inbox for sales actions.",
    icon: Inbox,
    targetSelector: '[data-testid="link-nav-my-work"]',
    position: 'bottom-left',
  },
  {
    id: 'erica',
    title: 'Meet Erica',
    description: "Erica is your AI voice agent. She calls leads, handles objections, books appointments, and follows up — so you can focus on closing deals instead of chasing them.",
    icon: Mic,
    position: 'center',
  },
  {
    id: 'ai-agents',
    title: 'AI Does the Heavy Lifting',
    description: "Behind the scenes, AI agents research prospects, generate strategies, optimise your clients' online presence, and surface the best next action for every opportunity.",
    icon: Brain,
    position: 'center',
  },
  {
    id: 'done',
    title: "You're Ready",
    description: "That's the essentials. Start with your Dashboard and Daily Plan — they'll guide your day. The more you use Momentum, the smarter it gets. Let's go.",
    icon: Sparkles,
    navigateTo: '/dashboard',
    position: 'center',
  },
];

// ─── Storage ─────────────────────────────────────────────────────────────────

const TOUR_STORAGE_KEY = 'momentum_onboarding_completed';

function hasTourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function markTourCompleted(): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  } catch { /* */ }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [, setLocation] = useLocation();

  // Auto-start for first-time users (slight delay for page to render)
  useEffect(() => {
    if (!hasTourCompleted()) {
      const timer = setTimeout(() => setActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const currentStep = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;
  const progress = ((step + 1) / TOUR_STEPS.length) * 100;

  const goNext = useCallback(() => {
    if (isLast) {
      markTourCompleted();
      setActive(false);
      if (currentStep.navigateTo) setLocation(currentStep.navigateTo);
      return;
    }
    const nextStep = TOUR_STEPS[step + 1];
    if (nextStep.navigateTo) setLocation(nextStep.navigateTo);
    setStep(s => s + 1);
  }, [step, isLast, currentStep, setLocation]);

  const goBack = useCallback(() => {
    if (!isFirst) {
      const prevStep = TOUR_STEPS[step - 1];
      if (prevStep.navigateTo) setLocation(prevStep.navigateTo);
      setStep(s => s - 1);
    }
  }, [step, isFirst, setLocation]);

  const skip = useCallback(() => {
    markTourCompleted();
    setActive(false);
  }, []);

  if (!active || !currentStep) return null;

  const Icon = currentStep.icon;
  const isCenter = currentStep.position === 'center';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] transition-opacity duration-300"
        onClick={skip}
      />

      {/* Tour card */}
      <div
        className={`fixed z-[9999] transition-all duration-300 ${
          isCenter
            ? 'inset-0 flex items-center justify-center p-4'
            : currentStep.position === 'bottom-left'
            ? 'bottom-6 left-72 right-6 flex justify-start'
            : currentStep.position === 'bottom-right'
            ? 'bottom-6 right-6'
            : 'top-20 left-1/2 -translate-x-1/2'
        }`}
      >
        <div className={`bg-background border border-border rounded-xl shadow-2xl ${isCenter ? 'max-w-md w-full' : 'max-w-sm w-full'} overflow-hidden`}>
          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="p-6">
            {/* Icon + step counter */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">{currentStep.title}</h3>
                  <span className="text-xs text-muted-foreground">{step + 1} of {TOUR_STEPS.length}</span>
                </div>
              </div>
              <button
                onClick={skip}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label="Skip tour"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {currentStep.description}
            </p>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <div>
                {!isFirst && (
                  <Button variant="ghost" size="sm" onClick={goBack} className="gap-1">
                    <ChevronLeft className="h-3.5 w-3.5" /> Back
                  </Button>
                )}
                {isFirst && (
                  <Button variant="ghost" size="sm" onClick={skip} className="text-muted-foreground">
                    Skip tour
                  </Button>
                )}
              </div>
              <Button size="sm" onClick={goNext} className="gap-1">
                {isLast ? "Get Started" : "Next"} {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Restart tour (callable from settings) ───────────────────────────────────

export function resetOnboardingTour(): void {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch { /* */ }
}
