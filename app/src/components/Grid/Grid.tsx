import React, { useContext, useState } from 'react';
import { SquareType } from '../../models/SquareType';
import { SquareProps } from '../Square/SquareProps';
import { GridProps } from './GridProps';
import "./Grid.scss";
import Square from '../Square/Square';
import { GridState } from '../../models/GridState';
import { WordDirection } from '../../models/WordDirection';
import { GridSquare } from '../../models/GridSquare';
import Globals from '../../lib/windowService';
import { compareTuples, doesWordContainSquare, getWordAtSquare, newWord, otherDir } from '../../lib/util';
import { FillStatus } from '../../models/FillStatus';
import { populateWords, updateGridConstraintInfo } from '../../lib/grid';
import { AppContext } from '../../AppContext';
import { GridWord } from '../../models/GridWord';

function Grid(props: GridProps) {
    const appContext = useContext(AppContext);

    const [selectedSquare, setSelectedSquare] = useState([-1, -1] as [number, number]);
    const [selectedWord, setSelectedWord] = useState(newWord());

    function handleClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || !["grid-square", "grid-square-black"].includes(target.classList[0])) {
            target = target.parentElement;
            if (!target) return;
        }

        let row = +target.attributes["data-row"].value;
        let col = +target.attributes["data-col"].value;
        let grid = Globals.gridState!;
        
        let newDirection = selectedWord.direction;

        let uncheckedSquareDir = getUncheckedSquareDir(grid, row, col);
        if (uncheckedSquareDir !== undefined) {
            newDirection = uncheckedSquareDir;
            setSelectedSquare([row, col]);
        }
        else if (compareTuples([row, col], selectedSquare)) {
            newDirection = otherDir(newDirection);
        }
        else {
            setSelectedSquare([row, col]);
        }

        setSelectedWord(getWordAtSquare(grid, row, col, newDirection) || newWord());
    }
    
    function handleKeyDown(event: any) {
        let grid = Globals.gridState!;
        if (!isSquareSelected()) return;
        let row = selectedSquare[0];
        let col = selectedSquare[1];

        let key: string = event.key.toUpperCase();
        let letterChanged = true;
        let blackSquareChanged = false;
        let sq = grid.squares[row][col];

        if (key.match(/^[A-Z]$/)) {
            if (sq.fillContent === key) letterChanged = false;
            if (sq.type === SquareType.Black) return;

            sq.userContent = key;
            sq.chosenFillContent = key;
            sq.fillContent = key;
            advanceCursor();
        }
        if (key === "BACKSPACE") {
            if (sq.fillContent === undefined) letterChanged = false;
            if (sq.type === SquareType.Black) {
                sq.type = SquareType.White;
                blackSquareChanged = true;
            }

            sq.userContent = undefined;
            sq.chosenFillContent = undefined;
            sq.fillContent = undefined;
            backupCursor();
        }
        // toggle black square
        if (key === ".") {
            sq.type = sq.type === SquareType.White ? SquareType.Black : SquareType.White;
            blackSquareChanged = true;
            letterChanged = false;
            advanceCursor();
        }

        if (blackSquareChanged) {
            clearFillWhenMaybeRunning(() => {
                //clearFill(grid);
                populateWords(grid);
                updateGridConstraintInfo(grid);
            });
        }
        else if (letterChanged)  {
            clearFillWhenMaybeRunning(() => {
                //clearFill(grid);
                updateGridConstraintInfo(grid);
            });
        }
    }

    function clearFillWhenMaybeRunning(func: () => void) {
        if (appContext.fillStatus === FillStatus.Running) {
            appContext.setFillStatus(FillStatus.Paused);
            setTimeout(() => {
                appContext.setFillStatus(FillStatus.Ready);
                func();
            }, 100);
        }
        else {
            func();
        }
    }

    function advanceCursor() {
        if (!isSquareSelected()) return;
    
        let selSq = selectedSquare;
        let grid = Globals.gridState!;
        let dir = selectedWord.direction;
        if ((dir === WordDirection.Across && selSq[1] === grid.width-1) || (dir === WordDirection.Down && selSq[0] === grid.height-1))
            return;
        setSelectedSquare(dir === WordDirection.Across ? [selSq[0], selSq[1] + 1] : [selSq[0] + 1, selSq[1]]);
    }
    
    function backupCursor() {
        if (!isSquareSelected()) return;
    
        let selSq = selectedSquare;
        let dir = selectedWord.direction;
        if ((dir === WordDirection.Across && selSq[1] === 0) || (dir === WordDirection.Down && selSq[0] === 0))
            return;
        setSelectedSquare(dir === WordDirection.Across ? [selSq[0], selSq[1] - 1] : [selSq[0] - 1, selSq[1]]);
    }

    function isSquareSelected(): boolean {
        return selectedSquare[0] > -1;
    }
    
    function isWordSelected(): boolean {
        return !!selectedWord.number;
    }

    function getSquareProps(grid: GridState, row: number, col: number, 
        selectedSquare: [number, number], selectedWord: GridWord): SquareProps {
        let square = grid.squares[row][col];
    
        return {
            key: `${row},${col}`,
            row: row,
            col: col,
            number: square.number,
            type: square.type,
            userContent: square.userContent,
            chosenFillContent: square.chosenFillContent,
            fillContent: square.fillContent,
            qualityClass: square.qualityClass,
            isSelected: isSquareSelected() && compareTuples(selectedSquare, [row, col]),
            isInSelectedWord: isWordSelected() && doesWordContainSquare(selectedWord, row, col),
            constraintSum: square.constraintInfo ? square.constraintInfo.sumTotal : 1000,
        };
    }

    let gridState: GridState = Globals.gridState || createNewGrid(props.height, props.width);

    let squareElements = [];
    for (let row = 0; row < props.height; row++) {
        for (let col = 0; col < props.width; col++) {
            let sqProps = getSquareProps(gridState, row, col, selectedSquare, selectedWord);
            squareElements.push(getSquareElement(sqProps));
        }
    }

    let columnTemplateStyle = {
        gridTemplateColumns: `repeat(${props.width}, 1fr)`
    } as React.CSSProperties;

    return (
        <>
            <div id="grid-status">
                {getFillStatusString(appContext.fillStatus)}
            </div>
            <div id="Grid" className="grid-container" style={columnTemplateStyle} 
                onClick={handleClick} onKeyDown={handleKeyDown} tabIndex={0}>
                {squareElements}
            </div>
        </>
    );
}

