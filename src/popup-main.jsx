import React from 'react';
import { createRoot } from 'react-dom/client';
import './i18n.js';
import { Popup } from './popup.jsx';
import './shadcn.css';
import './styles.css';
import './popup.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
