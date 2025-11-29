import React from 'react';
import ReactDOM from 'react-dom/client';
import { OptionsApp } from './App';
import '../../styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>,
);
