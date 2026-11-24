import React, { useState } from 'react';
import { formatMoney, DEFAULT_ETB_CURRENCY } from './lib/money';

export function App() {
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 transition-colors duration-200 ease-calm">
      <div className="bg-surface border border-border rounded-card p-6 shadow-soft2 max-w-md w-full text-center space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-card bg-primary-tint text-primary font-bold text-xl">
          SL
        </div>
        <h1 className="text-2xl font-bold text-primary">Suk Link</h1>
        <p className="text-sm text-muted">
          Neighborhood Shop Ordering &amp; Credit Ledger
        </p>
        <div className="p-3 rounded-input bg-surface-muted text-sm tabular-nums font-semibold">
          Demo Total: {formatMoney(97000, DEFAULT_ETB_CURRENCY, 'en')}
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="min-h-[44px] px-4 py-2 rounded-input bg-primary hover:bg-primary-hover text-primary-foreground font-medium text-sm transition-colors"
        >
          Switch to {dark ? 'Light' : 'Dark'} Mode
        </button>
      </div>
    </div>
  );
}
