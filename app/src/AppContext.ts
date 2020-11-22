import React from "react";
import { FillStatus } from "./models/FillStatus";
import { Puzzle } from "./models/Puzzle";

export const AppContext = React.createContext({
    triggerUpdate: () => {},
    switchActiveView: (_: string) => {},
    fillWord: () => {},
    fillGrid: () => {},
    pauseFill: () => {},
    setFillStatus: (_: FillStatus) => {},
    setPuzzle: (_: Puzzle) => {},
    createNewPuzzle: (w: number, h: number) => {},
    exportPuz: () => {},
  });