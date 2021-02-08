import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import 'bootstrap/dist/css/bootstrap.css';

// import { loadWordListFromLocalhost } from './lib/wordList';
// import Globals from './lib/windowService';
// import { FillStatus } from './models/FillStatus';
// loadWordListFromLocalhost("http://localhost/classifier/mainBrodaEntries.txt").then(() => {
//   Globals.fillStatus = FillStatus.Ready;
// });

ReactDOM.render(
  <React.StrictMode>
    <App activeView="Fill" />
  </React.StrictMode>,
  document.getElementById('root')
);
