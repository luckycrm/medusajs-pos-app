import { useState, useEffect } from 'react';
import { Store, Globe, MapPin, Rocket, CheckCircle2, Plus, ChevronRight, Loader2 } from 'lucide-react';
import { sdk } from '../lib/medusa';
import './Onboarding.css';

type Step = 'sales-channel' | 'region' | 'stock-location' | 'welcome';

const SETTINGS_KEYS = {
  salesChannelId: 'sales_channel_id',
  regionId: 'region_id',
  stockLocationId: 'stock_location_id',
} as const;

interface SalesChannel {
  id: string;
  name: string;
}

interface Region {
  id: string;
  name: string;
  currency_code: string;
}

interface StockLocation {
  id: string;
  name: string;
}

interface OnboardingProps {
  onComplete?: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState<Step>('sales-channel');
  const [salesChannels, setSalesChannels] = useState<SalesChannel[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [selectedSalesChannel, setSelectedSalesChannel] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedStockLocation, setSelectedStockLocation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', currency_code: '' });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [channelsRes, regionsRes, locationsRes] = await Promise.all([
        sdk.admin.salesChannel.list({ limit: 100 }),
        sdk.admin.region.list({ limit: 100 }),
        sdk.admin.stockLocation.list({ limit: 100 }),
      ]);

      setSalesChannels(channelsRes.sales_channels || []);
      setRegions(regionsRes.regions || []);
      setStockLocations(locationsRes.stock_locations || []);

      const storedSalesChannelId = localStorage.getItem(SETTINGS_KEYS.salesChannelId);
      const storedRegionId = localStorage.getItem(SETTINGS_KEYS.regionId);
      const storedStockLocationId = localStorage.getItem(SETTINGS_KEYS.stockLocationId);

      const hasStoredSalesChannel = Boolean(
        storedSalesChannelId && channelsRes.sales_channels?.some((channel) => channel.id === storedSalesChannelId),
      );
      const hasStoredRegion = Boolean(
        storedRegionId && regionsRes.regions?.some((region) => region.id === storedRegionId),
      );
      const hasStoredStockLocation = Boolean(
        storedStockLocationId && locationsRes.stock_locations?.some((location) => location.id === storedStockLocationId),
      );

      if (hasStoredSalesChannel) {
        setSelectedSalesChannel(storedSalesChannelId!);
      }

      if (hasStoredRegion) {
        setSelectedRegion(storedRegionId!);
      }

      if (hasStoredStockLocation) {
        setSelectedStockLocation(storedStockLocationId!);
      }

      if (channelsRes.sales_channels?.length === 0 || !hasStoredSalesChannel) {
        setCurrentStep('sales-channel');
      } else if (regionsRes.regions?.length === 0 || !hasStoredRegion) {
        setCurrentStep('region');
      } else if (locationsRes.stock_locations?.length === 0 || !hasStoredStockLocation) {
        setCurrentStep('stock-location');
      } else {
        setCurrentStep('welcome');
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSalesChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const { sales_channel } = await sdk.admin.salesChannel.create({ name: newItem.name });
      setSalesChannels([...salesChannels, sales_channel]);
      setSelectedSalesChannel(sales_channel.id);
      localStorage.setItem(SETTINGS_KEYS.salesChannelId, sales_channel.id);
      setShowCreateForm(false);
      setNewItem({ name: '', currency_code: '' });
      setCurrentStep('region');
    } catch (err) {
      console.error('Error creating sales channel:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const { region } = await sdk.admin.region.create({
        name: newItem.name,
        currency_code: newItem.currency_code,
        countries: [],
      });
      setRegions([...regions, region]);
      setSelectedRegion(region.id);
      localStorage.setItem(SETTINGS_KEYS.regionId, region.id);
      setShowCreateForm(false);
      setNewItem({ name: '', currency_code: '' });
      setCurrentStep('stock-location');
    } catch (err) {
      console.error('Error creating region:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateStockLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const { stock_location } = await sdk.admin.stockLocation.create({ name: newItem.name, address: {} });
      setStockLocations([...stockLocations, stock_location]);
      setSelectedStockLocation(stock_location.id);
      localStorage.setItem(SETTINGS_KEYS.stockLocationId, stock_location.id);
      setShowCreateForm(false);
      setNewItem({ name: '', currency_code: '' });
      setCurrentStep('welcome');
    } catch (err) {
      console.error('Error creating stock location:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleNextSalesChannel = () => {
    if (selectedSalesChannel) {
      localStorage.setItem(SETTINGS_KEYS.salesChannelId, selectedSalesChannel);
      setCurrentStep('region');
    }
  };

  const handleNextRegion = () => {
    if (selectedRegion) {
      localStorage.setItem(SETTINGS_KEYS.regionId, selectedRegion);
      setCurrentStep('stock-location');
    }
  };

  const handleNextStockLocation = () => {
    if (selectedStockLocation) {
      localStorage.setItem(SETTINGS_KEYS.stockLocationId, selectedStockLocation);
      setCurrentStep('welcome');
    }
  };

  const renderSalesChannelStep = () => (
    <div className="onboarding-card">
      <div className="onboarding-header">
        <div className="onboarding-icon-box">
          <Store className="onboarding-icon" />
        </div>
        <h1>Sales Channel</h1>
        <p>Select the point of sale channel for this device.</p>
      </div>

      <div className="onboarding-body">
        {salesChannels.length > 0 && !showCreateForm && (
          <div className="onboarding-selection-list">
            {salesChannels.map((channel) => (
              <button
                key={channel.id}
                className={`onboarding-item ${selectedSalesChannel === channel.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedSalesChannel(channel.id)}
              >
                <span className="onboarding-item-name">{channel.name}</span>
                {selectedSalesChannel === channel.id && <CheckCircle2 className="onboarding-item-check" />}
              </button>
            ))}
          </div>
        )}

        {showCreateForm ? (
          <form className="onboarding-form" onSubmit={handleCreateSalesChannel}>
            <div className="onboarding-form-group">
              <label>Channel Name</label>
              <input
                type="text"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                required
                placeholder="e.g., POS - Terminal 1"
                autoFocus
              />
            </div>
            <div className="onboarding-form-actions">
              <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
              <button type="submit" className="onboarding-btn onboarding-btn-primary" disabled={isCreating}>
                {isCreating ? <Loader2 className="onboarding-spin" /> : 'Create Channel'}
              </button>
            </div>
          </form>
        ) : (
          <button className="onboarding-add-btn" onClick={() => setShowCreateForm(true)}>
            <Plus size={18} />
            <span>Create New Sales Channel</span>
          </button>
        )}
      </div>

      <div className="onboarding-footer">
        <button
          className="onboarding-btn onboarding-btn-primary onboarding-btn-large"
          onClick={handleNextSalesChannel}
          disabled={!selectedSalesChannel}
        >
          <span>Continue</span>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );

  const renderRegionStep = () => (
    <div className="onboarding-card">
      <div className="onboarding-header">
        <div className="onboarding-icon-box">
          <Globe className="onboarding-icon" />
        </div>
        <h1>Region</h1>
        <p>Select the region for taxes and currency.</p>
      </div>

      <div className="onboarding-body">
        {regions.length > 0 && !showCreateForm && (
          <div className="onboarding-selection-list">
            {regions.map((region) => (
              <button
                key={region.id}
                className={`onboarding-item ${selectedRegion === region.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedRegion(region.id)}
              >
                <div className="onboarding-item-content">
                  <span className="onboarding-item-name">{region.name}</span>
                  <span className="onboarding-item-meta">{region.currency_code?.toUpperCase()}</span>
                </div>
                {selectedRegion === region.id && <CheckCircle2 className="onboarding-item-check" />}
              </button>
            ))}
          </div>
        )}

        {showCreateForm ? (
          <form className="onboarding-form" onSubmit={handleCreateRegion}>
            <div className="onboarding-form-group">
              <label>Region Name</label>
              <input
                type="text"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                required
                placeholder="e.g., North America"
              />
            </div>
            <div className="onboarding-form-group">
              <label>Currency Code</label>
              <input
                type="text"
                value={newItem.currency_code}
                onChange={(e) => setNewItem({ ...newItem, currency_code: e.target.value })}
                required
                placeholder="e.g., cad"
              />
            </div>
            <div className="onboarding-form-actions">
              <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
              <button type="submit" className="onboarding-btn onboarding-btn-primary" disabled={isCreating}>
                {isCreating ? <Loader2 className="onboarding-spin" /> : 'Create Region'}
              </button>
            </div>
          </form>
        ) : (
          <button className="onboarding-add-btn" onClick={() => setShowCreateForm(true)}>
            <Plus size={18} />
            <span>Create New Region</span>
          </button>
        )}
      </div>

      <div className="onboarding-footer">
        <button
          className="onboarding-btn onboarding-btn-primary onboarding-btn-large"
          onClick={handleNextRegion}
          disabled={!selectedRegion}
        >
          <span>Continue</span>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );

  const renderStockLocationStep = () => (
    <div className="onboarding-card">
      <div className="onboarding-header">
        <div className="onboarding-icon-box">
          <MapPin className="onboarding-icon" />
        </div>
        <h1>Inventory</h1>
        <p>Select the stock location for this terminal.</p>
      </div>

      <div className="onboarding-body">
        {stockLocations.length > 0 && !showCreateForm && (
          <div className="onboarding-selection-list">
            {stockLocations.map((location) => (
              <button
                key={location.id}
                className={`onboarding-item ${selectedStockLocation === location.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedStockLocation(location.id)}
              >
                <span className="onboarding-item-name">{location.name}</span>
                {selectedStockLocation === location.id && <CheckCircle2 className="onboarding-item-check" />}
              </button>
            ))}
          </div>
        )}

        {showCreateForm ? (
          <form className="onboarding-form" onSubmit={handleCreateStockLocation}>
            <div className="onboarding-form-group">
              <label>Location Name</label>
              <input
                type="text"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                required
                placeholder="e.g., Scarborough Store"
              />
            </div>
            <div className="onboarding-form-actions">
              <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
              <button type="submit" className="onboarding-btn onboarding-btn-primary" disabled={isCreating}>
                {isCreating ? <Loader2 className="onboarding-spin" /> : 'Create Location'}
              </button>
            </div>
          </form>
        ) : (
          <button className="onboarding-add-btn" onClick={() => setShowCreateForm(true)}>
            <Plus size={18} />
            <span>Create New Location</span>
          </button>
        )}
      </div>

      <div className="onboarding-footer">
        <button
          className="onboarding-btn onboarding-btn-primary onboarding-btn-large"
          onClick={handleNextStockLocation}
          disabled={!selectedStockLocation}
        >
          <span>Continue</span>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );

  const renderWelcomeStep = () => (
    <div className="onboarding-card welcome-card">
      <div className="onboarding-header">
        <div className="onboarding-icon-box success">
          <Rocket className="onboarding-icon" />
        </div>
        <h1>POS Ready</h1>
        <p>Your point of sale system is configured.</p>
      </div>

      <div className="onboarding-body">
        <div className="onboarding-features">
          <div className="onboarding-feature-item">
            <CheckCircle2 className="onboarding-feature-icon" />
            <span>Manage products and inventory</span>
          </div>
          <div className="onboarding-feature-item">
            <CheckCircle2 className="onboarding-feature-icon" />
            <span>Process customer orders instantly</span>
          </div>
          <div className="onboarding-feature-item">
            <CheckCircle2 className="onboarding-feature-icon" />
            <span>Synchronized with Medusa backend</span>
          </div>
        </div>
      </div>

      <div className="onboarding-footer">
        <button className="onboarding-btn onboarding-btn-primary onboarding-btn-large" onClick={() => onComplete?.()}>
          <span>Enter Dashboard</span>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="onboarding-wrapper">
        <div className="onboarding-loading">
          <Loader2 className="onboarding-spin-large" />
          <p>Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-wrapper">
      <div className="onboarding-container">
        <div className="onboarding-stepper">
          {[1, 2, 3].map((num) => (
            <div key={num} className="onboarding-step-indicator">
              <div
                className={`onboarding-step-dot ${
                  (num === 1 && currentStep !== 'welcome') ||
                  (num === 2 && (currentStep === 'region' || currentStep === 'stock-location')) ||
                  (num === 3 && currentStep === 'welcome')
                    ? 'is-active'
                    : ''
                }`}
              >
                {num}
              </div>
              {num < 3 && <div className="onboarding-step-line" />}
            </div>
          ))}
        </div>

        {currentStep === 'sales-channel' && renderSalesChannelStep()}
        {currentStep === 'region' && renderRegionStep()}
        {currentStep === 'stock-location' && renderStockLocationStep()}
        {currentStep === 'welcome' && renderWelcomeStep()}
      </div>
    </div>
  );
}
