import React from 'react';
import { createRoot } from 'react-dom/client';
import i18n from './i18n.js';
import { I18nextProvider } from 'react-i18next';
import '../src/shadcn.css';
import './home.css';
import { Home } from './home.jsx';

createRoot(document.getElementById('root')).render(<React.StrictMode><I18nextProvider i18n={i18n}><Home /></I18nextProvider></React.StrictMode>);
