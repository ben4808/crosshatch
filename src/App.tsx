import React, { useCallback, useMemo, useState } from 'react';
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
import { clearFill, createNewGrid } from './lib/grid';
import { WordDirection } from './models/WordDirection';
import { FillStatus } from './models/FillStatus';

function App(props: AppProps) {
  const [activeView, setActiveView] = useState(props.activeView);
  const [gridWidth, setGridWidth] = useState(7);
  const [gridHeight, setGridHeight] = useState(7);
  const [updateSemaphore, setUpdateSemaphore] = useState(0);

  // Functional updater so long-lived callbacks (fill worker onProgress) never
  // close over a stale counter — that made setState a no-op until mouse moves
  // triggered a fresher Grid triggerUpdate.
  const triggerUpdate = useCallback(() => {
    setUpdateSemaphore(s => s + 1);
  }, []);

  const switchActiveView = useCallback((newView: string) => {
    setActiveView(newView);
  }, []);

  function initializeGlobals(puzzle?: Puzzle, width?: number, height?: number) {
    let isNewPuzzle = !!puzzle;
    Globals.puzzle = puzzle || newPuzzle();
    if (width === undefined) width = gridWidth;
    if (height === undefined) height = gridHeight;
    if (!Globals.activeGrid || !isNewPuzzle)
      Globals.activeGrid = createNewGrid(width, height);
    Globals.hoverGrid = undefined;
    Globals.selectedWordKey = undefined;
    Globals.selectedWordDir = WordDirection.Across;
    if (!Globals.gridSymmetry) Globals.gridSymmetry = SymmetryType.Rotate180;
    if (Globals.useManualHeuristics === undefined) Globals.useManualHeuristics = true;
    Globals.selectedWordNode = undefined;
    if (Globals.wordLists === undefined) Globals.wordLists = [];
    Globals.fillStatus = Globals.wordList !== undefined ? FillStatus.Ready : FillStatus.NoWordList;

    initializeSessionGlobals();
    clearFill(Globals.activeGrid!);

    setGridWidth(width);
    setGridHeight(height);
  }

  const createNewPuzzle = useCallback((width: number, height: number) => {
    initializeGlobals(undefined, width, height);
    triggerUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerUpdate, gridWidth, gridHeight]);

  const setPuzzle = useCallback((puzzle: Puzzle) => {
    let grid = getGrid();
    initializeGlobals(puzzle, grid.width, grid.height);
    triggerUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerUpdate, gridWidth, gridHeight]);

  const exportPuz = useCallback(() => {
    let puzzle = Globals.puzzle!;
    let blob = generatePuzFile(puzzle);
    let filename = (puzzle.title || "Untitled")+".puz";
    let file = new File([blob], filename);
    const url= window.URL.createObjectURL(file);
    let puzzleLink = document.getElementById("download-puzzle-link");
    puzzleLink!.setAttribute("href", url);
    puzzleLink!.setAttribute("download", filename);
    puzzleLink!.click();
  }, []);

  const appState = useMemo(() => ({
    triggerUpdate,
    switchActiveView,
    setPuzzle,
    createNewPuzzle,
    exportPuz,
  }), [triggerUpdate, switchActiveView, setPuzzle, createNewPuzzle, exportPuz]);

  if (!Globals.puzzle) {
    initializeGlobals();
  }

  return (
    <AppContext.Provider value={appState}>
      <a id="download-puzzle-link" href="http://www.example.com" style={{display: "none"}}>stuff</a>

      <Menu gridHeight={gridHeight} gridWidth={gridWidth} openView={activeView}></Menu>

      <div className="left-panel">
        {activeView === "Clues" && 
            <CluesView updateSemaphore={updateSemaphore}></CluesView>
        }
        {activeView === "Fill" && 
            <FillView></FillView>
        }
      </div>
      
      <div className="right-panel">
        <Grid></Grid>
      </div>
    </AppContext.Provider>
  );
}

export default App;
