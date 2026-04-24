import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ArrowLeft, Loader2, Radio as RadioIcon, Search, Play, Pause, Volume2, Music, SkipBack, SkipForward, VolumeX, Lock, Unlock, Maximize2, Minimize2, Globe, Share2, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import Logo from '../components/Logo';
import WeatherWidget from '../components/WeatherWidget';
import DigitalClock from '../components/DigitalClock';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { usePlaylist } from '../context/PlaylistContext';
import { toast } from 'sonner';

interface Station {
  name: string;
  url: string;
  favicon: string;
  country: string;
}

export default function Radio() {
  const navigate = useNavigate();
  const { settings, isParentalUnlocked, unlockParental, lockParental, favorites, toggleFavorite } = usePlaylist();
  const [countries, setCountries] = useState<any[]>([]);
  const [selectedContinent, setSelectedContinent] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [currentStation, setCurrentStation] = useState<Station | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullScreenPlayer, setIsFullScreenPlayer] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [knownStations, setKnownStations] = useState<Station[]>(() => {
    const saved = localStorage.getItem('nova_known_radio_stations');
    return saved ? JSON.parse(saved) : [];
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (stations.length > 0) {
      setKnownStations(prev => {
        const newStations = stations.filter(s => !prev.some(p => p.url === s.url));
        if (newStations.length === 0) return prev;
        const updated = [...prev, ...newStations].slice(-500); // Keep last 500 known stations
        localStorage.setItem('nova_known_radio_stations', JSON.stringify(updated));
        return updated;
      });
    }
  }, [stations]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  const CONTINENT_MAP: Record<string, string[]> = {
    'Africa': ['Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cameroon', 'Central African Republic', 'Chad', 'Comoros', 'Congo', 'Cote d\'Ivoire', 'Djibouti', 'Egypt', 'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Morocco', 'Mozambique', 'Namibia', 'Niger', 'Nigeria', 'Rwanda', 'Sao Tome and Principe', 'Senegal', 'Seychelles', 'Sierra Leone', 'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda', 'Zambia', 'Zimbabwe'],
    'Asia': ['Afghanistan', 'Armenia', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Bhutan', 'Brunei', 'Cambodia', 'China', 'Cyprus', 'Georgia', 'India', 'Indonesia', 'Iran', 'Iraq', 'Israel', 'Japan', 'Jordan', 'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Lebanon', 'Malaysia', 'Maldives', 'Mongolia', 'Myanmar', 'Nepal', 'North Korea', 'Oman', 'Pakistan', 'Palestine', 'Philippines', 'Qatar', 'Saudi Arabia', 'Singapore', 'South Korea', 'Sri Lanka', 'Syria', 'Taiwan', 'Tajikistan', 'Thailand', 'Timor-Leste', 'Turkey', 'Turkmenistan', 'United Arab Emirates', 'Uzbekistan', 'Vietnam', 'Yemen'],
    'Europe': ['Albania', 'Andorra', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herzegovina', 'Bulgaria', 'Croatia', 'Czech Republic', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Monaco', 'Montenegro', 'Netherlands', 'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania', 'San Marino', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom', 'Vatican City'],
    'North America': ['Antigua and Barbuda', 'Bahamas', 'Barbados', 'Belize', 'Canada', 'Costa Rica', 'Cuba', 'Dominica', 'Dominican Republic', 'El Salvador', 'Grenada', 'Guatemala', 'Haiti', 'Honduras', 'Jamaica', 'Mexico', 'Nicaragua', 'Panama', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Trinidad and Tobago', 'United States'],
    'South America': ['Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela'],
    'Oceania': ['Australia', 'Fiji', 'Kiribati', 'Marshall Islands', 'Micronesia', 'Nauru', 'New Zealand', 'Palau', 'Papua New Guinea', 'Samoa', 'Solomon Islands', 'Tonga', 'Tuvalu', 'Vanuatu']
  };

  const handleGlobalSearch = async () => {
    setIsLoading(true);
    setSelectedCountry(null);
    setSelectedContinent(null);
    try {
      let url = `https://de1.api.radio-browser.info/json/stations/search?limit=100&order=clickcount`;
      if (globalSearch) url += `&name=${encodeURIComponent(globalSearch)}`;
      
      const res = await axios.get(url);
      setStations(res.data);
    } catch (err) {
      console.error('Error searching stations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    axios.get('https://de1.api.radio-browser.info/json/countries')
      .then(res => setCountries(res.data))
      .catch(err => console.error('Error fetching countries:', err));
  }, []);

  useEffect(() => {
    if (selectedCountry) {
      setIsLoading(true);
      axios.get(`https://de1.api.radio-browser.info/json/stations/bycountry/${selectedCountry}`)
        .then(res => {
          setStations(res.data);
          setIsLoading(false);
        })
        .catch(err => {
          console.error('Error fetching stations:', err);
          setIsLoading(false);
        });
    }
  }, [selectedCountry]);

  const playStation = (station: Station) => {
    if (audioRef.current) {
      setIsBuffering(true);
      const proxiedUrl = `/api/proxy?url=${encodeURIComponent(station.url)}`;
      audioRef.current.src = proxiedUrl;
      audioRef.current.play().catch(err => {
        console.error('Playback error:', err);
        setIsPlaying(false);
        setIsBuffering(false);
        toast.error(`Radio playback error: ${err.message || 'Unknown error'}`);
      });
      setCurrentStation(station);
      setIsPlaying(true);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(console.error);
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleNext = () => {
    if (!currentStation || filteredStations.length === 0) return;
    const currentIndex = filteredStations.findIndex(s => s.url === currentStation.url);
    const nextIndex = (currentIndex + 1) % filteredStations.length;
    playStation(filteredStations[nextIndex]);
  };

  const handlePrev = () => {
    if (!currentStation || filteredStations.length === 0) return;
    const currentIndex = filteredStations.findIndex(s => s.url === currentStation.url);
    const prevIndex = (currentIndex - 1 + filteredStations.length) % filteredStations.length;
    playStation(filteredStations[prevIndex]);
  };

  const filteredStations = useMemo(() => {
    let baseStations = stations;
    
    if (selectedCountry === 'fav') {
      baseStations = knownStations.filter(s => favorites.radio.includes(s.url));
    }

    let filtered = baseStations.filter(s => s.name.toLowerCase().includes(globalSearch.toLowerCase()));
    
    return filtered;
  }, [stations, knownStations, globalSearch, selectedCountry, favorites.radio]);

  const sidebarItems = useMemo(() => {
    if (!selectedContinent) {
      return [
        { id: 'fav', name: '⭐ Favorites', count: favorites.radio.length },
        { id: 'all', name: 'Global Search' },
        { id: 'Africa', name: '🌍 Africa' },
        { id: 'Asia', name: '🌏 Asia' },
        { id: 'Europe', name: '🇪🇺 Europe' },
        { id: 'North America', name: '🌎 North America' },
        { id: 'South America', name: '🌎 South America' },
        { id: 'Oceania', name: '🇦🇺 Oceania' },
        { id: 'Russia', name: '🇷🇺 Russia' }
      ];
    }

    const continentCountries = countries.filter(c => 
      CONTINENT_MAP[selectedContinent]?.includes(c.name)
    );

    // Filter out duplicate country names to avoid React key warnings
    const uniqueCountries = Array.from(new Map(continentCountries.map(c => [c.name, c])).values());

    // Sort countries alphabetically
    uniqueCountries.sort((a, b) => a.name.localeCompare(b.name));

    return [
      { id: 'back', name: '⬅️ Back to Regions' },
      ...uniqueCountries.map(c => ({
        id: c.name,
        name: c.name,
        count: c.stationcount
      }))
    ];
  }, [countries, selectedContinent]);

  const handleSidebarSelect = (id: string) => {
    if (id === 'back') {
      setSelectedContinent(null);
      setSelectedCountry(null);
      return;
    }

    if (id === 'all') {
      setSelectedContinent(null);
      setSelectedCountry(null);
      handleGlobalSearch();
      return;
    }

    if (id === 'fav') {
      setSelectedContinent(null);
      setSelectedCountry('fav');
      setStations([]); // Clear current stations to show favorites
      return;
    }

    if (id === 'Russia') {
      setSelectedContinent('Europe');
      setSelectedCountry('Russia');
      return;
    }

    if (!selectedContinent) {
      setSelectedContinent(id);
    } else {
      setSelectedCountry(id);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockParental(pinInput)) {
      toast.success('Parental content unlocked');
      setShowPinModal(false);
      setPinInput('');
    } else {
      toast.error('Incorrect PIN');
      setPinInput('');
    }
  };

  // TV remote navigation for Radio
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      if (!key) return;

      if (key === "back" || key === "backspace") {
        if (isFullScreenPlayer) {
          setIsFullScreenPlayer(false);
        } else if (selectedCountry) {
          setSelectedCountry(null);
        } else if (selectedContinent) {
          setSelectedContinent(null);
        } else {
          navigate("/");
        }
        return;
      }
      if (key === "playpause") {
        if (currentStation) {
          if (isPlaying) audioRef.current?.pause();
          else audioRef.current?.play().catch(() => {});
        }
        return;
      }
      if (key === "stop") {
        audioRef.current?.pause();
        return;
      }
    };
    window.addEventListener("tv-remote-key", handler);
    return () => window.removeEventListener("tv-remote-key", handler);
  }, [isFullScreenPlayer, selectedCountry, selectedContinent, currentStation, isPlaying, navigate]);

  return (
    <div className="flex flex-col h-screen text-white">
      {/* PIN Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowPinModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-col items-center gap-6">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                  <RadioIcon className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold">Parental Control</h3>
                  <p className="text-white/40 mt-1">Enter your 4-digit PIN to unlock restricted categories.</p>
                </div>
                <form onSubmit={handlePinSubmit} className="w-full flex flex-col gap-4">
                  <input 
                    type="password" 
                    maxLength={4}
                    autoFocus
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                    className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-3xl tracking-[1em] text-center w-full focus:outline-none focus:border-primary"
                    placeholder="••••"
                  />
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setShowPinModal(false)}
                      className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-primary hover:bg-primary/90 rounded-2xl font-bold transition-colors"
                    >
                      Unlock
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <audio 
        ref={audioRef} 
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onError={() => {
          setIsBuffering(false);
          setIsPlaying(false);
        }}
      />
      
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-black/40 border-b border-white/5">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="p-1 hover:bg-white/10 rounded-full">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <WeatherWidget />
            <nav className="flex items-center gap-6">
              <button onClick={() => navigate('/')} className="text-white/60 hover:text-white font-medium">Home</button>
              <button onClick={() => navigate('/live')} className="text-white/60 hover:text-white font-medium">Live</button>
              <button onClick={() => navigate('/movies')} className="text-white/60 hover:text-white font-medium">Movies</button>
              <button onClick={() => navigate('/series')} className="text-white/60 hover:text-white font-medium">Series</button>
              <button className="text-primary font-bold border-b-2 border-primary">Radio</button>
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {settings.parentalPin && (
            <button 
              onClick={() => isParentalUnlocked ? lockParental() : setShowPinModal(true)}
              className={cn(
                "p-2 rounded-full transition-all",
                isParentalUnlocked ? "bg-primary text-white" : "bg-white/5 text-white/40 hover:bg-white/10"
              )}
              title={isParentalUnlocked ? "Lock Parental Content" : "Unlock Parental Content"}
            >
              {isParentalUnlocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </button>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGlobalSearch()}
              className="bg-white/5 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:border-primary w-64"
            />
          </div>
          <DigitalClock />
          <Logo size="sm" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <Sidebar 
          items={sidebarItems} 
          activeId={selectedCountry || selectedContinent || 'all'} 
          onSelect={handleSidebarSelect}
          className="w-72"
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-black/10">
          <AnimatePresence>
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4"
              >
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold">Loading Radio Stations...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Radio Grid */}
          <div className="flex-1 p-8 overflow-y-auto pb-32">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredStations.map((s, index) => (
                <div 
                  key={`${s.url}-${index}`} 
                  className={cn(
                    "p-4 bg-white/5 border border-white/10 rounded-xl flex items-center gap-4 transition-all duration-200 hover:border-white/20 hover:bg-white/10 group cursor-pointer",
                    currentStation?.url === s.url && "ring-2 ring-primary border-transparent bg-primary/10"
                  )}
                  onClick={() => playStation(s)}
                >
                  <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
                    {s.favicon ? (
                      <img src={s.favicon} alt={s.name} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = '/radio.png')} />
                    ) : (
                      <RadioIcon className="w-6 h-6 text-white/40" />
                    )}
                  </div>
                  <div className="flex-1 text-left overflow-hidden">
                    <div className="font-semibold truncate group-hover:text-primary transition-colors">{s.name}</div>
                    <div className="text-xs text-white/40 truncate">{s.country}</div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite('radio', s.url);
                    }}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors group/star"
                  >
                    <Star className={cn(
                      "w-5 h-5 transition-all",
                      favorites.radio.includes(s.url) ? "fill-primary text-primary scale-110" : "text-white/20 group-hover/star:text-white/40"
                    )} />
                  </button>
                </div>
              ))}
            </div>
            
            {filteredStations.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center h-64 text-white/40">
                <Music className="w-12 h-12 mb-4 opacity-20" />
                <p>No radio stations found</p>
              </div>
            )}
          </div>

          {/* Persistent Player */}
          {currentStation && (
            <div className={cn(
              "absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/10 p-4 flex items-center gap-6 shadow-2xl z-[100] transition-all duration-500",
              isFullScreenPlayer ? "h-0 opacity-0 pointer-events-none translate-y-full" : "h-auto opacity-100"
            )}>
              <div className="flex items-center gap-4 w-1/3">
                <button 
                  onClick={() => setIsFullScreenPlayer(true)}
                  className="relative w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-lg group cursor-pointer hover:scale-105 transition-transform"
                >
                  {currentStation.favicon ? (
                    <img src={currentStation.favicon} alt={currentStation.name} className="w-full h-full object-cover" />
                  ) : (
                    <RadioIcon className="w-7 h-7 text-white/40" />
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Maximize2 className="w-5 h-5 text-white" />
                  </div>
                  {isPlaying && !isBuffering && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center gap-0.5">
                      {[1, 2, 3, 4].map((i) => (
                        <motion.div
                          key={i}
                          animate={{ height: [4, 16, 8, 12, 4] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
                          className="w-1 bg-primary rounded-full"
                        />
                      ))}
                    </div>
                  )}
                </button>
                <div className="overflow-hidden">
                  <div className="font-bold text-lg truncate text-white leading-tight">{currentStation.name}</div>
                  <div className="text-sm text-white/40 truncate">{currentStation.country}</div>
                </div>
                <button 
                  onClick={() => toggleFavorite('radio', currentStation.url)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors ml-2"
                >
                  <Star className={cn(
                    "w-5 h-5",
                    favorites.radio.includes(currentStation.url) ? "fill-primary text-primary" : "text-white/40"
                  )} />
                </button>
              </div>
              
              <div className="flex-1 flex flex-col items-center gap-1">
                <div className="flex items-center gap-6">
                  <button 
                    onClick={handlePrev}
                    className="p-2 text-white/40 hover:text-white transition-colors"
                  >
                    <SkipBack className="w-6 h-6 fill-current" />
                  </button>

                  <button 
                    onClick={togglePlay} 
                    className="p-4 bg-primary text-white rounded-full hover:bg-primary/90 transition-all active:scale-95 shadow-xl shadow-primary/20 relative group"
                  >
                    {isBuffering ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-8 h-8 fill-current" />
                    ) : (
                      <Play className="w-8 h-8 fill-current ml-1" />
                    )}
                  </button>

                  <button 
                    onClick={handleNext}
                    className="p-2 text-white/40 hover:text-white transition-colors"
                  >
                    <SkipForward className="w-6 h-6 fill-current" />
                  </button>
                </div>
              </div>
              
              <div className="w-1/3 flex justify-end items-center gap-4">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-white/40 hover:text-white transition-colors"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                </button>
                <div className="w-32 h-1.5 bg-white/10 rounded-full relative group cursor-pointer">
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      setVolume(parseInt(e.target.value));
                      setIsMuted(false);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div 
                    className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-100"
                    style={{ width: `${isMuted ? 0 : volume}%` }}
                  />
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ left: `calc(${isMuted ? 0 : volume}% - 6px)` }}
                  />
                </div>
                <button 
                  onClick={() => setIsFullScreenPlayer(true)}
                  className="p-2 text-white/40 hover:text-white transition-colors ml-2"
                  title="Full Screen Player"
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Full Screen Player UI */}
          <AnimatePresence>
            {isFullScreenPlayer && currentStation && (
              <motion.div 
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-0 z-[300] bg-black flex flex-col"
              >
                {/* Dynamic Background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  {currentStation.favicon ? (
                    <img 
                      src={currentStation.favicon} 
                      alt="" 
                      className="w-full h-full object-cover blur-[100px] opacity-30 scale-150"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 via-black to-zinc-900" />
                  )}
                  <div className="absolute inset-0 bg-black/40" />
                </div>

                {/* Header */}
                <header className="relative z-10 flex items-center justify-between p-8">
                  <button 
                    onClick={() => setIsFullScreenPlayer(false)}
                    className="p-4 bg-white/5 hover:bg-white/10 rounded-full backdrop-blur-md transition-all group"
                  >
                    <Minimize2 className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
                  </button>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                      <span className="text-white/40 text-sm font-bold uppercase tracking-widest">Now Playing</span>
                      <span className="text-primary font-mono text-xl">LIVE RADIO</span>
                    </div>
                    <Logo size="md" />
                  </div>
                </header>

                {/* Main Content */}
                <div className="flex-1 relative z-10 flex flex-col items-center justify-center px-8">
                  <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    {/* Visualizer & Cover */}
                    <div className="flex flex-col items-center gap-12">
                      <motion.div 
                        animate={isPlaying && !isBuffering ? { 
                          scale: [1, 1.02, 1],
                          rotate: [0, 1, -1, 0]
                        } : {}}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="relative w-64 h-64 md:w-80 md:h-80 rounded-[40px] overflow-hidden shadow-[0_0_50px_rgba(var(--primary-rgb),0.3)] border-4 border-white/10"
                      >
                        {currentStation.favicon ? (
                          <img src={currentStation.favicon} alt={currentStation.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                            <RadioIcon className="w-32 h-32 text-white/10" />
                          </div>
                        )}
                        {isBuffering && (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                            <Loader2 className="w-16 h-16 text-primary animate-spin" />
                          </div>
                        )}
                      </motion.div>

                      {/* Visualizer Bars */}
                      <div className="flex items-end gap-1.5 h-16">
                        {Array.from({ length: 24 }).map((_, i) => (
                          <motion.div
                            key={i}
                            animate={isPlaying && !isBuffering ? { 
                              height: [10, Math.random() * 60 + 10, 10] 
                            } : { height: 4 }}
                            transition={{ 
                              duration: 0.5 + Math.random(), 
                              repeat: Infinity, 
                              ease: "easeInOut",
                              delay: i * 0.05
                            }}
                            className="w-1.5 bg-primary rounded-full opacity-60"
                          />
                        ))}
                      </div>
                    </div>

                    {/* Info & Controls */}
                    <div className="flex flex-col gap-8 text-center lg:text-left">
                      <div>
                        <motion.h1 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-5xl md:text-7xl font-black text-white mb-4 leading-tight"
                        >
                          {currentStation.name}
                        </motion.h1>
                        <div className="flex items-center justify-center lg:justify-start gap-4 text-white/40">
                          <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                            <Globe className="w-4 h-4" />
                            <span className="text-sm font-medium">{currentStation.country}</span>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20 text-primary">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            <span className="text-xs font-bold uppercase tracking-widest">On Air</span>
                          </div>
                        </div>
                      </div>

                      {/* Large Controls */}
                      <div className="flex flex-col gap-8">
                        <div className="flex items-center justify-center lg:justify-start gap-8">
                          <button 
                            onClick={handlePrev}
                            className="p-6 bg-white/5 hover:bg-white/10 rounded-full transition-all hover:scale-110 active:scale-95"
                          >
                            <SkipBack className="w-10 h-10 text-white fill-current" />
                          </button>

                          <button 
                            onClick={togglePlay}
                            className="p-10 bg-primary text-white rounded-full hover:scale-110 active:scale-95 transition-all shadow-[0_0_50px_rgba(var(--primary-rgb),0.5)]"
                          >
                            {isBuffering ? (
                              <Loader2 className="w-12 h-12 animate-spin" />
                            ) : isPlaying ? (
                              <Pause className="w-12 h-12 fill-current" />
                            ) : (
                              <Play className="w-12 h-12 fill-current ml-2" />
                            )}
                          </button>

                          <button 
                            onClick={handleNext}
                            className="p-6 bg-white/5 hover:bg-white/10 rounded-full transition-all hover:scale-110 active:scale-95"
                          >
                            <SkipForward className="w-10 h-10 text-white fill-current" />
                          </button>
                        </div>

                        {/* Large Volume Slider */}
                        <div className="flex items-center gap-6 max-w-md mx-auto lg:mx-0">
                          <button 
                            onClick={() => setIsMuted(!isMuted)}
                            className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                          >
                            {isMuted || volume === 0 ? <VolumeX className="w-8 h-8 text-white" /> : <Volume2 className="w-8 h-8 text-white" />}
                          </button>
                          <div className="flex-1 h-3 bg-white/10 rounded-full relative group cursor-pointer">
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={isMuted ? 0 : volume}
                              onChange={(e) => {
                                setVolume(parseInt(e.target.value));
                                setIsMuted(false);
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div 
                              className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-100"
                              style={{ width: `${isMuted ? 0 : volume}%` }}
                            />
                            <div 
                              className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ left: `calc(${isMuted ? 0 : volume}% - 12px)` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <footer className="relative z-10 p-8 flex items-center justify-between border-t border-white/5 bg-black/20 backdrop-blur-sm">
                  <div className="flex items-center gap-8">
                    <div className="flex flex-col">
                      <span className="text-white/40 text-xs uppercase font-bold tracking-widest mb-1">Stream URL</span>
                      <span className="text-white/60 font-mono text-sm truncate max-w-md">{currentStation.url}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => toggleFavorite('radio', currentStation.url)}
                      className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors flex items-center gap-2"
                    >
                      <Star className={cn(
                        "w-5 h-5",
                        favorites.radio.includes(currentStation.url) ? "fill-primary text-primary" : "text-white"
                      )} />
                      <span className="font-bold text-sm">
                        {favorites.radio.includes(currentStation.url) ? 'Favorited' : 'Add to Favorites'}
                      </span>
                    </button>
                    <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors flex items-center gap-2">
                      <Share2 className="w-5 h-5" />
                      <span className="font-bold text-sm">Share Station</span>
                    </button>
                  </div>
                </footer>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
