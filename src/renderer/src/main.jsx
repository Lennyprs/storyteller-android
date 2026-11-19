import log from 'electron-log/renderer';
Object.assign(console, log.functions);
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Toaster } from "@/components/ui/sonner"
import App from './App';
import './index.css';
import './lib/i18n';
import { I18nextProvider } from 'react-i18next';
import i18n from './lib/i18n';
import { initializeAndroidRuntime } from './platform/androidRuntime';

async function startRenderer() {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  try {
    await initializeAndroidRuntime();
    root.render(
      <React.StrictMode>
        <I18nextProvider i18n={i18n}>
          <HashRouter>
            <App />
            <Toaster />
          </HashRouter>
        </I18nextProvider>
      </React.StrictMode>,
    );
  } catch (error) {
    console.error('Unable to initialize Android storage', error);
    root.render(<main role="alert" style={{ padding: 24 }}>Impossible d’ouvrir la base de données locale. Les données de l’application n’ont pas été chargées.</main>);
  }
}

startRenderer();
