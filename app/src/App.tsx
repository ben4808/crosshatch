import React, { useEffect, useState } from 'react';
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
import { newPuzzle } from './lib/util';
import { generatePuzFile } from './lib/puzFiles';
import { WordDirection } from './models/WordDirection';
import { SymmetryType } from './models/SymmetryType';
import { priorityQueue } from './lib/priorityQueue';
import { FillNode } from './models/FillNode';

function App(props: AppProps) {
  const [activeView, setActiveView] = useState(props.activeView);
  const [gridWidth, setGridWidth] = useState(5);
  const [gridHeight, setGridHeight] = useState(5);
  const [updateSemaphore, setUpdateSemaphore] = useState(0);
  const [appState, setAppState] = useState(getAppContext());

  function getAppContext() {
    return { 
      triggerUpdate: triggerUpdate,
      switchActiveView: switchActiveView,
      setPuzzle: setPuzzle,
      createNewPuzzle: createNewPuzzle,
      exportPuz: exportPuz,
    }
  }

  useEffect(() => {
    setAppState(getAppContext());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateSemaphore]);

  function triggerUpdate() {
    let newSemaphore = updateSemaphore + 1;
    setUpdateSemaphore(newSemaphore);
  }

  function switchActiveView(newView: string) {
    setActiveView(newView);
  }

  function createNewPuzzle(width: number, height: number) {
    setPuzzle(newPuzzle(width, height));
    setGridWidth(width);
    setGridHeight(height);
  }

  function setPuzzle(puzzle: Puzzle) {
    Globals.puzzle = puzzle;
    Globals.selectedWordKey = "";
    Globals.selectedWordDir = WordDirection.Across;
    Globals.gridSymmetry = SymmetryType.Rotate180;
    Globals.fillStatus = FillStatus.Ready;
    Globals.isFirstFillCall = true;
    Globals.fillQueue = priorityQueue<FillNode>();
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
            <FillView updateSemaphore={updateSemaphore}></FillView>
        }
      </div>
      
      <div className="main-panel">
        <Grid updateSemaphore={updateSemaphore}></Grid>
      </div>
    </AppContext.Provider>
  );
}

export default App;