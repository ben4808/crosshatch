import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import 'bootstrap/dist/css/bootstrap.css';
// eslint-disable-next-line
import { loadPhilList, loadPeterBrodaList } from './lib/wordList';

loadPeterBrodaList();

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);

