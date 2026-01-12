import { useState } from 'react';
import MarketingLayout from '@/components/MarketingLayout';
import SEOHead, { localBusinessSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  MapPin, Mail, Phone, Clock, Calendar, 
  CheckCircle2, Send, MessageSquare
} from 'lucide-react';

const contactInfo = [
  {
    icon: MapPin,
    title: 'Location',
    details: ['Brisbane, QLD, Australia', 'Serving all of Queensland'],
  },
  {
    icon: Mail,
    title: 'Email',
    details: ['hello@battlescore.com.au'],
    link: 'mailto:hello@battlescore.com.au',
  },
  {
    icon: Phone,
    title: 'Phone',
    details: ['+61 7 0000 0000'],
    link: 'tel:+61700000000',
  },
  {
    icon: Clock,
    title: 'Business Hours',
    details: ['Monday - Friday', '9:00 AM - 5:00 PM AEST'],
  },
];

const services = [
  'Business Consulting',
  'Sales Coaching',
  'Growth Strategy',
  'Leadership Development',
  'Other',
];

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    await new Promise(resolve => setTimeout(resolve, 1500));

    setIsSubmitting(false);
    setSubmitted(true);
    toast({
      title: 'Message sent!',
      description: 'We\'ll get back to you within 24 hours.',
    });
  };

  const contactSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      localBusinessSchema,
      {
        '@type': 'ContactPage',
        '@id': 'https://battlescore.com.au/marketing/contact/#webpage',
        url: 'https://battlescore.com.au/marketing/contact',
        name: 'Contact BattleScore | Business Consultant Brisbane',
        description: 'Contact BattleScore Consulting for expert business advice in Brisbane. Book a free strategy call today.',
        isPartOf: { '@id': 'https://battlescore.com.au/#website' },
      },
    ],
  };

  return (
    <MarketingLayout>
      <SEOHead
        title="Contact Us | Business Consultant Brisbane | BattleScore"
        description="Contact BattleScore Consulting for expert business advice in Brisbane. Book a free 30-minute strategy call and discover how we can help your business grow."
        keywords="contact business consultant brisbane, brisbane business advisor contact, book business consultation brisbane, free business strategy call"
        canonicalUrl="https://battlescore.com.au/marketing/contact"
        structuredData={contactSchema}
      />

      <section className="py-20 bg-gradient-to-b from-muted/50 to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Let's Talk About Your Business
            </h1>
            <p className="text-xl text-muted-foreground">
              Ready to take your business to the next level? Get in touch and let's 
              discuss how we can help you achieve your goals.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Book Your Free Strategy Call
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {submitted ? (
                    <div className="text-center py-12">
                      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="h-8 w-8 text-primary" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">Thank You!</h3>
                      <p className="text-muted-foreground mb-6">
                        We've received your message and will get back to you within 24 hours 
                        to schedule your free strategy call.
                      </p>
                      <Button onClick={() => setSubmitted(false)} variant="outline">
                        Send Another Message
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name *</Label>
                          <Input 
                            id="firstName" 
                            name="firstName" 
                            required 
                            placeholder="John"
                            data-testid="input-first-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name *</Label>
                          <Input 
                            id="lastName" 
                            name="lastName" 
                            required 
                            placeholder="Smith"
                            data-testid="input-last-name"
                          />
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">Email *</Label>
                          <Input 
                            id="email" 
                            name="email" 
                            type="email" 
                            required 
                            placeholder="john@company.com.au"
                            data-testid="input-email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone</Label>
                          <Input 
                            id="phone" 
                            name="phone" 
                            type="tel" 
                            placeholder="+61 4XX XXX XXX"
                            data-testid="input-phone"
                          />
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="company">Company Name *</Label>
                          <Input 
                            id="company" 
                            name="company" 
                            required 
                            placeholder="Your Company Pty Ltd"
                            data-testid="input-company"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="service">Service Interest *</Label>
                          <Select name="service" required>
                            <SelectTrigger data-testid="select-service">
                              <SelectValue placeholder="Select a service" />
                            </SelectTrigger>
                            <SelectContent>
                              {services.map((service) => (
                                <SelectItem key={service} value={service.toLowerCase().replace(/\s+/g, '-')}>
                                  {service}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="message">Tell us about your business and goals *</Label>
                        <Textarea 
                          id="message" 
                          name="message" 
                          required 
                          rows={5}
                          placeholder="What challenges are you facing? What would success look like for you?"
                          data-testid="textarea-message"
                        />
                      </div>

                      <Button 
                        type="submit" 
                        size="lg" 
                        className="w-full sm:w-auto"
                        disabled={isSubmitting}
                        data-testid="button-submit-contact"
                      >
                        {isSubmitting ? (
                          <>Sending...</>
                        ) : (
                          <>
                            Send Message
                            <Send className="h-4 w-4 ml-2" />
                          </>
                        )}
                      </Button>

                      <p className="text-sm text-muted-foreground">
                        By submitting this form, you agree to our privacy policy. 
                        We'll never share your information with third parties.
                      </p>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Free 30-Minute Call</h3>
                      <p className="text-sm text-muted-foreground">No obligation strategy session</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    During your free call, we'll discuss your business challenges, 
                    goals, and explore how we can help you achieve them.
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {contactInfo.map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{item.title}</h3>
                      {item.details.map((detail, index) => (
                        <p key={index} className="text-sm text-muted-foreground">
                          {item.link && index === 0 ? (
                            <a href={item.link} className="hover:text-primary">
                              {detail}
                            </a>
                          ) : (
                            detail
                          )}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <Card className="bg-primary text-primary-foreground">
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-2">Serving All of Queensland</h3>
                  <p className="text-sm opacity-90">
                    Based in Brisbane, we work with businesses across the Gold Coast, 
                    Sunshine Coast, Toowoomba, and regional Queensland. Virtual and 
                    in-person consultations available.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
            <div className="space-y-6 text-left">
              {[
                {
                  q: 'What industries do you work with?',
                  a: 'We work with SMEs across various industries including professional services, construction, technology, retail, manufacturing, and healthcare. Our methodologies are adaptable to any business context.',
                },
                {
                  q: 'How long are your consulting engagements?',
                  a: 'Engagement length varies based on your needs. We offer everything from one-day strategy workshops to 6-12 month transformation programs. Most clients start with a 3-month engagement.',
                },
                {
                  q: 'Do you work with businesses outside Brisbane?',
                  a: 'Yes! While we\'re based in Brisbane, we work with businesses across Queensland and can conduct virtual or in-person sessions depending on your location and preferences.',
                },
                {
                  q: 'What makes BattleScore different from other consultants?',
                  a: 'We combine deep local market knowledge with world-class methodologies. We don\'t just advise—we work alongside you to implement changes and ensure results.',
                },
              ].map((faq) => (
                <div key={faq.q} className="bg-background rounded-lg p-6">
                  <h3 className="font-semibold mb-2">{faq.q}</h3>
                  <p className="text-sm text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
