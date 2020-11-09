import React from 'react';
import LeftPanel from './components/LeftPanel/LeftPanel';
import RightPanel from './components/RightPanel/RightPanel';

function App() {
  return (
    <>
      <a id="download-puzzle-link" href="http://www.example.com" style={{display: "none"}}>stuff</a>
      <LeftPanel></LeftPanel>
      <RightPanel></RightPanel>
    </>
  );
}

export default App;
