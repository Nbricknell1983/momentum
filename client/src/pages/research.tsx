import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { Search, Building2, MapPin, Plus, Loader2, ExternalLink, AlertCircle, Star, Globe, Phone, Sparkles, Navigation, Calendar, Check, ChevronsUpDown, Mail, MessageSquare, Copy, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { addLead } from '@/store';
import { createLead, fetchRejectedBusinesses, checkIfBusinessRejected } from '@/lib/firestoreService';
import { v4 as uuidv4 } from 'uuid';
import type { Lead, LeadSourceData, RejectedBusiness } from '@/lib/types';

interface AddLeadDialogData {
  type: 'abr' | 'google';
  businessName: string;
  businessType?: string;
  location?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  isLikelyNew?: boolean;
  // ABR specific
  abn?: string;
  abnState?: string;
  abnPostcode?: string;
  // Google specific
  placeId?: string;
  address?: string;
}

interface OutreachScripts {
  textScript: string;
  emailScript: string;
  callScript: string;
}

interface ABRBusinessResult {
  Abn: string;
  AbnStatus: string;
  IsCurrent: boolean;
  Name: string;
  NameType: string;
  Postcode: string;
  State: string;
  Score: number;
}

interface ABRSearchResponse {
  Message: string;
  Names: ABRBusinessResult[];
}

interface ABNDetails {
  Abn: string;
  AbnStatus: string;
  AbnStatusEffectiveFrom: string;
  Acn: string;
  AddressDate: string;
  AddressPostcode: string;
  AddressState: string;
  BusinessName: string[];
  EntityName: string;
  EntityTypeCode: string;
  EntityTypeName: string;
  Gst: string;
  Message: string;
}

interface GooglePlaceResult {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number;
  types: string[];
  phone: string | null;
  website: string | null;
  isLikelyNew: boolean;
}

const RADIUS_OPTIONS = [
  { value: '5000', label: '5 km' },
  { value: '10000', label: '10 km' },
  { value: '25000', label: '25 km' },
  { value: '50000', label: '50 km (max)' },
];

const BUSINESS_TYPES = [
  { value: 'all', label: 'All Business Types' },
  // Automotive
  { value: 'car_dealer', label: 'Car Dealers' },
  { value: 'car_rental', label: 'Car Rental' },
  { value: 'car_repair', label: 'Auto Repair' },
  { value: 'car_wash', label: 'Car Wash' },
  { value: 'gas_station', label: 'Gas Stations' },
  // Food & Drink
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'cafe', label: 'Cafes' },
  { value: 'coffee_shop', label: 'Coffee Shops' },
  { value: 'bakery', label: 'Bakeries' },
  { value: 'bar', label: 'Bars' },
  { value: 'fast_food_restaurant', label: 'Fast Food' },
  { value: 'pizza_restaurant', label: 'Pizza' },
  { value: 'meal_delivery', label: 'Meal Delivery' },
  // Health & Wellness
  { value: 'gym', label: 'Gyms' },
  { value: 'fitness_center', label: 'Fitness Centers' },
  { value: 'spa', label: 'Spas' },
  { value: 'yoga_studio', label: 'Yoga Studios' },
  { value: 'dentist', label: 'Dentists' },
  { value: 'doctor', label: 'Doctors' },
  { value: 'pharmacy', label: 'Pharmacies' },
  { value: 'hospital', label: 'Hospitals' },
  { value: 'physiotherapist', label: 'Physiotherapists' },
  { value: 'chiropractor', label: 'Chiropractors' },
  { value: 'veterinary_care', label: 'Vets' },
  // Services
  { value: 'beauty_salon', label: 'Beauty Salons' },
  { value: 'hair_salon', label: 'Hair Salons' },
  { value: 'barber_shop', label: 'Barber Shops' },
  { value: 'nail_salon', label: 'Nail Salons' },
  { value: 'lawyer', label: 'Lawyers' },
  { value: 'accounting', label: 'Accountants' },
  { value: 'real_estate_agency', label: 'Real Estate' },
  { value: 'insurance_agency', label: 'Insurance' },
  { value: 'travel_agency', label: 'Travel Agencies' },
  { value: 'plumber', label: 'Plumbers' },
  { value: 'electrician', label: 'Electricians' },
  { value: 'roofing_contractor', label: 'Roofers' },
  { value: 'locksmith', label: 'Locksmiths' },
  { value: 'painter', label: 'Painters' },
  { value: 'moving_company', label: 'Moving Companies' },
  { value: 'florist', label: 'Florists' },
  { value: 'funeral_home', label: 'Funeral Homes' },
  { value: 'laundry', label: 'Laundry Services' },
  // Shopping
  { value: 'grocery_store', label: 'Grocery Stores' },
  { value: 'supermarket', label: 'Supermarkets' },
  { value: 'convenience_store', label: 'Convenience Stores' },
  { value: 'pet_store', label: 'Pet Stores' },
  { value: 'clothing_store', label: 'Clothing Stores' },
  { value: 'shoe_store', label: 'Shoe Stores' },
  { value: 'jewelry_store', label: 'Jewelry Stores' },
  { value: 'furniture_store', label: 'Furniture Stores' },
  { value: 'electronics_store', label: 'Electronics Stores' },
  { value: 'hardware_store', label: 'Hardware Stores' },
  { value: 'home_improvement_store', label: 'Home Improvement' },
  { value: 'book_store', label: 'Book Stores' },
  { value: 'bicycle_store', label: 'Bicycle Stores' },
  { value: 'sporting_goods_store', label: 'Sporting Goods' },
  { value: 'liquor_store', label: 'Liquor Stores' },
  // Lodging
  { value: 'hotel', label: 'Hotels' },
  { value: 'motel', label: 'Motels' },
  { value: 'campground', label: 'Campgrounds' },
  // Entertainment
  { value: 'movie_theater', label: 'Movie Theaters' },
  { value: 'bowling_alley', label: 'Bowling Alleys' },
  { value: 'amusement_park', label: 'Amusement Parks' },
  { value: 'night_club', label: 'Night Clubs' },
  { value: 'casino', label: 'Casinos' },
  // Education
  { value: 'school', label: 'Schools' },
  { value: 'university', label: 'Universities' },
  { value: 'library', label: 'Libraries' },
  // Finance
  { value: 'bank', label: 'Banks' },
  { value: 'atm', label: 'ATMs' },
];

