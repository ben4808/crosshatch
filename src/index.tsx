import React from 'react';
import ReactDOM from 'react-dom';
import 'bootstrap/dist/css/bootstrap.css';

const isMagicApp = /^\/app(\/|$)/.test(window.location.pathname);
const isExplorerApp = /^\/explorer(\/|$)/.test(window.location.pathname);
const root = document.getElementById('root');

// Load each app lazily so the crossword editor's styles and globals don't leak into the mini-apps.
if (isExplorerApp) {
  import('./explorer/ExplorerApp').then(({ default: ExplorerApp }) => {
    ReactDOM.render(
      <React.StrictMode>
        <ExplorerApp />
      </React.StrictMode>,
      root
    );
  });
} else if (isMagicApp) {
  import('./magic/MagicApp').then(({ default: MagicApp }) => {
    ReactDOM.render(
      <React.StrictMode>
        <MagicApp />
      </React.StrictMode>,
      root
    );
  });
} else {
  import('./App').then(({ default: App }) => {
    ReactDOM.render(
      <React.StrictMode>
        <App activeView="Fill" />
      </React.StrictMode>,
      root
    );
  });
}
