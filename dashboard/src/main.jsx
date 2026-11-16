import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Remove raw SSR test scaffold from client DOM to prevent duplicate IDs and ghost elements
const scaffold = document.getElementById('testScaffold');
if (scaffold) {
  scaffold.remove();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
