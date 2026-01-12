import MarketingLayout from '@/components/MarketingLayout';
import SEOHead, { localBusinessSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'wouter';
import { 
  ChevronRight, Target, Award, Users, Heart,
  Lightbulb, CheckCircle2, ArrowRight, MapPin, Building2
} from 'lucide-react';

const values = [
  {
    icon: Target,
    title: 'Results-Driven',
    description: 'We measure our success by your success. Every engagement is focused on delivering measurable outcomes.',
  },
  {
    icon: Heart,
    title: 'Client-First',
    description: 'Your goals, challenges, and vision are at the center of everything we do. We\'re your partners, not just consultants.',
  },
  {
    icon: Lightbulb,
    title: 'Innovation',
    description: 'We blend proven methodologies with fresh thinking to give you a competitive edge in the market.',
  },
  {
    icon: Users,
    title: 'Collaboration',
    description: 'We work alongside your team, transferring knowledge and building capability for long-term success.',
  },
];

const credentials = [
  'Certified in NEPQ (Neuro-Emotional Persuasion Questions)',
  'Challenger Sale Methodology Practitioners',
  'Harvard Business School Strategy Certificate',
  'Certified Business Coach (ICF)',
  'Six Sigma Green Belt Certified',
  'Certified in Chris Voss Negotiation Techniques',
];

export default function AboutPage() {
  const aboutSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      localBusinessSchema,
      {
        '@type': 'AboutPage',
        '@id': 'https://battlescore.com.au/marketing/about/#webpage',
        url: 'https://battlescore.com.au/marketing/about',
        name: 'About BattleScore | Business Consultant Brisbane',
        description: 'Learn about BattleScore Consulting - Brisbane\'s trusted business advisors helping SMEs achieve sustainable growth.',
        isPartOf: { '@id': 'https://battlescore.com.au/#website' },
      },
    ],
  };

  return (
    <MarketingLayout>
      <SEOHead
        title="About Us | Business Consultant Brisbane | BattleScore Consulting"
        description="Meet BattleScore Consulting - Brisbane's trusted business advisors. Over 12 years helping Queensland SMEs achieve sustainable growth with proven strategies."
        keywords="business consultant brisbane about, brisbane business advisor, queensland business consulting firm, small business mentor brisbane"
        canonicalUrl="https://battlescore.com.au/marketing/about"
        structuredData={aboutSchema}
      />

      <section className="py-20 bg-gradient-to-b from-muted/50 to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              About BattleScore Consulting
            </h1>
            <p className="text-xl text-muted-foreground">
              Brisbane's trusted business advisors helping SMEs build momentum 
              and achieve sustainable growth.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Our Story</h2>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  BattleScore was founded with a simple mission: to help Brisbane businesses 
                  compete and win in an increasingly complex marketplace. After spending over 
                  a decade working with enterprises across Australia, we recognized that SMEs 
                  needed access to the same strategic thinking and proven methodologies—but 
                  tailored to their unique challenges and resources.
                </p>
                <p>
                  Today, we've helped over 150 Queensland businesses transform their operations, 
                  improve their sales performance, and build sustainable competitive advantages. 
                  Our clients span industries from professional services and construction to 
                  technology and retail.
                </p>
                <p>
                  What sets us apart is our deep understanding of the Queensland market and our 
                  commitment to practical, actionable strategies. We don't just advise—we work 
                  alongside you to implement change and achieve results.
                </p>
              </div>
            </div>
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 lg:p-12">
              <div className="flex items-center gap-3 mb-6">
                <MapPin className="h-6 w-6 text-primary" />
                <span className="font-semibold">Proudly Brisbane-Based</span>
              </div>
              <p className="text-muted-foreground mb-6">
                We're not fly-in consultants. We're part of the Brisbane business community, 
                and we understand the unique opportunities and challenges of operating in 
                Queensland.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-primary" />
                  <span>Serving Brisbane, Gold Coast, Sunshine Coast & SEQ</span>
                </div>
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <span>150+ local businesses served</span>
                </div>
                <div className="flex items-center gap-3">
                  <Award className="h-5 w-5 text-primary" />
                  <span>12+ years of consulting experience</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Our Values</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              The principles that guide everything we do
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => (
              <Card key={value.title} className="text-center">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <value.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{value.title}</h3>
                  <p className="text-sm text-muted-foreground">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="lg:order-2">
              <h2 className="text-3xl font-bold mb-6">Our Expertise</h2>
              <p className="text-muted-foreground mb-6">
                Our team brings together decades of experience in business strategy, 
                sales excellence, and leadership development. We're certified in the 
                world's leading methodologies and continuously invest in our professional 
                development.
              </p>
              <ul className="space-y-3">
                {credentials.map((credential) => (
                  <li key={credential} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{credential}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:order-1">
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8">
                <h3 className="text-xl font-semibold mb-6">Methodologies We Use</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    'NEPQ Sales Training',
                    'Challenger Sale',
                    'Chris Voss Negotiation',
                    'Jeb Blount Fanatical Prospecting',
                    'OKR Framework',
                    'Lean Six Sigma',
                    'Balanced Scorecard',
                    'Design Thinking',
                  ].map((method) => (
                    <div key={method} className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      <span>{method}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Work With Us?
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Let's discuss how we can help your Brisbane business 
            achieve its growth goals.
          </p>
          <Link href="/marketing/contact">
            <Button size="lg" variant="secondary" data-testid="button-about-cta">
              Get in Touch
              <ChevronRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
