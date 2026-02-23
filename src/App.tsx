import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, parseISO, getDay } from 'date-fns';
import Holidays from 'date-holidays';
import { Calendar, Check, Info, User, Shield, LogOut, ArrowLeft, UserPlus, AlertCircle, Settings, Trash2 } from 'lucide-react';

// Types
interface Person {
  id: string;
  name: string;
  color: string;
}

interface ViewConfig {
  showHolidays: boolean;
  countries: string[];
  conflictMode: 'none' | 'any' | 'all';
  startMonth: 4;
  endMonth: 8;
}

// Modes: 'login' | 'personal' | 'admin' | 'admin-login'
type AppMode = 'login' | 'personal' | 'admin' | 'admin-login';

export default function App() {
  const [mode, setMode] = useState<AppMode>('personal'); // Changed initial mode to 'personal' for the new login flow
  const [currentUser, setCurrentUser] = useState<Person | null>(null);
  const [people, setPeople] = useState<Person[]>([]);

  // Admin Auth
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Data state
  const [personalUnavailability, setPersonalUnavailability] = useState<string[]>([]);
  const [allUnavailability, setAllUnavailability] = useState<Record<string, string[]>>({});

  // Login state
  const [loginForm, setLoginForm] = useState({ name: '', pin: '' });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const [viewConfig, setViewConfig] = useState<ViewConfig>({
    showHolidays: true,
    countries: ['DE', 'LU'],
    conflictMode: 'any',
    startMonth: 4,
    endMonth: 8
  });

  const [viewType, setViewType] = useState<'month' | 'day'>('month');
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  const [drag, setDrag] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const hasMoved = React.useRef(false);

  // Helper functions for data fetching
  const fetchPeople = async () => {
    if (mode !== 'admin') return; // Don't fetch the full list for regular users
    try {
      const res = await fetch('/api/people');
      const data = await res.json();
      setPeople(data);
    } catch (err) {
      console.error("Failed to fetch people", err);
    }
  };

  const fetchAvailability = async (userId: string) => {
    try {
      const res = await fetch(`/api/availability/${userId}`);
      const data = await res.json();
      setPersonalUnavailability(data);
    } catch (err) {
      console.error("Failed to fetch personal availability", err);
    }
  };

  // Initial data fetch and user login check on mount
  useEffect(() => {
    const init = async () => {
      const savedUser = localStorage.getItem('jga_user');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
          await fetchAvailability(user.id);
        } catch (e) {
          localStorage.removeItem('jga_user');
        }
      }
      if (mode === 'admin') await fetchPeople();
      setIsInitializing(false);
    };
    init();
  }, [mode]);

  // Fetch data when mode/user changes
  useEffect(() => {
    if (mode === 'personal' && currentUser) {
      fetchAvailability(currentUser.id);
    } else if (mode === 'admin') {
      fetchPeople();
      fetch('/api/availability')
        .then(res => res.json())
        .then(data => setAllUnavailability(data))
        .catch(err => console.error("Failed to fetch all availability", err));
    }
  }, [mode, currentUser]);

  const holidays = useMemo(() => {
    const hd = new Holidays();
    const map: Record<string, string[]> = {};
    viewConfig.countries.forEach(c => {
      hd.init(c);
      hd.getHolidays(2026).forEach(h => {
        const d = h.date.split(' ')[0];
        const nameWithPrefix = `[${c}] ${h.name}`;
        if (!map[d]) map[d] = [];
        if (!map[d].includes(nameWithPrefix)) map[d].push(nameWithPrefix);
      });
    });
    if (!map['2026-09-05']) map['2026-09-05'] = [];
    if (!map['2026-09-05'].includes('💍 Wedding Day')) map['2026-09-05'].push('💍 Wedding Day');
    return map;
  }, [viewConfig.countries]);

  const months = useMemo(() => {
    const arr = [];
    for (let i = viewConfig.startMonth; i <= viewConfig.endMonth; i++) {
      arr.push(new Date(2026, i, 1));
    }
    return arr;
  }, [viewConfig.startMonth, viewConfig.endMonth]);

  const lastToggle = React.useRef<{ date: string, time: number } | null>(null);

  const toggleDate = async (dateStr: string) => {
    if (mode === 'personal' && currentUser) {
      // Prevent double-firing (especially if MouseUp and Click both trigger)
      if (lastToggle.current && lastToggle.current.date === dateStr && (Date.now() - lastToggle.current.time) < 300) {
        return;
      }
      lastToggle.current = { date: dateStr, time: Date.now() };

      const isUnavailable = personalUnavailability.includes(dateStr);

      // Optimistic upate based on current exact state
      setPersonalUnavailability(prev => {
        const currentlyUnavailable = prev.includes(dateStr);
        return currentlyUnavailable ? prev.filter(d => d !== dateStr) : [...prev, dateStr];
      });

      // API call (use the direct variable)
      try {
        await fetch(`/api/availability/${currentUser.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateStr, available: isUnavailable })
        });
      } catch (e) {
        console.error("API update failed", e);
        // Fallback? Maybe re-fetch availability to be safe
        fetchAvailability(currentUser.id);
      }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.name || !loginForm.pin) return;

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: loginForm.name, passcode: loginForm.pin })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Login failed');
      }

      const user = await res.json();
      setCurrentUser(user);
      localStorage.setItem('jga_user', JSON.stringify(user));
      await fetchAvailability(user.id);
      await fetchPeople(); // Update local people list to include new user if created
      setMode('personal'); // Ensure mode is set to personal after successful login
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('jga_user');
    setPersonalUnavailability([]);
    setMode('personal'); // Go back to personal mode, which will show the login UI
  };

  const handleDragStart = (dateStr: string) => {
    if (mode === 'personal' && currentUser) {
      setDrag({ start: dateStr, end: dateStr });
      hasMoved.current = false;
    }
  };

  const handleDragEnter = (dateStr: string) => {
    if (drag.start && mode === 'personal' && currentUser) {
      if (dateStr !== drag.start) {
        hasMoved.current = true;
      }
      setDrag(prev => ({ ...prev, end: dateStr }));
    }
  };

  const finalizeDrag = async () => {
    if (drag.start && drag.end && mode === 'personal' && currentUser) {
      const start = drag.start < drag.end ? drag.start : drag.end;
      const end = drag.start < drag.end ? drag.end : drag.start;

      // Only process if it was an actual range drag, not a single click
      if (start === end) {
        setDrag({ start: null, end: null });
        if (!hasMoved.current) {
          // Explicitly call toggleDate here for desktop clicks, because setting drag state
          // to null can cause a re-render that swallows the native onClick event.
          toggleDate(start);
        }
        return;
      }

      const range = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map(d => format(d, 'yyyy-MM-dd'));

      // Add all dates in range
      const newDates = range.filter(d => !personalUnavailability.includes(d));

      if (newDates.length > 0) {
        setPersonalUnavailability(prev => [...prev, ...newDates]);

        // Send requests in parallel (could be optimized to bulk endpoint)
        await Promise.all(newDates.map(date =>
          fetch(`/api/availability/${currentUser.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, available: false })
          })
        ));
      }
    }
    setDrag({ start: null, end: null });
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'Dominic') {
      setMode('admin');
      setAdminPassword('');
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const handleDeletePerson = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/people/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete person');

      // Refresh data
      await fetchPeople();
      if (mode === 'admin') {
        fetch('/api/availability')
          .then(res => res.json())
          .then(data => setAllUnavailability(data));
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete member.");
    }
  };

  const exportData = () => {
    const data = {
      people,
      availability: allUnavailability
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'availability-2026-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- RENDER HELPERS ---

  if (mode === 'admin-login') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-50 p-4 rounded-full">
              <Shield className="text-indigo-600 w-10 h-10" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Admin Access</h1>
          <p className="text-center text-slate-500 mb-6">Please enter the password to continue.</p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value);
                  setPasswordError(false);
                }}
                placeholder="Password"
                className={`w-full px-4 py-3 rounded-xl border ${passwordError ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-indigo-200'} focus:outline-none focus:ring-4 transition-all`}
                autoFocus
              />
              {passwordError && <p className="text-red-500 text-xs mt-2 font-medium ml-1">Incorrect password</p>}
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
            >
              Unlock
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('personal');
                setAdminPassword('');
                setPasswordError(false);
                window.location.reload(); // Hard reload to clear any cached admin data from memory
              }}
              className="w-full text-slate-400 hover:text-slate-600 text-sm font-medium py-2"
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 font-sans text-slate-900" onMouseUp={finalizeDrag}>
      {/* Landing / Welcome Screen */}
      {!currentUser && mode === 'personal' && !isInitializing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-indigo-600 px-8 py-10 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full opacity-10">
                <div className="absolute -top-10 -left-10 w-40 h-40 bg-white rounded-full blur-3xl" />
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white rounded-full blur-3xl" />
              </div>

              <div className="relative z-10">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl ring-1 ring-white/30">
                  <UserPlus className="text-white" size={32} />
                </div>
                <h2 className="text-3xl font-black text-white mb-2 leading-tight">Welcome to JGA 26</h2>
                <p className="text-indigo-100 text-sm font-medium opacity-80">Join the coordination plan</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Your Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter your name..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 placeholder:text-slate-300"
                    value={loginForm.name}
                    onChange={e => setLoginForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Secure 4-Digit PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    required
                    placeholder="Create or enter PIN..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 placeholder:text-slate-300 tracking-widest"
                    value={loginForm.pin}
                    onChange={e => setLoginForm(prev => ({ ...prev, pin: e.target.value }))}
                  />
                </div>
              </div>

              {loginError && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex gap-3 text-red-600 animate-in slide-in-from-top-2 duration-300">
                  <AlertCircle size={20} className="shrink-0" />
                  <p className="text-xs font-bold leading-relaxed">{loginError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isLoggingIn ? 'SECURELY JOINING...' : 'CONTINUE TO CALENDAR'}
              </button>

              <div className="text-center">
                <p className="text-[10px] leading-relaxed text-slate-400 font-bold uppercase tracking-wider">
                  Entering a new name will create a profile.
                </p>
              </div>
            </form>
            <div className="mt-0 pt-6 border-t border-slate-100">
              <button
                onClick={() => setMode('admin-login')}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors py-2"
              >
                <Shield size={14} />
                Admin View
              </button>
            </div>
          </div>
        </div>
      )}

      {isInitializing && (
        <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Waking up the database...</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-indigo-100 shadow-lg">
            <Calendar className="text-white" size={24} />
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tight text-slate-800 hidden sm:block">JGA Baudi 2026</h1>
            <h1 className="font-black text-xl tracking-tight text-slate-800 sm:hidden">JGA 26</h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {mode === 'admin' && (
            <div className="hidden lg:flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setMode('personal')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'personal' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                MY DATES
              </button>
              <button
                onClick={() => setMode('admin')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all bg-white shadow-sm text-amber-600`}
              >
                TEAM VIEW
              </button>
            </div>
          )}

          {currentUser && (
            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-full border border-slate-200">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm" style={{ backgroundColor: currentUser.color }}>
                {currentUser.name.charAt(0)}
              </div>
              <span className="text-xs font-bold text-slate-700 hidden md:block">{currentUser.name}</span>
              <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors">
                <LogOut size={16} />
              </button>
            </div>
          )}

          <button
            onClick={() => setShowMobileSettings(true)}
            className="lg:hidden p-2 bg-slate-100 rounded-full text-slate-600 border border-slate-200 shadow-sm"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (Only for Admin or Personal Info) */}
        <aside className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 overflow-y-auto shrink-0 hidden lg:flex">
          {mode === 'admin' ? (
            <section>
              <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Team Overview</h3>
              <div className="space-y-2">
                {people.map(p => (
                  <div key={p.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center gap-3 group/item">
                    <div className="w-4 h-4 rounded-full shadow-sm ring-1 ring-black/5" style={{ backgroundColor: p.color }} />
                    <span className="text-sm font-bold text-slate-700 flex-1">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400">
                        {(allUnavailability[p.id] || []).length} days
                      </span>
                      <button
                        onClick={() => handleDeletePerson(p.id, p.name)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1 opacity-0 group-hover/item:opacity-100"
                        title="Delete Member"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section>
              <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Instructions</h3>
              <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                <div className="flex gap-2 text-indigo-700 mb-2 items-center">
                  <Info size={16} />
                  <span className="text-xs font-bold">How to use</span>
                </div>
                <p className="text-sm text-indigo-900/80 leading-relaxed mb-2">
                  Click on dates you are <b>NOT</b> available.
                </p>
                <p className="text-sm text-indigo-900/80 leading-relaxed">
                  You can also <b>drag</b> across multiple days to select a range.
                </p>
              </div>
            </section>
          )}

          <section className="border-t border-slate-100 pt-6">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">View Controls</h3>
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold text-slate-400 mb-2">VIEW MODE</p>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  {(['month', 'day'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setViewType(v)}
                      className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${viewType === v
                        ? 'bg-white shadow-sm text-indigo-600'
                        : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                      {v.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={viewConfig.showHolidays}
                  onChange={e => setViewConfig(s => ({ ...s, showHolidays: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-semibold text-slate-600 group-hover:text-slate-800 transition">Show Holidays</span>
              </label>

              <div>
                <p className="text-[10px] font-bold text-slate-400 mb-2">COUNTRIES</p>
                <div className="flex gap-2 flex-wrap">
                  {['DE', 'LU', 'FR', 'US', 'GB'].map(c => (
                    <button
                      key={c}
                      onClick={() => setViewConfig(s => ({
                        ...s,
                        countries: s.countries.includes(c) ? s.countries.filter(x => x !== c) : [...s.countries, c]
                      }))}
                      className={`text-[10px] font-bold px-3 py-1.5 rounded-full transition-colors ${viewConfig.countries.includes(c)
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'admin' && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 mb-2">HIGHLIGHT CONFLICTS</p>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    {(['none', 'any', 'all'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setViewConfig(s => ({ ...s, conflictMode: m }))}
                        className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${viewConfig.conflictMode === m
                          ? 'bg-white shadow-sm text-indigo-600'
                          : 'text-slate-400 hover:text-slate-600'
                          }`}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </aside>

        {/* Mobile Settings Overlay */}
        {showMobileSettings && (
          <div className="fixed inset-0 z-50 lg:hidden flex items-end">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowMobileSettings(false)} />
            <div className="relative w-full bg-white rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800">Settings & View</h3>
                <button
                  onClick={() => setShowMobileSettings(false)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
                >
                  <svg size={24} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>

              <div className="space-y-8 pb-8">
                <div>
                  <p className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">View Mode</p>
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                    {(['month', 'day'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => {
                          setViewType(v);
                          setShowMobileSettings(false);
                        }}
                        className={`flex-1 font-bold py-3 rounded-xl transition-all ${viewType === v
                          ? 'bg-white shadow-sm text-indigo-600'
                          : 'text-slate-400'
                          }`}
                      >
                        {v.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <span className="font-bold text-slate-700 block text-base">Show Holidays</span>
                    <span className="text-xs text-slate-500">Display public holidays in the calendar</span>
                  </div>
                  <div
                    className={`w-12 h-6 rounded-full relative transition-colors ${viewConfig.showHolidays ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    onClick={() => setViewConfig(s => ({ ...s, showHolidays: !s.showHolidays }))}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${viewConfig.showHolidays ? 'left-7' : 'left-1'}`} />
                  </div>
                </label>

                <div>
                  <p className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">Holidays Countries</p>
                  <div className="grid grid-cols-5 gap-2">
                    {['DE', 'LU', 'FR', 'US', 'GB'].map(c => (
                      <button
                        key={c}
                        onClick={() => setViewConfig(s => ({
                          ...s,
                          countries: s.countries.includes(c) ? s.countries.filter(x => x !== c) : [...s.countries, c]
                        }))}
                        className={`font-bold py-3 rounded-xl transition-all border ${viewConfig.countries.includes(c)
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                          : 'bg-white border-slate-200 text-slate-500'
                          }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === 'admin' && (
                  <div>
                    <p className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">Highlight Conflicts</p>
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                      {(['none', 'any', 'all'] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setViewConfig(s => ({ ...s, conflictMode: m }))}
                          className={`flex-1 font-bold py-3 rounded-xl transition-all ${viewConfig.conflictMode === m
                            ? 'bg-white shadow-sm text-indigo-600'
                            : 'text-slate-400'
                            }`}
                        >
                          {m.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex gap-3 text-indigo-900/60">
                  <Info size={20} className="shrink-0 text-indigo-600" />
                  <p className="text-sm">Tap any day once to Mark/Unmark. Dragging is available on desktop computers.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Calendar Area */}
        <main className="flex-1 bg-slate-50 p-4 sm:p-8 overflow-y-auto overflow-x-hidden">
          <div className="max-w-7xl mx-auto pb-20">
            {viewType === 'month' ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {months.map(mDate => (
                  <div key={mDate.toISOString()} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100 font-bold text-slate-800 text-lg">
                      {format(mDate, 'MMMM yyyy')}
                    </div>

                    <div className="grid grid-cols-7 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center py-3 border-b border-slate-100 bg-white">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d}>{d}</div>)}
                    </div>

                    <div className="grid grid-cols-7 auto-rows-fr">
                      {/* Empty cells for start of month */}
                      {Array.from({ length: (getDay(startOfMonth(mDate)) + 6) % 7 }).map((_, i) => (
                        <div key={`empty-${i}`} className="min-h-[6rem] bg-slate-50/30 border-b border-r border-slate-50" />
                      ))}

                      {/* Days */}
                      {eachDayOfInterval({ start: startOfMonth(mDate), end: endOfMonth(mDate) }).map(day => {
                        const dStr = format(day, 'yyyy-MM-dd');
                        const hols = viewConfig.showHolidays ? (holidays[dStr] || []) : [];
                        const isWknd = isWeekend(day);

                        // Logic differs based on mode
                        let isUnavailable = false;
                        let unavailablePeopleForDay: Person[] = [];
                        let isConflict = false;

                        if (mode === 'personal') {
                          isUnavailable = personalUnavailability.includes(dStr);
                        } else if (mode === 'admin') {
                          unavailablePeopleForDay = people.filter(p => {
                            const dates = allUnavailability[p.id] || [];
                            return dates.includes(dStr);
                          });

                          isConflict = viewConfig.conflictMode === 'any'
                            ? unavailablePeopleForDay.length > 0
                            : viewConfig.conflictMode === 'all'
                              ? unavailablePeopleForDay.length === people.length && people.length > 0
                              : false;
                        }

                        const isSelected = drag.start && drag.end && dStr >= (drag.start < drag.end ? drag.start : drag.end) && dStr <= (drag.start < drag.end ? drag.end : drag.start);

                        return (
                          <div
                            key={dStr}
                            onMouseDown={(e) => {
                              if ('ontouchstart' in window) return; // Prevent drag on touch devices
                              handleDragStart(dStr);
                            }}
                            onMouseEnter={() => {
                              if ('ontouchstart' in window) return;
                              handleDragEnter(dStr);
                            }}
                            onClick={(e) => {
                              if (hasMoved.current) return;
                              e.preventDefault();
                              e.stopPropagation();
                              toggleDate(dStr);
                            }}
                            className={`
                              min-h-[6rem] p-2 border-b border-r border-slate-100 relative group transition-colors select-none
                              ${isWknd ? 'bg-slate-50/50' : 'bg-white'}
                              ${mode === 'personal' && (isUnavailable || isSelected) ? 'bg-red-50 ring-inset ring-red-100' : ''}
                              ${mode === 'personal' && !isUnavailable && !isSelected ? 'hover:bg-slate-50 cursor-pointer' : ''}
                              ${mode === 'personal' && isUnavailable ? 'cursor-pointer hover:bg-red-100' : ''}
                              ${mode === 'admin' && isConflict ? 'bg-red-50' : ''}
                            `}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className={`
                                text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                                ${format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}
                              `}>
                                {format(day, 'd')}
                              </span>
                              {mode === 'admin' && isConflict && (
                                <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm animate-pulse" title="Conflict detected" />
                              )}
                            </div>

                            {/* Holidays */}
                            {hols.length > 0 && (
                              <div className="mb-2 flex flex-wrap gap-1">
                                {hols.map((h, i) => (
                                  <span key={i} className="text-[9px] leading-tight font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 truncate max-w-full block" title={h}>
                                    {h}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Personal Mode: Show "Unavailable" indicator */}
                            {mode === 'personal' && (isUnavailable || isSelected) && (
                              <div className="mt-2 flex justify-center">
                                <div className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-md w-full text-center">
                                  Unavailable
                                </div>
                              </div>
                            )}

                            {/* Admin Mode: Show Avatars */}
                            {mode === 'admin' && (
                              <div className="flex flex-wrap content-start gap-1">
                                {unavailablePeopleForDay.map(p => (
                                  <div
                                    key={p.id}
                                    className="w-5 h-5 rounded-full shadow-sm ring-1 ring-white flex items-center justify-center text-[8px] font-bold text-white transition-transform hover:scale-110 hover:z-10"
                                    style={{ backgroundColor: p.color }}
                                    title={p.name}
                                  >
                                    {p.name.charAt(0)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-12">
                {months.map(mDate => (
                  <div key={mDate.toISOString()}>
                    <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-4">
                      {format(mDate, 'MMMM yyyy')}
                      <div className="h-px bg-slate-200 flex-1" />
                    </h2>

                    <div className="space-y-4">
                      {eachDayOfInterval({ start: startOfMonth(mDate), end: endOfMonth(mDate) }).map(day => {
                        const dStr = format(day, "yyyy-MM-dd");
                        const hols = viewConfig.showHolidays ? (holidays[dStr] || []) : [];
                        const isWknd = isWeekend(day);

                        let isUnavailable = false;
                        let unavailablePeopleForDay: Person[] = [];
                        if (mode === 'personal') {
                          isUnavailable = personalUnavailability.includes(dStr);
                        } else if (mode === 'admin') {
                          unavailablePeopleForDay = people.filter(p => (allUnavailability[p.id] || []).includes(dStr));
                        }

                        return (
                          <div
                            key={dStr}
                            onClick={() => toggleDate(dStr)}
                            className={`
                              bg-white rounded-2xl border transition-all p-4 flex gap-4 items-center cursor-pointer select-none
                              ${isUnavailable ? 'border-red-200 bg-red-50/30' : 'border-slate-100 hover:border-indigo-100 hover:bg-slate-50'}
                              ${isWknd ? 'ring-1 ring-inset ring-slate-100 ring-offset-0 shadow-sm' : ''}
                            `}
                          >
                            <div className="flex flex-col items-center justify-center w-14 shrink-0 border-r border-slate-100 pr-4">
                              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                {format(day, 'EEE')}
                              </span>
                              <span className={`
                                text-lg font-black
                                ${format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'text-indigo-600' : 'text-slate-700'}
                              `}>
                                {format(day, 'd')}
                              </span>
                            </div>

                            <div className="flex-1 flex flex-col gap-1">
                              {hols.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {hols.map((h, i) => (
                                    <div key={i} className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-100">
                                      <span className="text-[10px] font-black">{h.toUpperCase()}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center justify-between">
                                <span className={`text-sm font-semibold ${isUnavailable ? 'text-red-700' : 'text-slate-500'}`}>
                                  {isUnavailable ? 'Unavailable' : 'Available'}
                                </span>

                                {mode === 'admin' && unavailablePeopleForDay.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Unavailable:</span>
                                    {unavailablePeopleForDay.map(p => (
                                      <div key={p.id} className="flex items-center gap-1.5 bg-white border border-slate-100 rounded-full px-2 py-1 shadow-sm">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                                        <span className="text-[10px] font-black text-slate-700">{p.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className={`
                              w-12 h-12 rounded-xl flex items-center justify-center transition-all
                              ${isUnavailable ? 'bg-red-100 text-red-600' : 'bg-slate-50 text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600'}
                            `}>
                              {isUnavailable ? (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                              ) : (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
