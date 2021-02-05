import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import 'bootstrap/dist/css/bootstrap.css';
// eslint-disable-next-line
import { loadWordListFromLocalhost } from './lib/wordList';

//loadWordListFromLocalhost("http://localhost/phil_wordlist.txt");

ReactDOM.render(
  <React.StrictMode>
    <App activeView="Fill" />
  </React.StrictMode>,
  document.getElementById('root')
);
