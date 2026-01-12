import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Search, Building2, MapPin, Calendar, Plus, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export default function ResearchPage() {
  const dispatch = useDispatch();
  const { orgId, user, authReady } = useAuth();
  const { toast } = useToast();
  
  const [searchType, setSearchType] = useState<'name' | 'postcode'>('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<ABRBusinessResult[]>([]);
  const [selectedAbn, setSelectedAbn] = useState<string | null>(null);
  const [abnDetails, setAbnDetails] = useState<ABNDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [addingAbn, setAddingAbn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setError(null);
    setResults([]);
    setSelectedAbn(null);
    setAbnDetails(null);
    
    try {
      const endpoint = searchType === 'name' 
        ? `/api/abr/search-name?name=${encodeURIComponent(searchQuery)}&maxResults=50`
        : `/api/abr/search-postcode?postcode=${encodeURIComponent(searchQuery)}&maxResults=100`;
      
      const response = await fetch(endpoint);
      const data: ABRSearchResponse = await response.json();
      
      if (!response.ok) {
        throw new Error((data as any).error || 'Search failed');
      }
      
      if (data.Names && data.Names.length > 0) {
        // Filter to only active ABNs
        const activeResults = data.Names.filter(b => b.AbnStatus === 'Active' || b.IsCurrent);
        setResults(activeResults);
        
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

  const handleViewDetails = async (abn: string) => {
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

  const handleAddAsLead = async (business: ABRBusinessResult) => {
    if (!orgId || !user || !authReady) {
      toast({
        title: 'Error',
        description: 'Please sign in to add leads',
        variant: 'destructive',
      });
      return;
    }
    
    setAddingAbn(business.Abn);
    
    try {
      const newLead: Lead = {
        id: uuidv4(),
        userId: user.uid,
        companyName: business.Name,
        contactName: '',
        email: '',
        phone: '',
        stage: 'suspect',
        value: 0,
        notes: `ABN: ${business.Abn}\nState: ${business.State}\nPostcode: ${business.Postcode}`,
        tags: ['ABR Research'],
        lastContactedAt: null,
        nextFollowUpAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
        source: 'ABR Research',
        nurtureMode: 'none',
        nurtureStatus: 'not_started',
        nepqStage: 0,
        regionId: null,
        regionName: null,
        areaId: null,
        areaName: null,
        territoryKey: null,
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
      setAddingAbn(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold" data-testid="text-research-title">Leads Research</h1>
        <p className="text-sm text-muted-foreground">
          Search for newly registered Australian businesses using the ABR database
        </p>
      </div>

      <Card className="p-6">
        <Tabs value={searchType} onValueChange={(v) => setSearchType(v as 'name' | 'postcode')}>
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
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  data-testid="input-search-name"
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} data-testid="button-search">
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
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  data-testid="input-search-postcode"
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} data-testid="button-search-postcode">
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Search
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      {error && (
        <Card className="p-4 bg-destructive/10 border-destructive/20">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        </Card>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">
              Results ({results.length})
            </h2>
          </div>

          <div className="grid gap-3">
            {results.map((business) => (
              <Card 
                key={business.Abn} 
                className={`p-4 hover-elevate cursor-pointer transition-colors ${selectedAbn === business.Abn ? 'ring-2 ring-primary' : ''}`}
                onClick={() => handleViewDetails(business.Abn)}
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
                        handleAddAsLead(business);
                      }}
                      disabled={addingAbn === business.Abn}
                      data-testid={`button-add-lead-${business.Abn}`}
                    >
                      {addingAbn === business.Abn ? (
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

      {selectedAbn && abnDetails && (
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

      {!isSearching && results.length === 0 && !error && (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>Search for businesses by name or postcode to find new leads</p>
            <p className="text-sm mt-2">Results are sourced from the Australian Business Register</p>
          </div>
        </Card>
      )}
    </div>
  );
}
