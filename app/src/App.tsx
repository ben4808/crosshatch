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
import { getGrid, newPuzzle } from './lib/util';
import { generatePuzFile } from './lib/puzFiles';
import { SymmetryType } from './models/SymmetryType';
import { FillStatus } from './models/FillStatus';
import { generateGridSections } from './lib/section';
import { createNewGrid } from './lib/grid';
import { fillSectionWord } from './lib/fill';

function App(props: AppProps) {
  const [activeView, setActiveView] = useState(props.activeView);
  const [gridWidth, setGridWidth] = useState(5);
  const [gridHeight, setGridHeight] = useState(5);
  const [updateSemaphore, setUpdateSemaphore] = useState(0);
  // eslint-disable-next-line
  const [ignored, forceUpdate] = useReducer(x => x + 1, 0);
  const [appState, setAppState] = useState(getAppContext());

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
      doFillWord();
    }
    triggerUpdate();
  }

  function doFillWord() {
    if (!Globals.isFillEnabled) return;

    fillSectionWord();
    setTimeout(() => doFillWord(), 5);
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
    setPuzzle(newPuzzle());
    setGridWidth(width);
    setGridHeight(height);
    initializeGlobals(width, height);
  }

  function setPuzzle(puzzle: Puzzle) {
    Globals.puzzle = puzzle;
    Globals.selectedWordKey = "";
    Globals.gridSymmetry = SymmetryType.Rotate180;
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

  function initializeGlobals(width: number, height: number) {
    Globals.activeGrid = createNewGrid(width, height);
    Globals.fillStatus = FillStatus.Ready;
    let grid = getGrid();
    Globals.sections = generateGridSections(grid);
    Globals.activeSectionId = 0;
    Globals.selectedSectionIds = new Map<number, boolean>();
    Globals.selectedWordNode = undefined;
    Globals.selectedSectionCandidate = undefined;
  }

  if (!Globals.puzzle) {
    createNewPuzzle(gridWidth, gridHeight);
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