export default Grid;

function getSquareElement(props: SquareProps) {
    return <Square {...props}></Square>
}

function getFillStatusString(status: FillStatus): string {
    switch(status) {
        case FillStatus.Ready: return "Ready to Fill";
        case FillStatus.Running: return "Fill Running...";
        case FillStatus.Success: return "Fill Succeeded";
        case FillStatus.Failed: return "Fill Failed";
        case FillStatus.Paused: return "Fill Paused";
        default: return "";
    }
}

export function createNewGrid(height: number, width: number): GridState {
    let squares: GridSquare[][] = [];

    for (let row = 0; row < height; row++) {
        squares.push([]);
        for (let col = 0; col < width; col++) {
            squares[row][col] = {
                row: row,
                col: col,
                type: SquareType.White,
            };
        }
    }

    let grid: GridState = {
        height: height,
        width: width,
        squares: squares,
        words: [],
        usedWords: new Map<string, boolean>(),
    };

    return grid;
}

function getUncheckedSquareDir(grid: GridState, row: number, col: number): WordDirection | undefined {
    if (grid.squares[row][col].type === SquareType.Black) return undefined;
    if ((col === 0 || grid.squares[row][col-1].type === SquareType.Black) &&
        (col === grid.width-1 || grid.squares[row][col+1].type === SquareType.Black))
        return WordDirection.Down;
    if ((row === 0 || grid.squares[row-1][col].type === SquareType.Black) &&
        (row === grid.height-1 || grid.squares[row+1][col].type === SquareType.Black))
        return WordDirection.Across;

    return undefined;
}