export default function ResearchPage() {
  const dispatch = useDispatch();
  const { orgId, user, authReady } = useAuth();
  const { toast } = useToast();
  
  // Data source selection
  const [dataSource, setDataSource] = useState<'abr' | 'google'>('google');
  
  // ABR state
  const [abrSearchType, setAbrSearchType] = useState<'name' | 'postcode'>('name');
  const [abrQuery, setAbrQuery] = useState('');
  const [abrResults, setAbrResults] = useState<ABRBusinessResult[]>([]);
  const [selectedAbn, setSelectedAbn] = useState<string | null>(null);
  const [abnDetails, setAbnDetails] = useState<ABNDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  
  // Google Places state
  const [googleLocation, setGoogleLocation] = useState('');
  const [googleBusinessType, setGoogleBusinessType] = useState('');
  const [businessTypeSearch, setBusinessTypeSearch] = useState('');
  const [businessTypeOpen, setBusinessTypeOpen] = useState(false);
  const [googleRadius, setGoogleRadius] = useState('50000');
  const [googleResults, setGoogleResults] = useState<GooglePlaceResult[]>([]);
  const [showOnlyNew, setShowOnlyNew] = useState(true);
  const [searchedLocation, setSearchedLocation] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [domainAges, setDomainAges] = useState<Record<string, { loading: boolean; data?: any; error?: string }>>({});
  
  // Shared state
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Add Lead Dialog state
  const [addLeadDialogOpen, setAddLeadDialogOpen] = useState(false);
  const [addLeadData, setAddLeadData] = useState<AddLeadDialogData | null>(null);
  const [addedReason, setAddedReason] = useState('');
  const [outreachScripts, setOutreachScripts] = useState<OutreachScripts | null>(null);
  const [isGeneratingScripts, setIsGeneratingScripts] = useState(false);
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [activeScriptTab, setActiveScriptTab] = useState<'text' | 'email' | 'call'>('text');
  
  // Rejected businesses state
  const [rejectedBusinesses, setRejectedBusinesses] = useState<RejectedBusiness[]>([]);
  const [matchedRejection, setMatchedRejection] = useState<RejectedBusiness | null>(null);

  // Fetch rejected businesses on mount
  useEffect(() => {
    if (orgId && authReady) {
      fetchRejectedBusinesses(orgId, authReady)
        .then(setRejectedBusinesses)
        .catch(console.error);
    }
  }, [orgId, authReady]);

  // ABR Search
  const handleAbrSearch = async () => {
    if (!abrQuery.trim()) return;
    
    setIsSearching(true);
    setError(null);
    setAbrResults([]);
    setSelectedAbn(null);
    setAbnDetails(null);
    
    try {
      const endpoint = abrSearchType === 'name' 
        ? `/api/abr/search-name?name=${encodeURIComponent(abrQuery)}&maxResults=50`
        : `/api/abr/search-postcode?postcode=${encodeURIComponent(abrQuery)}&maxResults=100`;
      
      const response = await fetch(endpoint);
      const data: ABRSearchResponse = await response.json();
      
      if (!response.ok) {
        throw new Error((data as any).error || 'Search failed');
      }
      
      if (data.Names && data.Names.length > 0) {
        const activeResults = data.Names.filter(b => b.AbnStatus === 'Active' || b.IsCurrent);
        setAbrResults(activeResults);
        
        if (activeResults.length === 0) {
          setError('No active businesses found matching your search.');
        }
      } else {
        setError(data.Message || 'No results found');
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Failed to search. Please check your ABR API key is configured.');
    } finally {
      setIsSearching(false);
    }
  };

  // Get user's current location
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    
    setIsGettingLocation(true);
    setError(null);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setGoogleLocation('My Location');
        setIsGettingLocation(false);
        toast({
          title: "Location found",
          description: "Ready to search businesses near you"
        });
      },
      (err) => {
        console.error('Geolocation error:', err);
        setError('Could not get your location. Please enter a location manually.');
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Google Places Search
  const handleGoogleSearch = async () => {
    if (!googleLocation.trim() && !userCoords) return;
    
    setIsSearching(true);
    setError(null);
    setGoogleResults([]);
    
    try {
      const params = new URLSearchParams({
        radius: googleRadius
      });
      
      // Use coordinates if available, otherwise use text location
      if (userCoords && googleLocation === 'My Location') {
        params.append('lat', userCoords.lat.toString());
        params.append('lng', userCoords.lng.toString());
      } else {
        params.append('location', googleLocation);
      }
      
      if (googleBusinessType) {
        params.append('type', googleBusinessType);
      }
      
      const response = await fetch(`/api/google-places/search?${params}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }
      
      setGoogleResults(data.results || []);
      setSearchedLocation(data.searchLocation?.address || googleLocation);
      
      if (data.results?.length === 0) {
        setError('No businesses found in this area. Try a different location or business type.');
      }
    } catch (err: any) {
      console.error('Google search error:', err);
      setError(err.message || 'Failed to search. Please check your Google API key is configured.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleViewAbnDetails = async (abn: string) => {
    setSelectedAbn(abn);
    setIsLoadingDetails(true);
    
    try {
      const response = await fetch(`/api/abr/abn/${abn}`);
      const data: ABNDetails = await response.json();
      
      if (!response.ok) {
        throw new Error((data as any).error || 'Failed to fetch details');
      }
      
      setAbnDetails(data);
    } catch (err: any) {
      console.error('Error fetching ABN details:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch business details',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Generate "Why suggested" reason for Google results
  const generateGoogleWhySuggested = (place: GooglePlaceResult): string => {
    const reasons: string[] = [];
    
    if (place.reviewCount === 0) {
      reasons.push('No reviews yet - brand new business that likely needs marketing help');
    } else if (place.reviewCount < 10) {
      reasons.push(`Only ${place.reviewCount} reviews - very new business building their presence`);
    } else if (place.reviewCount < 50) {
      reasons.push(`${place.reviewCount} reviews - newer business still establishing reputation`);
    } else {
      reasons.push(`Established business with ${place.reviewCount} reviews`);
    }
    
    if (!place.website) {
      reasons.push('No website detected - opportunity for digital services');
    }
    
    if (place.rating && place.rating < 4) {
      reasons.push('Rating below 4.0 - may need reputation help');
    }
    
    return reasons.join('. ');
  };

  // Generate "Why suggested" reason for ABR results
  const generateAbrWhySuggested = (business: ABRBusinessResult): string => {
    return `Recently found via ABR search in ${business.State} ${business.Postcode}. Active registered business that may need professional services.`;
  };

  // Open add lead dialog for ABR business
  const openAddLeadDialogAbr = (business: ABRBusinessResult) => {
    const autoReason = generateAbrWhySuggested(business);
    
    // Check if this business was previously rejected
    const rejected = checkIfBusinessRejected(
      { abn: business.Abn, businessName: business.Name },
      rejectedBusinesses
    );
    setMatchedRejection(rejected);
    
    setAddLeadData({
      type: 'abr',
      businessName: business.Name,
      location: `${business.State} ${business.Postcode}`,
      abn: business.Abn,
      abnState: business.State,
      abnPostcode: business.Postcode,
    });
    setAddedReason(autoReason);
    setOutreachScripts(null);
    setAddLeadDialogOpen(true);
  };

  // Open add lead dialog for Google place
  const openAddLeadDialogGoogle = (place: GooglePlaceResult) => {
    const selectedType = BUSINESS_TYPES.find(t => t.value === googleBusinessType);
    const autoReason = generateGoogleWhySuggested(place);
    
    // Check if this business was previously rejected
    const rejected = checkIfBusinessRejected(
      { googlePlaceId: place.placeId, phone: place.phone, businessName: place.name },
      rejectedBusinesses
    );
    setMatchedRejection(rejected);
    
    setAddLeadData({
      type: 'google',
      businessName: place.name,
      businessType: selectedType?.label || place.types?.[0] || 'Business',
      location: place.address || searchedLocation || googleLocation,
      phone: place.phone || undefined,
      website: place.website || undefined,
      rating: place.rating ?? undefined,
      reviewCount: place.reviewCount,
      isLikelyNew: place.isLikelyNew,
      placeId: place.placeId,
      address: place.address,
    });
    setAddedReason(autoReason);
    setOutreachScripts(null);
    setAddLeadDialogOpen(true);
  };

  // Generate outreach scripts using AI
  const generateOutreachScripts = async () => {
    if (!addLeadData || !addedReason.trim()) return;
    
    setIsGeneratingScripts(true);
    
    try {
      const businessSignals: string[] = [];
      if (addLeadData.isLikelyNew) businessSignals.push('Likely new business (few reviews)');
      if (addLeadData.rating && addLeadData.rating >= 4.5) businessSignals.push('High customer rating');
      if (addLeadData.reviewCount && addLeadData.reviewCount < 10) businessSignals.push('Growing business - early stage');
      if (addLeadData.website) businessSignals.push('Has website presence');
      if (addLeadData.abn) businessSignals.push('Active ABN - registered business');

      const response = await fetch('/api/leads/generate-outreach-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: addLeadData.businessName,
          businessType: addLeadData.businessType,
          location: addLeadData.location,
          phone: addLeadData.phone,
          website: addLeadData.website,
          rating: addLeadData.rating,
          reviewCount: addLeadData.reviewCount,
          source: addLeadData.type === 'abr' ? 'abr' : 'google_places',
          addedReason: addedReason,
          businessSignals,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate scripts');
      }

      const scripts = await response.json();
      setOutreachScripts(scripts);
    } catch (err) {
      console.error('Error generating scripts:', err);
      toast({
        title: 'Error',
        description: 'Failed to generate outreach scripts',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingScripts(false);
    }
  };

  // Confirm and save the lead with scripts
  const confirmAddLead = async () => {
    if (!orgId || !user || !addLeadData) {
      toast({
        title: 'Error',
        description: 'You must be logged in to add leads',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingLead(true);

    try {
      const businessSignals: string[] = [];
      if (addLeadData.isLikelyNew) businessSignals.push('Likely new business (few reviews)');
      if (addLeadData.rating && addLeadData.rating >= 4.5) businessSignals.push('High customer rating');
      if (addLeadData.reviewCount && addLeadData.reviewCount < 10) businessSignals.push('Growing business - early stage');
      if (addLeadData.website) businessSignals.push('Has website presence');
      if (addLeadData.abn) businessSignals.push('Active ABN - registered business');

      const sourceData: LeadSourceData = addLeadData.type === 'abr' 
        ? {
            source: 'abr',
            abn: addLeadData.abn,
            abnState: addLeadData.abnState,
            abnPostcode: addLeadData.abnPostcode,
            addedReason: addedReason || 'Found via ABR business registry search',
            businessSignals,
            ...(outreachScripts?.textScript && { textScript: outreachScripts.textScript }),
            ...(outreachScripts?.emailScript && { emailScript: outreachScripts.emailScript }),
            ...(outreachScripts?.callScript && { callScript: outreachScripts.callScript }),
          }
        : {
            source: 'google_places',
            googlePlaceId: addLeadData.placeId,
            ...(addLeadData.rating !== undefined && { googleRating: addLeadData.rating }),
            ...(addLeadData.reviewCount !== undefined && { googleReviewCount: addLeadData.reviewCount }),
            addedReason: addedReason || `Found via Google Business search for "${searchedLocation || googleLocation}"`,
            businessSignals,
            ...(outreachScripts?.textScript && { textScript: outreachScripts.textScript }),
            ...(outreachScripts?.emailScript && { emailScript: outreachScripts.emailScript }),
            ...(outreachScripts?.callScript && { callScript: outreachScripts.callScript }),
          };

      const notes = addLeadData.type === 'abr'
        ? `ABN: ${addLeadData.abn}\nState: ${addLeadData.abnState}\nPostcode: ${addLeadData.abnPostcode}\nSource: ABR Research\n\nReason for adding: ${addedReason}`
        : [
            `Source: Google Business Profile`,
            addLeadData.address ? `Address: ${addLeadData.address}` : null,
            addLeadData.phone ? `Phone: ${addLeadData.phone}` : null,
            addLeadData.website ? `Website: ${addLeadData.website}` : null,
            addLeadData.rating ? `Rating: ${addLeadData.rating}/5 (${addLeadData.reviewCount} reviews)` : null,
            `Google Place ID: ${addLeadData.placeId}`,
            ``,
            `Reason for adding: ${addedReason}`,
          ].filter(Boolean).join('\n');

      const newLead: Lead = {
        id: uuidv4(),
        userId: user.uid,
        companyName: addLeadData.businessName,
        territory: addLeadData.location || '',
        contactName: '',
        email: '',
        phone: addLeadData.phone || '',
        stage: 'suspect',
        mrr: 0,
        notes,
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
        sourceData,
        nurtureMode: 'none',
        nurtureStatus: null,
        nurtureCadenceId: null,
        nurtureStepIndex: null,
        enrolledInNurtureAt: null,
        nextTouchAt: null,
        lastTouchAt: null,
        lastTouchChannel: null,
        touchesNoResponse: 0,
        engagementScore: 0,
        nurturePriorityScore: 0,
        ...(addLeadData.website && { website: addLeadData.website }),
        ...(addLeadData.address && { address: addLeadData.address }),
      };

      const savedLead = await createLead(orgId, newLead, authReady);
      dispatch(addLead(savedLead));

      toast({
        title: 'Lead added',
        description: `${addLeadData.businessName} has been added to your pipeline with outreach scripts`,
      });

      setAddLeadDialogOpen(false);
      setAddLeadData(null);
      setAddedReason('');
      setOutreachScripts(null);
    } catch (err: any) {
      console.error('Error adding lead:', err);
      toast({
        title: 'Error',
        description: 'Failed to add lead',
        variant: 'destructive',
      });
    } finally {
      setIsSavingLead(false);
    }
  };

  // Copy script to clipboard
  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: `${type} script copied to clipboard`,
    });
  };

  // Check domain age for a website
  const checkDomainAge = async (placeId: string, website: string) => {
    setDomainAges(prev => ({ ...prev, [placeId]: { loading: true } }));
    
    try {
      const response = await fetch(`/api/domain-age?domain=${encodeURIComponent(website)}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Lookup failed');
      }
      
      setDomainAges(prev => ({ ...prev, [placeId]: { loading: false, data } }));
    } catch (err: any) {
      setDomainAges(prev => ({ 
        ...prev, 
        [placeId]: { loading: false, error: err.message || 'Failed to check' } 
      }));
    }
  };

  const filteredGoogleResults = showOnlyNew 
    ? googleResults.filter(r => r.isLikelyNew)
    : googleResults;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto h-full overflow-y-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold" data-testid="text-research-title">Leads Research</h1>
        <p className="text-sm text-muted-foreground">
          Find new businesses to add to your pipeline
        </p>
      </div>

      {/* Data Source Tabs */}
      <Tabs value={dataSource} onValueChange={(v) => {
        setDataSource(v as 'abr' | 'google');
        setError(null);
      }}>
        <TabsList className="mb-4">
          <TabsTrigger value="google" data-testid="tab-google-places" className="gap-2">
            <Globe className="h-4 w-4" />
            Google Business Profiles
          </TabsTrigger>
          <TabsTrigger value="abr" data-testid="tab-abr" className="gap-2">
            <Building2 className="h-4 w-4" />
            Australian Business Register
          </TabsTrigger>
        </TabsList>

        {/* Google Places Search */}
        <TabsContent value="google">
          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="google-location">Location</Label>
                <div className="flex gap-2">
                  <Input
                    id="google-location"
                    placeholder="e.g., Brisbane..."
                    value={googleLocation}
                    onChange={(e) => {
                      setGoogleLocation(e.target.value);
                      if (e.target.value !== 'My Location') {
                        setUserCoords(null);
                      }
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleGoogleSearch()}
                    data-testid="input-google-location"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleUseMyLocation}
                    disabled={isGettingLocation}
                    title="Use my location"
                    data-testid="button-use-my-location"
                  >
                    {isGettingLocation ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Navigation className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div>
                <Label htmlFor="business-type">Business Type</Label>
                <Popover open={businessTypeOpen} onOpenChange={(open) => {
                  setBusinessTypeOpen(open);
                  if (open) setBusinessTypeSearch('');
                }}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={businessTypeOpen}
                      className="w-full justify-between font-normal"
                      data-testid="combobox-business-type"
                    >
                      {googleBusinessType 
                        ? BUSINESS_TYPES.find(t => t.value === googleBusinessType)?.label || googleBusinessType
                        : "Select or type..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput 
                        placeholder="Search or type custom..." 
                        value={businessTypeSearch}
                        onValueChange={setBusinessTypeSearch}
                      />
                      <CommandList>
                        {businessTypeSearch && !BUSINESS_TYPES.some(t => 
                          t.label.toLowerCase() === businessTypeSearch.toLowerCase() ||
                          t.value.toLowerCase() === businessTypeSearch.toLowerCase()
                        ) && (
                          <CommandItem
                            value={businessTypeSearch}
                            onSelect={() => {
                              setGoogleBusinessType(businessTypeSearch);
                              setBusinessTypeOpen(false);
                            }}
                          >
                            <Search className="mr-2 h-4 w-4" />
                            Use "{businessTypeSearch}"
                          </CommandItem>
                        )}
                        <CommandGroup heading="Suggestions">
                          {BUSINESS_TYPES.filter(type => 
                            !businessTypeSearch ||
                            type.label.toLowerCase().includes(businessTypeSearch.toLowerCase()) ||
                            type.value.toLowerCase().includes(businessTypeSearch.toLowerCase())
                          ).slice(0, 15).map(type => (
                            <CommandItem
                              key={type.value}
                              value={type.value}
                              onSelect={() => {
                                setGoogleBusinessType(type.value);
                                setBusinessTypeOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", googleBusinessType === type.value ? "opacity-100" : "opacity-0")} />
                              {type.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="radius">Search Radius</Label>
                <Select value={googleRadius} onValueChange={setGoogleRadius}>
                  <SelectTrigger id="radius" data-testid="select-radius">
                    <SelectValue placeholder="Select radius" />
                  </SelectTrigger>
                  <SelectContent>
                    {RADIUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleGoogleSearch} 
                  disabled={isSearching || (!googleLocation.trim() && !userCoords)} 
                  className="w-full"
                  data-testid="button-google-search"
                >
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                  Search
                </Button>
              </div>
            </div>
            
            {googleResults.length > 0 && (
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant={showOnlyNew ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowOnlyNew(!showOnlyNew)}
                  data-testid="button-filter-new"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {showOnlyNew ? 'Showing New Only' : 'Show New Only'}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {filteredGoogleResults.length} of {googleResults.length} results
                </span>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ABR Search */}
        <TabsContent value="abr">
          <Card className="p-6">
            <Tabs value={abrSearchType} onValueChange={(v) => setAbrSearchType(v as 'name' | 'postcode')}>
              <TabsList className="mb-4">
                <TabsTrigger value="name" data-testid="tab-search-name">
                  <Building2 className="h-4 w-4 mr-2" />
                  Search by Name
                </TabsTrigger>
                <TabsTrigger value="postcode" data-testid="tab-search-postcode">
                  <MapPin className="h-4 w-4 mr-2" />
                  Search by Postcode
                </TabsTrigger>
              </TabsList>

              <TabsContent value="name" className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="name-search" className="sr-only">Business Name</Label>
                    <Input
                      id="name-search"
                      placeholder="Enter business name..."
                      value={abrQuery}
                      onChange={(e) => setAbrQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAbrSearch()}
                      data-testid="input-search-name"
                    />
                  </div>
                  <Button onClick={handleAbrSearch} disabled={isSearching || !abrQuery.trim()} data-testid="button-search">
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                    Search
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="postcode" className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="postcode-search" className="sr-only">Postcode</Label>
                    <Input
                      id="postcode-search"
                      placeholder="Enter postcode (e.g., 4000)..."
                      value={abrQuery}
                      onChange={(e) => setAbrQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAbrSearch()}
                      data-testid="input-search-postcode"
                    />
                  </div>
                  <Button onClick={handleAbrSearch} disabled={isSearching || !abrQuery.trim()} data-testid="button-search-postcode">
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                    Search
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </TabsContent>
      </Tabs>

      {error && (
        <Card className="p-4 bg-destructive/10 border-destructive/20">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        </Card>
      )}

      {/* Google Results */}
      {dataSource === 'google' && filteredGoogleResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">
              Results ({filteredGoogleResults.length})
            </h2>
          </div>

          <div className="grid gap-3">
            {filteredGoogleResults.map((place) => (
              <Card 
                key={place.placeId} 
                className="p-4 hover-elevate"
                data-testid={`card-place-${place.placeId}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{place.name}</h3>
                      {place.isLikelyNew && (
                        <Badge variant="default" className="bg-green-600 shrink-0">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Likely New
                        </Badge>
                      )}
                      {place.rating && (
                        <Badge variant="outline" className="shrink-0">
                          <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
                          {place.rating} ({place.reviewCount})
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{place.address}</p>
                    
                    {/* Why Suggested */}
                    <div className="mt-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground">
                      <span className="font-medium">Why suggested: </span>
                      {place.reviewCount === 0 ? (
                        <span>No reviews yet - brand new business that likely needs marketing help</span>
                      ) : place.reviewCount < 10 ? (
                        <span>Only {place.reviewCount} reviews - very new business building their presence</span>
                      ) : place.reviewCount < 50 ? (
                        <span>{place.reviewCount} reviews - newer business still establishing reputation</span>
                      ) : (
                        <span>Established business with {place.reviewCount} reviews</span>
                      )}
                      {!place.website && <span> | No website detected - opportunity for digital services</span>}
                      {place.rating && place.rating < 4 && <span> | Rating below 4.0 - may need reputation help</span>}
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-sm">
                      {place.phone && (
                        <a 
                          href={`tel:${place.phone}`}
                          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="h-3 w-3" />
                          {place.phone}
                        </a>
                      )}
                      {place.website && (
                        <a 
                          href={place.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe className="h-3 w-3" />
                          Website
                        </a>
                      )}
                      {place.website && !domainAges[place.placeId] && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => checkDomainAge(place.placeId, place.website!)}
                          data-testid={`button-check-domain-${place.placeId}`}
                        >
                          <Calendar className="h-3 w-3 mr-1" />
                          Check Domain Age
                        </Button>
                      )}
                      {domainAges[place.placeId]?.loading && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Checking...
                        </span>
                      )}
                      {domainAges[place.placeId]?.data && (
                        <Badge 
                          variant={domainAges[place.placeId].data.isNew ? "default" : "outline"}
                          className={domainAges[place.placeId].data.isNew ? "bg-green-600" : ""}
                        >
                          <Calendar className="h-3 w-3 mr-1" />
                          {domainAges[place.placeId].data.ageDescription}
                        </Badge>
                      )}
                      {domainAges[place.placeId]?.error && (
                        <span className="text-xs text-muted-foreground">
                          {domainAges[place.placeId].error}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => openAddLeadDialogGoogle(place)}
                    data-testid={`button-add-place-${place.placeId}`}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Lead
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ABR Results */}
      {dataSource === 'abr' && abrResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">
              Results ({abrResults.length})
            </h2>
          </div>

          <div className="grid gap-3">
            {abrResults.map((business) => (
              <Card 
                key={business.Abn} 
                className={`p-4 hover-elevate cursor-pointer transition-colors ${selectedAbn === business.Abn ? 'ring-2 ring-primary' : ''}`}
                onClick={() => handleViewAbnDetails(business.Abn)}
                data-testid={`card-business-${business.Abn}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{business.Name}</h3>
                      <Badge variant="outline" className="shrink-0">
                        {business.NameType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>ABN: {business.Abn}</span>
                      <span>{business.State} {business.Postcode}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`https://abr.business.gov.au/ABN/View?abn=${business.Abn}`, '_blank');
                      }}
                      data-testid={`button-view-abr-${business.Abn}`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddLeadDialogAbr(business);
                      }}
                      data-testid={`button-add-lead-${business.Abn}`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Lead
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ABN Details Panel */}
      {dataSource === 'abr' && selectedAbn && abnDetails && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Business Details</h2>
            <Badge variant={abnDetails.AbnStatus === 'Active' ? 'default' : 'secondary'}>
              {abnDetails.AbnStatus}
            </Badge>
          </div>
          
          {isLoadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Entity Name</Label>
                <p className="font-medium">{abnDetails.EntityName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">ABN</Label>
                <p className="font-medium">{abnDetails.Abn}</p>
              </div>
              {abnDetails.Acn && (
                <div>
                  <Label className="text-muted-foreground">ACN</Label>
                  <p className="font-medium">{abnDetails.Acn}</p>
                </div>
              )}
              <div>
                <Label className="text-muted-foreground">Entity Type</Label>
                <p className="font-medium">{abnDetails.EntityTypeName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Location</Label>
                <p className="font-medium">{abnDetails.AddressState} {abnDetails.AddressPostcode}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">GST Registered</Label>
                <p className="font-medium">{abnDetails.Gst || 'Not registered'}</p>
              </div>
              {abnDetails.BusinessName && abnDetails.BusinessName.length > 0 && (
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Business Names</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {abnDetails.BusinessName.map((name, i) => (
                      <Badge key={i} variant="outline">{name}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Empty State */}
      {!isSearching && 
        ((dataSource === 'google' && googleResults.length === 0) || 
         (dataSource === 'abr' && abrResults.length === 0)) && 
        !error && (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
            {dataSource === 'google' ? (
              <>
                <p>Search for businesses by location to find new leads</p>
                <p className="text-sm mt-2">Results show businesses with fewer reviews first (likely newer)</p>
              </>
            ) : (
              <>
                <p>Search for businesses by name or postcode to find new leads</p>
                <p className="text-sm mt-2">Results are sourced from the Australian Business Register</p>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Add Lead Dialog with Reason and AI Scripts */}
      <Dialog open={addLeadDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddLeadDialogOpen(false);
          setAddLeadData(null);
          setAddedReason('');
          setOutreachScripts(null);
          setMatchedRejection(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-add-lead">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Lead to Pipeline
            </DialogTitle>
            <DialogDescription>
              Add {addLeadData?.businessName} to your sales pipeline
            </DialogDescription>
          </DialogHeader>

          {addLeadData && (
            <div className="space-y-6">
              {/* Previously Rejected Warning */}
              {matchedRejection && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg" data-testid="alert-previously-rejected">
                  <div className="flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="font-medium text-amber-800 dark:text-amber-200">Previously Marked Not Interested</h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        This business was rejected on{' '}
                        {matchedRejection.rejectedAt instanceof Date 
                          ? matchedRejection.rejectedAt.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
                          : new Date(matchedRejection.rejectedAt).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        .
                      </p>
                      {matchedRejection.reason && (
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          <strong>Reason:</strong> {matchedRejection.reason}
                        </p>
                      )}
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        You can still add this lead if circumstances have changed.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Business Summary */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h3 className="font-medium">{addLeadData.businessName}</h3>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  {addLeadData.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {addLeadData.location}
                    </span>
                  )}
                  {addLeadData.phone && (
                    <a 
                      href={`tel:${addLeadData.phone}`}
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="h-3 w-3" />
                      {addLeadData.phone}
                    </a>
                  )}
                  {addLeadData.website && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {addLeadData.website}
                    </span>
                  )}
                  {addLeadData.rating && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {addLeadData.rating}/5 ({addLeadData.reviewCount} reviews)
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  {addLeadData.isLikelyNew && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Likely New
                    </Badge>
                  )}
                  {addLeadData.abn && (
                    <Badge variant="outline">ABN: {addLeadData.abn}</Badge>
                  )}
                  <Badge variant="outline">
                    {addLeadData.type === 'abr' ? 'ABR' : 'Google'}
                  </Badge>
                </div>
              </div>

              {/* Reason for Adding */}
              <div className="space-y-2">
                <Label htmlFor="addedReason" className="text-sm font-medium">
                  Why are you adding this lead? <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="addedReason"
                  value={addedReason}
                  onChange={(e) => setAddedReason(e.target.value)}
                  placeholder="e.g., New business in my territory, needs help with digital marketing..."
                  className="min-h-[80px]"
                  data-testid="input-added-reason"
                />
                <p className="text-xs text-muted-foreground">
                  This helps generate personalized outreach scripts
                </p>
              </div>

              {/* Generate Scripts Button */}
              {!outreachScripts && (
                <Button
                  onClick={generateOutreachScripts}
                  disabled={!addedReason.trim() || isGeneratingScripts}
                  className="w-full gap-2"
                  data-testid="button-generate-scripts"
                >
                  {isGeneratingScripts ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating AI Scripts...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Outreach Scripts
                    </>
                  )}
                </Button>
              )}

              {/* Outreach Scripts */}
              {outreachScripts && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h4 className="font-medium">AI-Generated Outreach Scripts</h4>
                    <Badge variant="outline" className="text-xs">
                      NEPQ / Jeb Blount / Chris Voss
                    </Badge>
                  </div>

                  <Tabs value={activeScriptTab} onValueChange={(v) => setActiveScriptTab(v as 'text' | 'email' | 'call')}>
                    <TabsList className="w-full justify-start">
                      <TabsTrigger value="text" className="gap-1" data-testid="tab-script-text">
                        <MessageSquare className="h-3 w-3" />
                        Text
                      </TabsTrigger>
                      <TabsTrigger value="email" className="gap-1" data-testid="tab-script-email">
                        <Mail className="h-3 w-3" />
                        Email
                      </TabsTrigger>
                      <TabsTrigger value="call" className="gap-1" data-testid="tab-script-call">
                        <Phone className="h-3 w-3" />
                        Call
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="text" className="mt-3">
                      <div className="relative">
                        <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                          {outreachScripts.textScript}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-7 w-7"
                          onClick={() => copyToClipboard(outreachScripts.textScript, 'Text')}
                          data-testid="button-copy-text-script"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="email" className="mt-3">
                      <div className="relative">
                        <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                          {outreachScripts.emailScript}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-7 w-7"
                          onClick={() => copyToClipboard(outreachScripts.emailScript, 'Email')}
                          data-testid="button-copy-email-script"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="call" className="mt-3">
                      <div className="relative">
                        <ScrollArea className="h-48">
                          <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap pr-8">
                            {outreachScripts.callScript}
                          </div>
                        </ScrollArea>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-7 w-7"
                          onClick={() => copyToClipboard(outreachScripts.callScript, 'Call')}
                          data-testid="button-copy-call-script"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateOutreachScripts}
                    disabled={isGeneratingScripts}
                    className="gap-1"
                    data-testid="button-regenerate-scripts"
                  >
                    {isGeneratingScripts ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Regenerate
                  </Button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setAddLeadDialogOpen(false)}
                  className="flex-1"
                  data-testid="button-cancel-add-lead"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmAddLead}
                  disabled={!addedReason.trim() || isSavingLead}
                  className="flex-1 gap-2"
                  data-testid="button-confirm-add-lead"
                >
                  {isSavingLead ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add to Pipeline
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
