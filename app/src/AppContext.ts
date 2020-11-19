import React from "react";
import { FillStatus } from "./models/FillStatus";
import { Puzzle } from "./models/Puzzle";

export const AppContext = React.createContext({
    triggerUpdate: () => {},
    switchActiveView: (_: string) => {},

    fillWord: () => {},
    fillGrid: () => {},
    pauseFill: () => {},
    fillStatus: FillStatus.Ready,
    setFillStatus: (_: FillStatus) => {},
    setPuzzle: (_: Puzzle) => {},
  });