import React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsApp } from './App';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Settings root element not found');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>,
);
