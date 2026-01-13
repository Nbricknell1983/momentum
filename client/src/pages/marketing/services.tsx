import MarketingLayout from '@/components/MarketingLayout';
import SEOHead, { serviceSchema, localBusinessSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'wouter';
import { 
  ChevronRight, TrendingUp, Users, Lightbulb, BarChart3,
  Target, Compass, Rocket, Brain, MessageSquare, LineChart,
  CheckCircle2, ArrowRight, Zap
} from 'lucide-react';

const mainServices = [
  {
    id: 'business-consulting',
    icon: Compass,
    title: 'Business Consulting',
    subtitle: 'Strategic Guidance for Growth',
    description: 'Comprehensive business consulting services to help Brisbane businesses navigate challenges and seize opportunities.',
    benefits: [
      'Strategic business planning and goal setting',
      'Market analysis and competitive positioning',
      'Operational efficiency assessments',
      'Financial performance optimization',
      'Risk management and contingency planning',
    ],
    keywords: 'business consultant brisbane, business advisor brisbane, small business advisor brisbane',
  },
  {
    id: 'sales-coaching',
    icon: MessageSquare,
    title: 'Sales Coaching & Training',
    subtitle: 'Transform Your Sales Performance',
    description: 'Proven sales methodologies including NEPQ, Challenger Sale, and consultative selling techniques that deliver results.',
    benefits: [
      'NEPQ (Neuro-Emotional Persuasion Questions) training',
      'Sales process design and optimization',
      'Pipeline management and forecasting',
      'Objection handling mastery',
      'Closing techniques and negotiation skills',
    ],
    keywords: 'sales coaching brisbane, sales training queensland, sales consultant brisbane',
  },
  {
    id: 'growth-strategy',
    icon: Rocket,
    title: 'Growth Strategy',
    subtitle: 'Accelerate Your Business Growth',
    description: 'Data-driven growth strategies to help your business scale sustainably in the competitive Queensland market.',
    benefits: [
      'Growth opportunity identification',
      'Customer acquisition strategy',
      'Revenue diversification planning',
      'Market expansion roadmaps',
      'Partnership and alliance development',
    ],
    keywords: 'business growth brisbane, growth strategy consultant, business development queensland',
  },
  {
    id: 'leadership-development',
    icon: Brain,
    title: 'Leadership Development',
    subtitle: 'Build High-Performing Teams',
    description: 'Develop leaders who inspire, motivate, and drive your organization toward excellence.',
    benefits: [
      'Executive coaching programs',
      'Leadership assessment and development',
      'Team dynamics and collaboration',
      'Change management leadership',
      'Succession planning',
    ],
    keywords: 'leadership coaching brisbane, executive coaching queensland, business mentor brisbane',
  },
];

const additionalServices = [
  {
    icon: BarChart3,
    title: 'Performance Analytics',
    description: 'Custom dashboards and KPI frameworks to track what matters and drive informed decisions.',
  },
  {
    icon: Target,
    title: 'Marketing Strategy',
    description: 'Digital marketing, SEO, and lead generation strategies to grow your customer base.',
  },
  {
    icon: LineChart,
    title: 'Financial Advisory',
    description: 'Cash flow optimization, budgeting, and financial planning for sustainable growth.',
  },
  {
    icon: Zap,
    title: 'Process Automation',
    description: 'Streamline operations with technology and automation to improve efficiency.',
  },
];

export default function ServicesPage() {
  const servicesSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      localBusinessSchema,
      ...mainServices.map(service => 
        serviceSchema(service.title, service.description, service.id)
      ),
    ],
  };

  return (
    <MarketingLayout>
      <SEOHead
        title="Business Consulting Services Brisbane | Sales Coaching & Growth Strategy | BattleScore"
        description="Comprehensive business consulting services in Brisbane. Expert sales coaching, growth strategy, and leadership development for Queensland SMEs. Book your free consultation."
        keywords="business consulting brisbane, sales coaching brisbane, growth strategy brisbane, leadership development queensland, business advisor brisbane, small business consultant"
        canonicalUrl="https://battlescore.com.au/services"
        structuredData={servicesSchema}
      />

      <section className="py-20 bg-gradient-to-b from-muted/50 to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Business Consulting Services in Brisbane
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Expert business advice, sales coaching, and growth strategy tailored for 
              Queensland SMEs. We help you build momentum and achieve sustainable success.
            </p>
            <Link href="/contact">
              <Button size="lg" data-testid="button-services-cta">
                Discuss Your Needs
                <ChevronRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="space-y-16">
            {mainServices.map((service, index) => (
              <div 
                key={service.id} 
                id={service.id}
                className={`grid lg:grid-cols-2 gap-12 items-center ${
                  index % 2 === 1 ? 'lg:flex-row-reverse' : ''
                }`}
              >
                <div className={index % 2 === 1 ? 'lg:order-2' : ''}>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                    <service.icon className="h-4 w-4" />
                    {service.subtitle}
                  </div>
                  <h2 className="text-3xl font-bold mb-4">{service.title}</h2>
                  <p className="text-lg text-muted-foreground mb-6">{service.description}</p>
                  <ul className="space-y-3 mb-8">
                    {service.benefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/contact">
                    <Button data-testid={`button-${service.id}-cta`}>
                      Learn More
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
                <div className={`bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 lg:p-12 ${
                  index % 2 === 1 ? 'lg:order-1' : ''
                }`}>
                  <div className="h-16 w-16 rounded-xl bg-primary/20 flex items-center justify-center mb-6">
                    <service.icon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-4">What You'll Get</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      <span className="text-sm">Initial assessment and goal alignment</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      <span className="text-sm">Customized action plan</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      <span className="text-sm">Regular progress reviews</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      <span className="text-sm">Ongoing support and accountability</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Additional Services</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Complementary services to support your complete business transformation
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {additionalServices.map((service) => (
              <Card key={service.title} className="hover-elevate">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <service.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{service.title}</h3>
                  <p className="text-sm text-muted-foreground">{service.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Our Approach</h2>
              <p className="text-lg text-muted-foreground">
                A proven methodology that delivers results
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  step: '01',
                  title: 'Discover',
                  description: 'We start by deeply understanding your business, challenges, and goals through comprehensive assessment.',
                },
                {
                  step: '02',
                  title: 'Design',
                  description: 'We create a customized strategy and action plan aligned with your specific needs and resources.',
                },
                {
                  step: '03',
                  title: 'Deliver',
                  description: 'We work alongside you to implement changes, track progress, and adjust as needed for optimal results.',
                },
              ].map((phase) => (
                <div key={phase.step} className="text-center">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary text-primary-foreground text-xl font-bold mb-4">
                    {phase.step}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{phase.title}</h3>
                  <p className="text-muted-foreground">{phase.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Book a free 30-minute discovery call to discuss your business needs 
            and explore how we can help.
          </p>
          <Link href="/contact">
            <Button size="lg" variant="secondary" data-testid="button-services-cta-bottom">
              Book Your Free Discovery Call
              <ChevronRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
