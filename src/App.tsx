import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, parseISO, getDay } from 'date-fns';
import Holidays from 'date-holidays';
import { Calendar as CalIcon, Check, Info, User, Shield, LogOut, ArrowLeft } from 'lucide-react';

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
  const [mode, setMode] = useState<AppMode>('login');
  const [currentUser, setCurrentUser] = useState<Person | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  
  // Admin Auth
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Data state
  const [personalUnavailability, setPersonalUnavailability] = useState<string[]>([]);
  const [allUnavailability, setAllUnavailability] = useState<Record<string, string[]>>({});
  
  const [viewConfig, setViewConfig] = useState<ViewConfig>({ 
    showHolidays: true, 
    countries: ['DE', 'LU'], 
    conflictMode: 'any', 
    startMonth: 4, 
    endMonth: 8 
  });

  const [drag, setDrag] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });

  // Fetch people on mount
  useEffect(() => {
    fetch('/api/people')
      .then(res => res.json())
      .then(data => setPeople(data))
      .catch(err => console.error("Failed to fetch people", err));
  }, []);

  // Fetch data when mode/user changes
  useEffect(() => {
    if (mode === 'personal' && currentUser) {
      fetch(`/api/availability/${currentUser.id}`)
        .then(res => res.json())
        .then(data => setPersonalUnavailability(data));
    } else if (mode === 'admin') {
      fetch('/api/availability')
        .then(res => res.json())
        .then(data => setAllUnavailability(data));
    }
  }, [mode, currentUser]);

  const holidays = useMemo(() => {
    const hd = new Holidays();
    const map: Record<string, string[]> = {};
    viewConfig.countries.forEach(c => {
      hd.init(c);
      hd.getHolidays(2026).forEach(h => {
        const d = h.date.split(' ')[0];
        if (!map[d]) map[d] = [];
        if (!map[d].includes(h.name)) map[d].push(h.name);
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

  const toggleDate = async (dateStr: string) => {
    if (mode === 'personal' && currentUser) {
      const isUnavailable = personalUnavailability.includes(dateStr);
      // Optimistic update
      setPersonalUnavailability(prev => 
        isUnavailable ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
      );
      
      // API call
      await fetch(`/api/availability/${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, available: isUnavailable })
      });
    }
  };

  const handleDragStart = (dateStr: string) => {
    if (mode === 'personal') {
      setDrag({ start: dateStr, end: dateStr });
    }
  };

  const handleDragEnter = (dateStr: string) => {
    if (drag.start && mode === 'personal') {
      setDrag(prev => ({ ...prev, end: dateStr }));
    }
  };

  const finalizeDrag = async () => {
    if (drag.start && drag.end && mode === 'personal' && currentUser) {
      const start = drag.start < drag.end ? drag.start : drag.end;
      const end = drag.start < drag.end ? drag.end : drag.start;
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

  const handleLogin = (person: Person) => {
    setCurrentUser(person);
    setMode('personal');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setMode('login');
    setPersonalUnavailability([]);
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
                setMode('login');
                setAdminPassword('');
                setPasswordError(false);
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

  if (mode === 'login') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-50 p-4 rounded-full">
              <CalIcon className="text-indigo-600 w-10 h-10" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Welcome</h1>
          <p className="text-center text-slate-500 mb-8">Select your name to manage your availability for 2026.</p>
          
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {people.map(person => (
              <button
                key={person.id}
                onClick={() => handleLogin(person)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all group text-left"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm" style={{ backgroundColor: person.color }}>
                  {person.name.charAt(0)}
                </div>
                <span className="font-semibold text-slate-700 group-hover:text-indigo-700 text-lg">{person.name}</span>
                <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600">
                  <ArrowLeft className="rotate-180" />
                </div>
              </button>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
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
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 font-sans text-slate-900" onMouseUp={finalizeDrag}>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-3">
          {mode === 'personal' && (
            <button onClick={handleLogout} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors" title="Back to login">
              <ArrowLeft size={20} />
            </button>
          )}
          {mode === 'admin' && (
            <button onClick={() => setMode('login')} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors" title="Back to login">
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="flex items-center gap-2">
            <CalIcon className="text-indigo-600" size={24} />
            <h1 className="font-bold text-xl tracking-tight text-slate-800 hidden sm:block">
              TeamAvailability <span className="text-slate-400 font-normal">2026</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {mode === 'personal' && currentUser && (
            <div className="flex items-center gap-3 bg-slate-100 px-3 py-1.5 rounded-full">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: currentUser.color }}>
                {currentUser.name.charAt(0)}
              </div>
              <span className="font-semibold text-slate-700 text-sm">{currentUser.name}</span>
            </div>
          )}
          {mode === 'admin' && (
            <div className="flex items-center gap-4">
              <button 
                onClick={exportData}
                className="text-xs font-bold bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition shadow-sm"
              >
                Export JSON
              </button>
              <div className="flex items-center gap-2 bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full">
                <Shield size={14} />
                <span className="font-bold text-xs uppercase tracking-wide">Admin Mode</span>
              </div>
            </div>
          )}
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
                  <div key={p.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full shadow-sm ring-1 ring-black/5" style={{ backgroundColor: p.color }} />
                    <span className="text-sm font-bold text-slate-700 flex-1">{p.name}</span>
                    <span className="text-xs font-medium text-slate-400">
                      {(allUnavailability[p.id] || []).length} days
                    </span>
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
                      className={`text-[10px] font-bold px-3 py-1.5 rounded-full transition-colors ${
                        viewConfig.countries.includes(c) 
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
                        className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${
                          viewConfig.conflictMode === m 
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

        {/* Main Calendar Area */}
        <main className="flex-1 bg-slate-50 p-4 sm:p-8 overflow-y-auto overflow-x-hidden">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 max-w-7xl mx-auto pb-20">
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
                        onMouseDown={() => handleDragStart(dStr)}
                        onMouseEnter={() => handleDragEnter(dStr)}
                        onClick={() => toggleDate(dStr)}
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
        </main>
      </div>
    </div>
  );
}
