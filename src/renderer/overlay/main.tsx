import React from 'react';
import { createRoot } from 'react-dom/client';
import { OverlayApp } from './App';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Overlay root element not found');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
