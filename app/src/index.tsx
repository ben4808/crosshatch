import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import 'bootstrap/dist/css/bootstrap.css';
// eslint-disable-next-line
import { loadPhilList, loadPeterBrodaList, load5sMainList, loadMainPlusBroda } from './lib/wordList';
//import { generatePuzFile, loadPuzFile } from './lib/puzFiles';
//import Globals from './lib/windowService';

// loadPuzFile("http://localhost/180101-1016ThemelessMonday.puz").then(puz => {
//   if (puz) {
//     Globals.gridState = puz.grid;
//     let blob = generatePuzFile(puz);
//     let filename = puz.title+".puz";
//     let file = new File([blob], filename);
//     const url= window.URL.createObjectURL(file);
//     let puzzleLink = document.getElementById("download-puzzle-link");
//     puzzleLink!.setAttribute("href", url);
//     puzzleLink!.setAttribute("download", filename);
//     puzzleLink!.click();
//   }
// });

//loadMainPlusBroda();

ReactDOM.render(
  <React.StrictMode>
    <App activeView="Clues" />
  </React.StrictMode>,
  document.getElementById('root')
);

