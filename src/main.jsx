import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// #root에 React 앱 렌더
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
