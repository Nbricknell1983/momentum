import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Search, Building2, MapPin, Plus, Loader2, ExternalLink, AlertCircle, Star, Globe, Phone, Sparkles, Navigation } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { addLead } from '@/store';
import { createLead } from '@/lib/firestoreService';
import { v4 as uuidv4 } from 'uuid';
import type { Lead } from '@/lib/types';

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
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'cafe', label: 'Cafes' },
  { value: 'gym', label: 'Gyms & Fitness' },
  { value: 'beauty_salon', label: 'Beauty Salons' },
  { value: 'hair_salon', label: 'Hair Salons' },
  { value: 'dentist', label: 'Dentists' },
  { value: 'doctor', label: 'Medical Clinics' },
  { value: 'lawyer', label: 'Law Firms' },
  { value: 'accountant', label: 'Accountants' },
  { value: 'real_estate_agency', label: 'Real Estate' },
  { value: 'car_dealer', label: 'Car Dealers' },
  { value: 'auto_repair', label: 'Auto Repair' },
  { value: 'plumber', label: 'Plumbers' },
  { value: 'electrician', label: 'Electricians' },
  { value: 'roofing_contractor', label: 'Roofers' },
  { value: 'florist', label: 'Florists' },
  { value: 'pet_store', label: 'Pet Stores' },
  { value: 'veterinary_care', label: 'Vets' },
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
  const [googleBusinessType, setGoogleBusinessType] = useState('all');
  const [googleRadius, setGoogleRadius] = useState('50000');
  const [googleResults, setGoogleResults] = useState<GooglePlaceResult[]>([]);
  const [showOnlyNew, setShowOnlyNew] = useState(true);
  const [searchedLocation, setSearchedLocation] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  // Shared state
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      
      if (googleBusinessType !== 'all') {
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

  const handleAddAbrLead = async (business: ABRBusinessResult) => {
    if (!orgId || !user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to add leads',
        variant: 'destructive',
      });
      return;
    }
    
    setAddingId(business.Abn);
    
    try {
      const newLead: Lead = {
        id: uuidv4(),
        userId: user.uid,
        companyName: business.Name,
        territory: `${business.State} ${business.Postcode}`,
        contactName: '',
        email: '',
        phone: '',
        stage: 'suspect',
        mrr: 0,
        notes: `ABN: ${business.Abn}\nState: ${business.State}\nPostcode: ${business.Postcode}\nSource: ABR Research`,
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
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
        regionId: undefined,
        regionName: undefined,
        areaId: undefined,
        areaName: undefined,
        territoryKey: undefined,
      };
      
      const savedLead = await createLead(orgId, newLead, authReady);
      dispatch(addLead(savedLead));
      
      toast({
        title: 'Lead added',
        description: `${business.Name} has been added to your pipeline`,
      });
    } catch (err: any) {
      console.error('Error adding lead:', err);
      toast({
        title: 'Error',
        description: 'Failed to add lead',
        variant: 'destructive',
      });
    } finally {
      setAddingId(null);
    }
  };

  const handleAddGoogleLead = async (place: GooglePlaceResult) => {
    if (!orgId || !user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to add leads',
        variant: 'destructive',
      });
      return;
    }
    
    setAddingId(place.placeId);
    
    try {
      const notes = [
        `Source: Google Business Profile`,
        place.address ? `Address: ${place.address}` : null,
        place.phone ? `Phone: ${place.phone}` : null,
        place.website ? `Website: ${place.website}` : null,
        place.rating ? `Rating: ${place.rating}/5 (${place.reviewCount} reviews)` : null,
        `Google Place ID: ${place.placeId}`
      ].filter(Boolean).join('\n');

      const newLead: Lead = {
        id: uuidv4(),
        userId: user.uid,
        companyName: place.name,
        territory: place.address?.split(',').slice(-2).join(',').trim() || '',
        contactName: '',
        email: '',
        phone: place.phone || '',
        stage: 'suspect',
        mrr: 0,
        notes,
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
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
        regionId: undefined,
        regionName: undefined,
        areaId: undefined,
        areaName: undefined,
        territoryKey: undefined,
      };
      
      const savedLead = await createLead(orgId, newLead, authReady);
      dispatch(addLead(savedLead));
      
      toast({
        title: 'Lead added',
        description: `${place.name} has been added to your pipeline`,
      });
    } catch (err: any) {
      console.error('Error adding lead:', err);
      toast({
        title: 'Error',
        description: 'Failed to add lead',
        variant: 'destructive',
      });
    } finally {
      setAddingId(null);
    }
  };

  const filteredGoogleResults = showOnlyNew 
    ? googleResults.filter(r => r.isLikelyNew)
    : googleResults;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
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
                <Select value={googleBusinessType} onValueChange={setGoogleBusinessType}>
                  <SelectTrigger id="business-type" data-testid="select-business-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {place.phone}
                        </span>
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
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddGoogleLead(place)}
                    disabled={addingId === place.placeId}
                    data-testid={`button-add-place-${place.placeId}`}
                  >
                    {addingId === place.placeId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-3 w-3 mr-1" />
                        Add Lead
                      </>
                    )}
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
                        handleAddAbrLead(business);
                      }}
                      disabled={addingId === business.Abn}
                      data-testid={`button-add-lead-${business.Abn}`}
                    >
                      {addingId === business.Abn ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-3 w-3 mr-1" />
                          Add Lead
                        </>
                      )}
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
    </div>
  );
}
