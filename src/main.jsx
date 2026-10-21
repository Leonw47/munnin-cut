import React from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.js';
import './styles.css';
import App from './App.jsx';
import { useStore } from './store.js';
import { engine } from './engine/index.js';
import { startExport } from './exporter.js';
import * as effects from './shared/effects.js';
import { generateCaptions } from './captions.js';
import * as voz from './engine/voz.js';

// Ganchos usados pelos testes automáticos (MC_AUTOTEST).
window.__mc = { useStore, engine, startExport, effects, generateCaptions, voz };

createRoot(document.getElementById('root')).render(<App />);
