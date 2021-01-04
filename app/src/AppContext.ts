import React from "react";
import { Puzzle } from "./models/Puzzle";

export const AppContext = React.createContext({
    triggerUpdate: () => {},
    switchActiveView: (_: string) => {},
    setPuzzle: (_: Puzzle) => {},
    createNewPuzzle: (w: number, h: number) => {},
    exportPuz: () => {},
    toggleFill: () => {},
  });
  