import React, { useState } from 'react';
import { Fuel, Mail, Lock } from 'lucide-react';
import { supabase } from './supabaseClient';

const AuthScreen = () => {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        setMessage('Cuenta creada. Si tenés la confirmación de email activada en Supabase, revisá tu correo antes de iniciar sesión.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-md p-6 border border-slate-100">
        <div className="flex items-center gap-2 justify-center mb-6">
          <Fuel className="h-6 w-6 text-blue-700" />
          <h1 className="text-lg font-bold text-slate-800">Control Combustible</h1>
        </div>

        <div className="flex mb-6 bg-slate-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-colors ${mode === 'signin' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500'}`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-colors ${mode === 'signup' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500'}`}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="pl-10 w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              className="pl-10 w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          {message && <p className="text-green-600 text-sm">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-bold shadow-md transition-all"
          >
            {loading ? 'Un momento...' : mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthScreen;
