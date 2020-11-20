import React, { useState } from 'react';
import { AppContext } from './AppContext';
import { AppProps } from './AppProps';
import CluesView from './components/CluesView/CluesView';
import FillView from './components/FillView/FillView';
import Grid from './components/Grid/Grid';
import Menu from './components/Menu/Menu';
import { FillStatus } from './models/FillStatus';
import Globals from './lib/windowService';
import "./App.scss";
import { Puzzle } from './models/Puzzle';
import { deepClone, newPuzzle } from './lib/util';

function App(props: AppProps) {
  const [activeView, setActiveView] = useState(props.activeView);
  const [gridWidth, setGridWidth] = useState(props.gridWidth);
  const [gridHeight, setGridHeight] = useState(props.gridHeight);
  const [fillStatus, setFillStatus] = useState(FillStatus.Ready);
  const [updateSemaphore, setUpdateSemaphore] = useState(0);

  const [appState, setAppState] = useState({ 
    triggerUpdate: triggerUpdate,
    switchActiveView: switchActiveView,
    fillWord: fillWord,
    fillGrid: fillGrid,
    pauseFill: pauseFill,
    fillStatus: fillStatus,
    setFillStatus: setFillStatus,
    setPuzzle: setPuzzle,
  });

  // useEffect(() => {
  //   Globals.fillQueue = priorityQueue<FillNode>();
  //   Globals.fillStatus = FillStatus.Ready;
  //   Globals.currentDepth = 0;
  //   Globals.isFirstFillCall = true;
  //   Globals.fillWordHandler = handleFillWord;
  //   Globals.fillGridHandler = handleFillGrid;
  //   Globals.pauseFill = pauseFill;

  //   if (!Globals.gridState) {
  //       Globals.gridState = createNewGrid(props.height, props.width);
  //       populateWords(Globals.gridState!);
  //   }
    
  //   forceUpdate();
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  function triggerUpdate() {
    setUpdateSemaphore(updateSemaphore + 1);
  }

  function switchActiveView(newView: string) {
    setActiveView(newView);
  }

  function fillWord() {
    // Globals.gridState = fillWord();
    // forceUpdate();
  }

  function fillGrid() {
      // Globals.fillStatus = FillStatus.Ready;
      // doFillGrid();
  }

  function doFillGrid() {
      // if ([FillStatus.Success, FillStatus.Failed, FillStatus.Paused].find(x => x === Globals.fillStatus) !== undefined) {
      //     return;
      // }

      // Globals.gridState = fillWord();
      // forceUpdate();
      // setTimeout(() => doFillGrid(), 10);
  }

  function pauseFill() {
      // Globals.fillStatus = FillStatus.Paused;
      // forceUpdate();
  }

  function setPuzzle(puzzle: Puzzle) {
    Globals.puzzle = puzzle;
    triggerUpdate();
  }

  if (!Globals.puzzle) {
    setPuzzle(newPuzzle(gridWidth, gridHeight));
  }

  return (
    <AppContext.Provider value={appState}>
      <a id="download-puzzle-link" href="http://www.example.com" style={{display: "none"}}>stuff</a>

      <Menu gridHeight={gridHeight} gridWidth={gridWidth} openView={activeView}></Menu>

      <div className="main-panel">
        {activeView === "Clues" && 
            <CluesView updateSemaphore={updateSemaphore}></CluesView>
        }
        {activeView === "Fill" && 
            <FillView updateSemaphore={updateSemaphore}></FillView>
        }
      </div>
      
      <div className="main-panel">
        <Grid updateSemaphore={updateSemaphore} height={gridHeight} width={gridWidth}></Grid>
      </div>
    </AppContext.Provider>
  );
}

export default App;