import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Fuel, Gauge, Wallet, Trash2, TrendingUp, TrendingDown, Save, Download, Cloud, User, LogOut, ShieldAlert, X, Mail, Lock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { supabase } from './supabaseClient';
import AuthScreen from './AuthScreen';

const STATIONS = ['Petropar', 'Copetrol', 'Petrobras', 'Enex', 'Puma'];

const App = () => {
  const [user, setUser] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [authLoading, setAuthLoading] = useState(true);

  // Estados para "proteger cuenta" (upgrade de usuario anónimo a email+contraseña)
  const [showUpgradeForm, setShowUpgradeForm] = useState(false);
  const [upgradeDismissed, setUpgradeDismissed] = useState(() => localStorage.getItem('fuel_upgrade_dismissed') === 'true');
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradePassword, setUpgradePassword] = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState(null);
  const [upgradeMessage, setUpgradeMessage] = useState(null);

  // Estados del formulario
  const [odometer, setOdometer] = useState('');
  const [liters, setLiters] = useState('');
  const [cost, setCost] = useState('');
  const [station, setStation] = useState('Petropar');

  // --- Autenticación ---
  useEffect(() => {
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setAuthLoading(false);
    };
    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleUpgrade = async (e) => {
    e.preventDefault();
    setUpgradeLoading(true);
    setUpgradeError(null);
    setUpgradeMessage(null);

    const { error } = await supabase.auth.updateUser({ email: upgradeEmail, password: upgradePassword });
    if (error) {
      setUpgradeError(error.message);
    } else {
      setUpgradeMessage('Listo. Si tenés la confirmación de email activada en Supabase, revisá tu correo para completar la protección de tu cuenta.');
    }
    setUpgradeLoading(false);
  };

  const dismissUpgrade = () => {
    localStorage.setItem('fuel_upgrade_dismissed', 'true');
    setUpgradeDismissed(true);
  };

  const handleSignOut = async () => {
    if (window.confirm('¿Cerrar sesión?')) {
      await supabase.auth.signOut();
    }
  };

  // --- Sincronización de Datos (Supabase) ---
  useEffect(() => {
    if (!user) return;

    const fetchEntries = async () => {
      const { data, error } = await supabase
        .from('fuel_logs')
        .select('*')
        .order('odometer', { ascending: true });

      if (error) {
        console.error("Error leyendo datos:", error);
      } else {
        setEntries(data);
      }
      setLoading(false);
    };

    fetchEntries();

    // Suscripción en tiempo real a cambios en la tabla del usuario
    const channel = supabase
      .channel('fuel_logs_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fuel_logs', filter: `user_id=eq.${user.id}` },
        () => fetchEntries()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  // --- Helpers ---
  const formatPYG = (value) => {
    return new Intl.NumberFormat('es-PY', {
      style: 'currency',
      currency: 'PYG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDateFull = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-PY', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const exportToCSV = () => {
    const headers = ['ID,Fecha ISO,Dia Semana,Fecha Legible,Odometro,Litros,Costo Gs,Estacion'];
    const rows = entries.map(e => {
      const dateObj = new Date(e.date);
      const dayName = dateObj.toLocaleDateString('es-PY', { weekday: 'long' });
      const readableDate = dateObj.toLocaleDateString('es-PY', { day: 'numeric', month: 'short', year: 'numeric' });
      return [
        e.id, e.date, dayName, readableDate, e.odometer, e.liters, e.cost, e.station
      ].join(',');
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `combustible_backup_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!odometer || !cost || !user) return;

    const newEntry = {
      user_id: user.id,
      date: new Date().toISOString(),
      odometer: parseFloat(odometer),
      liters: parseFloat(liters) || 0,
      cost: parseFloat(cost),
      station: station,
    };

    const { error } = await supabase.from('fuel_logs').insert(newEntry);
    if (error) {
      console.error("Error guardando:", error);
    } else {
      setOdometer('');
      setLiters('');
      setCost('');
      setStation('Petropar');
      setShowForm(false);
    }
  };

  const handleDelete = async (id) => {
    if(window.confirm('¿Borrar este registro permanentemente?')) {
      const { error } = await supabase.from('fuel_logs').delete().eq('id', id);
      if (error) console.error("Error borrando:", error);
    }
  };

  // --- Estadísticas ---
  const stats = useMemo(() => {
    if (entries.length < 2) return { totalCost: 0, totalKm: 0, kmPer1000Gs: 0 };
    const sorted = [...entries].sort((a, b) => a.odometer - b.odometer);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalCost = sorted.reduce((sum, item) => sum + item.cost, 0);
    const costForEfficiency = totalCost - first.cost; 
    const totalKm = last.odometer - first.odometer;
    const kmPer1000Gs = costForEfficiency > 0 ? (totalKm / costForEfficiency) * 1000 : 0;
    return { totalCost, totalKm, kmPer1000Gs };
  }, [entries]);

  // --- Datos Gráficos ---
  const monthKeyOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  const chartData = useMemo(() => {
    if (entries.length === 0) return { weekly: [], monthly: [] };
    const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const weeklyMap = {};
    const monthlyMap = {};

    sorted.forEach((entry, index) => {
      const date = new Date(entry.date);
      let distance = 0;
      if (index > 0) distance = entry.odometer - sorted[index - 1].odometer;

      const onejan = new Date(date.getFullYear(), 0, 1);
      const weekNum = Math.ceil((((date - onejan) / 86400000) + onejan.getDay() + 1) / 7);
      const weekKey = `Sem ${weekNum}`;
      const monthKey = monthKeyOf(date);
      const monthLabel = date.toLocaleDateString('es-PY', { month: 'short', year: '2-digit' });

      if (!weeklyMap[weekKey]) weeklyMap[weekKey] = { name: weekKey, costo: 0, km: 0 };
      weeklyMap[weekKey].costo += entry.cost;
      weeklyMap[weekKey].km += distance;

      if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { key: monthKey, name: monthLabel, costo: 0, km: 0, liters: 0 };
      monthlyMap[monthKey].costo += entry.cost;
      monthlyMap[monthKey].km += distance;
      monthlyMap[monthKey].liters += entry.liters || 0;
    });

    const monthly = Object.values(monthlyMap)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(m => ({ ...m, precioLitro: m.liters > 0 ? Math.round(m.costo / m.liters) : 0 }));

    return { weekly: Object.values(weeklyMap), monthly };
  }, [entries]);

  // --- Resumen del mes actual vs. mes anterior ---
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const currentKey = monthKeyOf(now);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = monthKeyOf(prevDate);

    const byKey = {};
    chartData.monthly.forEach(m => { byKey[m.key] = m; });

    const current = byKey[currentKey] || { costo: 0, km: 0, liters: 0, precioLitro: 0 };
    const previous = byKey[prevKey] || null;
    const change = previous && previous.costo > 0
      ? ((current.costo - previous.costo) / previous.costo) * 100
      : null;

    return { current, previous, change };
  }, [chartData.monthly]);

  // --- Filtro de historial por mes ---
  const monthOptions = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      const date = new Date(e.date);
      const key = monthKeyOf(date);
      if (!map[key]) map[key] = date.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const filteredHistory = useMemo(() => {
    const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!selectedMonth) return sorted;
    return sorted.filter(e => monthKeyOf(new Date(e.date)) === selectedMonth);
  }, [entries, selectedMonth]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-10">

      {/* Header */}
      <header className="bg-blue-700 text-white p-4 shadow-lg sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Fuel className="h-6 w-6" />
            <div className="flex flex-col">
                <h1 className="text-lg font-bold leading-tight">Control Combustible</h1>
                <div className="flex items-center gap-1 text-xs text-blue-200">
                    <Cloud className="h-3 w-3" />
                    <span>Conectado a la Nube</span>
                </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
                onClick={exportToCSV}
                className="bg-blue-800 p-2 rounded-full text-blue-200 hover:text-white hover:bg-blue-900 transition-colors"
                title="Descargar Excel/CSV"
            >
                <Download className="h-5 w-5" />
            </button>
            <button 
                onClick={() => setShowForm(!showForm)}
                className="bg-white text-blue-700 px-3 py-2 rounded-full font-semibold text-sm flex items-center gap-2 shadow-sm hover:bg-blue-50 transition-colors"
            >
                {showForm ? 'Cerrar' : 'Cargar'}
                {!showForm && <Plus className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Banner: proteger cuenta anónima */}
      {user.is_anonymous && !upgradeDismissed && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">Estás usando una cuenta temporal</p>
                <p className="text-xs text-amber-700 mt-1">
                  Tus datos viven solo en este navegador. Si limpiás la caché o cambiás de dispositivo, los perdés. Agregá un email y contraseña para protegerlos, sin perder lo que ya cargaste.
                </p>

                {!showUpgradeForm ? (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setShowUpgradeForm(true)}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Proteger mi cuenta
                    </button>
                    <button
                      onClick={dismissUpgrade}
                      className="text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                    >
                      Ahora no
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleUpgrade} className="mt-3 space-y-2 max-w-xs">
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-amber-400" />
                      <input
                        type="email"
                        required
                        value={upgradeEmail}
                        onChange={(e) => setUpgradeEmail(e.target.value)}
                        placeholder="tu@email.com"
                        className="pl-9 w-full p-2 text-sm border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-amber-400" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={upgradePassword}
                        onChange={(e) => setUpgradePassword(e.target.value)}
                        placeholder="Contraseña"
                        className="pl-9 w-full p-2 text-sm border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                      />
                    </div>

                    {upgradeError && <p className="text-red-600 text-xs">{upgradeError}</p>}
                    {upgradeMessage && <p className="text-green-700 text-xs">{upgradeMessage}</p>}

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={upgradeLoading}
                        className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {upgradeLoading ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowUpgradeForm(false)}
                        className="text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>
              <button onClick={dismissUpgrade} className="text-amber-400 hover:text-amber-600 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto p-4 space-y-6">

        {/* Loading State */}
        {loading && (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700 mx-auto"></div>
            <p className="text-slate-500 mt-2 text-sm">Cargando tus datos...</p>
          </div>
        )}

        {/* Formulario */}
        {!loading && showForm && (
          <div className="bg-white rounded-xl shadow-md p-6 border border-blue-100 animate-in fade-in slide-in-from-top-4">
            <h2 className="text-lg font-semibold mb-4 text-blue-800 flex items-center gap-2">
              <Save className="h-5 w-5" /> Nueva Carga
            </h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-600 mb-1">Estación de Servicio</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {STATIONS.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setStation(s)}
                            className={`p-2 text-xs sm:text-sm rounded-lg border transition-all ${
                                station === s 
                                ? 'bg-blue-100 border-blue-500 text-blue-800 font-bold ring-1 ring-blue-500' 
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Odómetro (Km)</label>
                <div className="relative">
                  <Gauge className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                  <input
                    type="number"
                    required
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    placeholder="Ej: 45050"
                    className="pl-10 w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Monto (Gs)</label>
                <div className="relative">
                  <Wallet className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                  <input
                    type="number"
                    required
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="Ej: 150000"
                    className="pl-10 w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Litros (Opcional)</label>
                <div className="relative">
                  <Fuel className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    value={liters}
                    onChange={(e) => setLiters(e.target.value)}
                    placeholder="Ej: 20.5"
                    className="pl-10 w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="md:col-span-2 flex justify-end mt-2">
                <button type="submit" className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold shadow-md transition-all flex justify-center items-center gap-2">
                  <Save className="h-4 w-4" /> Guardar en la Nube
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Resumen KPI */}
        {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            <div className="text-slate-500 text-xs font-bold uppercase mb-1">Gasto Total</div>
            <div className="text-xl font-bold text-slate-800">{formatPYG(stats.totalCost)}</div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
             <div className="text-slate-500 text-xs font-bold uppercase mb-1">Recorrido</div>
            <div className="text-xl font-bold text-slate-800">{stats.totalKm.toLocaleString()} km</div>
          </div>

          <div className="col-span-2 md:col-span-1 bg-blue-600 p-4 rounded-xl shadow-md text-white">
            <div className="text-blue-100 text-xs font-bold uppercase mb-1">Eficiencia (x 10.000Gs)</div>
            <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{(stats.kmPer1000Gs * 10).toFixed(1)}</span>
                <span className="text-sm opacity-80">km</span>
            </div>
          </div>
        </div>
        )}

        {/* Resumen del mes actual */}
        {!loading && entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            <div className="text-slate-500 text-xs font-bold uppercase mb-1">Gasto de Este Mes</div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-slate-800">{formatPYG(monthlyStats.current.costo)}</span>
              {monthlyStats.change !== null && (
                <span className={`flex items-center text-xs font-bold ${monthlyStats.change > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {monthlyStats.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(monthlyStats.change).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {monthlyStats.previous ? `vs. ${formatPYG(monthlyStats.previous.costo)} mes anterior` : 'Sin datos del mes anterior'}
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            <div className="text-slate-500 text-xs font-bold uppercase mb-1">Precio Promedio / Litro</div>
            <div className="text-xl font-bold text-slate-800">
              {monthlyStats.current.precioLitro > 0 ? formatPYG(monthlyStats.current.precioLitro) : '—'}
            </div>
            <div className="text-xs text-slate-400 mt-1">Este mes (según litros cargados)</div>
          </div>
        </div>
        )}

        {/* Gráficos */}
        {!loading && entries.length > 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-slate-700 font-bold mb-4 text-sm uppercase">Gasto Semanal (Gs)</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.weekly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize: 10}} />
                    <YAxis hide />
                    <RechartsTooltip formatter={(value) => formatPYG(value)} />
                    <Bar dataKey="costo" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-slate-700 font-bold mb-4 text-sm uppercase">Km Recorridos</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.weekly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize: 10}} />
                    <YAxis hide />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="km" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-slate-700 font-bold mb-4 text-sm uppercase">Gasto Mensual (Gs)</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.monthly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize: 10}} />
                    <YAxis hide />
                    <RechartsTooltip formatter={(value) => formatPYG(value)} />
                    <Bar dataKey="costo" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-slate-700 font-bold mb-4 text-sm uppercase">Precio Promedio / Litro (Mensual)</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.monthly.filter(m => m.precioLitro > 0)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize: 10}} />
                    <YAxis hide />
                    <RechartsTooltip formatter={(value) => formatPYG(value)} />
                    <Line type="monotone" dataKey="precioLitro" stroke="#10b981" strokeWidth={3} dot={{r: 4}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Mensaje de bienvenida si no hay datos */}
        {!loading && entries.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                <Cloud className="h-12 w-12 mx-auto text-blue-200 mb-3" />
                <h3 className="text-lg font-semibold text-slate-700">Listo para empezar</h3>
                <p className="text-slate-500 mb-4 text-sm">Tus datos se guardarán seguros en la nube.</p>
                <button 
                    onClick={() => setShowForm(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                >
                    Cargar mi primer registro
                </button>
            </div>
        )}

        {/* Historial */}
        {!loading && entries.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-2 justify-between items-center">
            <h3 className="font-bold text-slate-700 text-sm uppercase">Historial</h3>
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 capitalize"
              >
                <option value="">Todos los meses</option>
                {monthOptions.map(([key, label]) => (
                  <option key={key} value={key} className="capitalize">{label}</option>
                ))}
              </select>
              <span className="text-xs text-slate-500">{filteredHistory.length} registros</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                <tr>
                  <th className="px-4 py-3">Fecha / Estación</th>
                  <th className="px-4 py-3 text-right">Detalles</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{entry.station || 'Sin emblema'}</div>
                      <div className="text-xs text-slate-500 capitalize">{formatDateFull(entry.date)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-blue-700">{formatPYG(entry.cost)}</div>
                      <div className="text-xs text-slate-600">{entry.odometer.toLocaleString()} km</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDelete(entry.id)} className="text-red-300 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Footer con Info de Usuario */}
        <div className="text-center text-xs text-slate-400 mt-8 flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{user.is_anonymous ? 'ID de Usuario Temporal:' : user.email}</span>
            </div>
            {user.is_anonymous && (
              <code className="bg-slate-100 px-2 py-1 rounded text-slate-500">
                  {user.id}
              </code>
            )}
            <p className="mt-2 opacity-50">Tus datos están sincronizados en tiempo real.</p>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 text-slate-400 hover:text-red-500 mt-3 transition-colors"
            >
              <LogOut className="h-3 w-3" /> Cerrar sesión
            </button>
        </div>

      </main>
    </div>
  );
};

export default App;