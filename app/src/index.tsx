import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import 'bootstrap/dist/css/bootstrap.css';
// eslint-disable-next-line
import { loadPhilList, loadPeterBrodaList, load5sMainList, loadMainPlusBroda, loadMainBrodaEntries } from './lib/wordList';

loadMainBrodaEntries();

ReactDOM.render(
  <React.StrictMode>
    <App activeView="Fill" />
  </React.StrictMode>,
  document.getElementById('root')
);
