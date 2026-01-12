import MarketingLayout from '@/components/MarketingLayout';
import SEOHead, { localBusinessSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'wouter';
import { 
  ChevronRight, Target, TrendingUp, Users, Zap, 
  BarChart3, Lightbulb, Award, CheckCircle2, ArrowRight,
  Building2, Briefcase, LineChart, Clock
} from 'lucide-react';

const services = [
  {
    icon: TrendingUp,
    title: 'Business Growth Strategy',
    description: 'Data-driven strategies to accelerate your business growth and market position in Brisbane and beyond.',
  },
  {
    icon: Users,
    title: 'Sales Coaching & Training',
    description: 'Transform your sales team with proven methodologies including NEPQ, Challenger Sale, and consultative selling.',
  },
  {
    icon: Lightbulb,
    title: 'Leadership Development',
    description: 'Build high-performing leadership teams that drive innovation and operational excellence.',
  },
  {
    icon: BarChart3,
    title: 'Performance Analytics',
    description: 'Custom dashboards and KPI frameworks to track what matters and make informed decisions.',
  },
];

const stats = [
  { value: '150+', label: 'Brisbane Businesses Served' },
  { value: '94%', label: 'Client Retention Rate' },
  { value: '$2.3M', label: 'Average Revenue Growth' },
  { value: '12+', label: 'Years Experience' },
];

const testimonials = [
  {
    quote: "BattleScore transformed our sales process. We've increased our close rate by 40% in just 6 months.",
    author: 'Sarah Mitchell',
    role: 'CEO, TechFlow Solutions',
    location: 'Brisbane',
  },
  {
    quote: "The strategic clarity they brought to our business was game-changing. Highly recommend to any Brisbane business.",
    author: 'James Chen',
    role: 'Founder, GreenBuild Construction',
    location: 'Gold Coast',
  },
  {
    quote: "Finally, a business consultant who understands the Queensland market. Practical advice, real results.",
    author: 'Michelle Thompson',
    role: 'Director, Coastal Wealth Advisors',
    location: 'Sunshine Coast',
  },
];

export default function MarketingHome() {
  const homeSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      localBusinessSchema,
      {
        '@type': 'WebPage',
        '@id': 'https://battlescore.com.au/#webpage',
        url: 'https://battlescore.com.au/marketing',
        name: 'Business Consultant Brisbane | BattleScore Consulting',
        description: 'Brisbane\'s leading business consulting firm. Expert business advice, sales coaching, and growth strategy for SMEs across Queensland.',
        isPartOf: { '@id': 'https://battlescore.com.au/#website' },
      },
      {
        '@type': 'WebSite',
        '@id': 'https://battlescore.com.au/#website',
        url: 'https://battlescore.com.au/marketing',
        name: 'BattleScore Business Consulting',
        publisher: { '@id': 'https://battlescore.com.au/#business' },
      },
    ],
  };

  return (
    <MarketingLayout>
      <SEOHead
        title="Business Consultant Brisbane | Expert Business Advice | BattleScore"
        description="Brisbane's leading business consulting firm. Get expert business advice, sales coaching, and growth strategy tailored for Queensland SMEs. Book your free discovery call today."
        keywords="business consultant brisbane, business advisor brisbane, business coaching brisbane, small business advisor brisbane, business mentor brisbane, business consulting queensland, growth strategy brisbane"
        canonicalUrl="https://battlescore.com.au/marketing"
        structuredData={homeSchema}
      />

      <section className="relative py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Target className="h-4 w-4" />
              Brisbane's Trusted Business Partner
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Turn Business Challenges Into{' '}
              <span className="text-primary">Competitive Advantages</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
              Expert business consulting for Brisbane SMEs. We help you build momentum, 
              close more deals, and achieve sustainable growth with proven strategies.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/marketing/contact">
                <Button size="lg" className="w-full sm:w-auto" data-testid="button-hero-cta">
                  Book Your Free Strategy Call
                  <ChevronRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
              <Link href="/marketing/services">
                <Button variant="outline" size="lg" className="w-full sm:w-auto" data-testid="button-hero-services">
                  View Our Services
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20" id="services">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How We Help Brisbane Businesses Grow</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Comprehensive business consulting services designed to address your specific challenges 
              and unlock your growth potential.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((service) => (
              <Card key={service.title} className="hover-elevate transition-all">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <service.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{service.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{service.description}</p>
                  <Link href="/marketing/services" className="text-sm font-medium text-primary inline-flex items-center hover:underline">
                    Learn more <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">
                Why Brisbane Businesses Choose BattleScore
              </h2>
              <div className="space-y-4">
                {[
                  { icon: Building2, text: 'Deep understanding of the Queensland business landscape' },
                  { icon: Briefcase, text: 'Proven track record with 150+ local businesses' },
                  { icon: LineChart, text: 'Data-driven approach with measurable outcomes' },
                  { icon: Clock, text: 'Flexible engagement models that fit your schedule' },
                  { icon: Award, text: 'Certified in leading sales and leadership methodologies' },
                ].map((item) => (
                  <div key={item.text} className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-muted-foreground">{item.text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <Link href="/marketing/about">
                  <Button variant="outline" data-testid="button-learn-more">
                    Learn More About Us
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 lg:p-12">
              <blockquote className="space-y-6">
                <p className="text-lg italic">
                  "Working with BattleScore was a turning point for our business. Their strategic 
                  approach helped us identify blind spots and create a clear path to growth."
                </p>
                <footer className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-lg font-semibold text-primary">SM</span>
                  </div>
                  <div>
                    <div className="font-semibold">Sarah Mitchell</div>
                    <div className="text-sm text-muted-foreground">CEO, TechFlow Solutions - Brisbane</div>
                  </div>
                </footer>
              </blockquote>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">What Our Clients Say</h2>
            <p className="text-lg text-muted-foreground">
              Real results from real Brisbane businesses
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial) => (
              <Card key={testimonial.author} className="hover-elevate">
                <CardContent className="p-6">
                  <p className="text-muted-foreground mb-6 italic">"{testimonial.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {testimonial.author.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-sm">{testimonial.author}</div>
                      <div className="text-xs text-muted-foreground">{testimonial.role}</div>
                      <div className="text-xs text-muted-foreground">{testimonial.location}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Transform Your Business?
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Book a free 30-minute strategy call and discover how we can help your 
            Brisbane business achieve its growth goals.
          </p>
          <Link href="/marketing/contact">
            <Button size="lg" variant="secondary" data-testid="button-cta-bottom">
              Book Your Free Strategy Call
              <ChevronRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
