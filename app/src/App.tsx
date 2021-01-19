import React, { useEffect, useReducer, useState } from 'react';
import { AppContext } from './AppContext';
import { AppProps } from './AppProps';
import CluesView from './components/CluesView/CluesView';
import FillView from './components/FillView/FillView';
import Grid from './components/Grid/Grid';
import Menu from './components/Menu/Menu';
import Globals from './lib/windowService';
import "./App.scss";
import { Puzzle } from './models/Puzzle';
import { getGrid, initializeSessionGlobals, newPuzzle } from './lib/util';
import { generatePuzFile } from './lib/puzFiles';
import { SymmetryType } from './models/SymmetryType';
import { FillStatus } from './models/FillStatus';
import { clearFill, createNewGrid } from './lib/grid';
import { fillSectionWord } from './lib/fill';
import { WordDirection } from './models/WordDirection';

function App(props: AppProps) {
  const [activeView, setActiveView] = useState(props.activeView);
  const [gridWidth, setGridWidth] = useState(7);
  const [gridHeight, setGridHeight] = useState(7);
  const [updateSemaphore, setUpdateSemaphore] = useState(0);
  // eslint-disable-next-line
  const [ignored, forceUpdate] = useReducer(x => x + 1, 0);
  const [appState, setAppState] = useState(getAppContext());
  const [fillInterval, setFillInterval] = useState({} as any);

  useEffect(() => {
    setAppState(getAppContext());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateSemaphore]);

  function getAppContext() {
    return { 
      triggerUpdate: triggerUpdate,
      switchActiveView: switchActiveView,
      setPuzzle: setPuzzle,
      createNewPuzzle: createNewPuzzle,
      exportPuz: exportPuz,
      toggleFill: toggleFill,
    }
  }

  function toggleFill() {
    if (Globals.isFillEnabled) {
      let interval = setInterval(() => doFillWord(), 5);
      setFillInterval(interval);
    }
    else {
      if (fillInterval)
        clearInterval(fillInterval);
    }
    triggerUpdate();
  }

  function doFillWord() {
    fillSectionWord();
    triggerUpdate();
  }

  function triggerUpdate() {
    setUpdateSemaphore(updateSemaphore + 1);
    forceUpdate();
  }

  function switchActiveView(newView: string) {
    setActiveView(newView);
  }

  function createNewPuzzle(width: number, height: number) {
    initializeGlobals(undefined, width, height);
    triggerUpdate();
  }

  function setPuzzle(puzzle: Puzzle) {
    let grid = getGrid();
    initializeGlobals(puzzle, grid.width, grid.height);
    triggerUpdate();
  }

  function exportPuz() {
    let puzzle = Globals.puzzle!;
    let blob = generatePuzFile(puzzle);
    let filename = (puzzle.title || "Untitled")+".puz";
    let file = new File([blob], filename);
    const url= window.URL.createObjectURL(file);
    let puzzleLink = document.getElementById("download-puzzle-link");
    puzzleLink!.setAttribute("href", url);
    puzzleLink!.setAttribute("download", filename);
    puzzleLink!.click();
  }

  function initializeGlobals(puzzle?: Puzzle, width?: number, height?: number) {
    Globals.puzzle = puzzle || newPuzzle();
    if (width === undefined) width = gridWidth;
    if (height === undefined) height = gridHeight;
    setGridWidth(width);
    setGridHeight(height);
    if (!Globals.activeGrid || width !== gridWidth || height !== gridHeight)
      Globals.activeGrid = createNewGrid(width, height);
    Globals.hoverGrid = undefined;
    Globals.selectedWordKey = "";
    Globals.selectedWordDir = WordDirection.Across;
    Globals.gridSymmetry = SymmetryType.Rotate180;
    Globals.isFillEnabled = false;
    Globals.isFillComplete = false;
    Globals.fillStatus = FillStatus.Ready;
    Globals.selectedWordNode = undefined;

    initializeSessionGlobals();
    clearFill(Globals.activeGrid!);
  }

  if (!Globals.puzzle) {
    initializeGlobals();
    triggerUpdate();
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
            <FillView updateSemaphoreProp={updateSemaphore}></FillView>
        }
      </div>
      
      <div className="main-panel">
        <Grid></Grid>
      </div>
    </AppContext.Provider>
  );
}

export default App;
