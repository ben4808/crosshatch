import React, { useEffect, useReducer } from 'react';
import { SquareType } from '../../models/SquareType';
import { SquareProps } from '../Square/SquareProps';
import { GridProps } from './GridProps';
import "./Grid.scss";
import Square from '../Square/Square';
import { GridState } from '../../models/GridState';
import { WordDirection } from '../../models/WordDirection';
import { GridSquare } from '../../models/GridSquare';
import { fillWord } from '../../lib/fill';
import Globals from '../../lib/windowService';
import { compareTuples, deepClone, doesWordContainSquare, getWordAtSquare, otherDir } from '../../lib/util';
import { FillStatus } from '../../models/FillStatus';
import { priorityQueue } from '../../lib/priorityQueue';
import { FillNode } from '../../models/FillNode';
import { populateWords, updateGridConstraintInfo } from '../../lib/grid';

function Grid(props: GridProps) {
    // eslint-disable-next-line
    const [ignored, forceUpdate] = useReducer(x => x + 1, 0);

    useEffect(() => {
        Globals.gridState = createNewGrid(props.height, props.width);
        Globals.fillQueue = priorityQueue<FillNode>();
        Globals.fillStatus = FillStatus.Ready;
        Globals.fillWordHandler = handleFillWord;
        Globals.fillGridHandler = handleFillGrid;
        Globals.pauseFill = pauseFill;

        let newGridState = deepClone(Globals.gridState);
        populateWords(newGridState);
        setGridState(newGridState);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || !["grid-square", "grid-square-black"].includes(target.classList[0])) {
            target = target.parentElement;
            if (!target) return;
        }

        let row = +target.attributes["data-row"].value;
        let col = +target.attributes["data-col"].value;
        let newGridState = deepClone(Globals.gridState);
        
        let newDirection = newGridState.selectedWord?.direction || WordDirection.Across;

        let uncheckedSquareDir = getUncheckedSquareDir(newGridState, row, col);
        if (uncheckedSquareDir !== undefined) {
            newDirection = uncheckedSquareDir;
            newGridState.selectedSquare = [row, col];
        }
        else if (compareTuples([row, col], newGridState.selectedSquare || [-1, -1])) {
            newDirection = otherDir(newDirection);
        }
        else {
            newGridState.selectedSquare = [row, col];
        }

        newGridState.selectedWord = getWordAtSquare(newGridState, row, col, newDirection);
        setGridState(newGridState);
    }
    
    function handleKeyDown(event: any) {
        let newGridState = deepClone(Globals.gridState);
        if (!newGridState.selectedSquare) return;
        let row = newGridState.selectedSquare[0];
        let col = newGridState.selectedSquare[1];

        let key: string = event.key.toUpperCase();
        let letterChanged = true;
        let blackSquareChanged = false;
        let sq = newGridState.squares[row][col];

        if (key.match(/^[A-Z]$/)) {
            if (sq.fillContent === key) letterChanged = false;

            sq.correctContent = key;
            sq.fillContent = key;
            advanceCursor(newGridState);
        }
        if (key === "BACKSPACE") {
            if (sq.fillContent === undefined) letterChanged = false;

            sq.correctContent = undefined;
            sq.fillContent = undefined;
            backupCursor(newGridState);
        }
        // toggle black square
        if (key === ".") {
            sq.type = sq.type === SquareType.White ? SquareType.Black : SquareType.White;
            blackSquareChanged = true;
            letterChanged = false;
        }

        if (blackSquareChanged) {
            clearFill(newGridState);
            populateWords(newGridState);
            updateGridConstraintInfo(newGridState);
        }
        else if (letterChanged)  {
            clearFill(newGridState);
            updateGridConstraintInfo(newGridState);
        }
            
        setGridState(newGridState);
    }

    function handleFillWord() {
        let newGridState = deepClone(Globals.gridState);
        newGridState = fillWord(newGridState);
        setGridState(newGridState);
    }

    function handleFillGrid() {
        Globals.fillStatus = FillStatus.Ready;
        doFillGrid();
    }

    function doFillGrid() {
        if ([FillStatus.Success, FillStatus.Failed, FillStatus.Paused].find(x => x === Globals.fillStatus) !== undefined) {
            return;
        }

        let newGridState: GridState = deepClone(Globals.gridState);
        newGridState = fillWord(newGridState);
        setGridState(newGridState);
        setTimeout(() => doFillGrid(), 10);
    }

    function pauseFill() {
        Globals.fillStatus = FillStatus.Paused;
        forceUpdate();
    }

    function setGridState(newState: GridState) {
        Globals.gridState = newState;
        forceUpdate();
    }

    let gridState: GridState = Globals.gridState || createNewGrid(props.height, props.width);

    let squareElements = [];
    for (let row = 0; row < props.height; row++) {
        for (let col = 0; col < props.width; col++) {
            let sqProps = getSquareProps(gridState, row, col);
            squareElements.push(getSquareElement(sqProps));
        }
    }

    let columnTemplateStyle = {
        gridTemplateColumns: `repeat(${props.width}, 1fr)`
    } as React.CSSProperties;

    return (
        <>
            <div id="grid-status">
                {getFillStatusString(Globals.fillStatus!)}
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

function getSquareProps(grid: GridState, row: number, col: number): SquareProps {
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
        isSelected: !!grid.selectedSquare && compareTuples(grid.selectedSquare, [row, col]),
        isInSelectedWord: !!grid.selectedWord && doesWordContainSquare(grid.selectedWord, row, col),
        constraintSum: square.constraintInfo?.sumTotal || 1000,
    };
}

function createNewGrid(height: number, width: number): GridState {
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

function advanceCursor(grid: GridState) {
    if (!grid.selectedSquare || !grid.selectedWord) return grid;
    if (compareTuples(grid.selectedSquare, grid.selectedWord.end)) return grid;

    let selSq = grid.selectedSquare;
    let dir = grid.selectedWord.direction;
    grid.selectedSquare = dir === WordDirection.Across ? [selSq[0], selSq[1] + 1] : [selSq[0] + 1, selSq[1]];
}

function backupCursor(grid: GridState) {
    if (!grid.selectedSquare || !grid.selectedWord) return grid;
    if (compareTuples(grid.selectedSquare, grid.selectedWord.start)) return grid;

    let selSq = grid.selectedSquare;
    let dir = grid.selectedWord.direction;
    grid.selectedSquare = dir === WordDirection.Across ? [selSq[0], selSq[1] - 1] : [selSq[0] - 1, selSq[1]];
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

export function clearFill(grid: GridState) {
    Globals.fillQueue = priorityQueue<FillNode>();
    Globals.fillStatus = FillStatus.Ready;

    grid.squares.forEach(row => {
        row.forEach(sq => {
            if (!sq.userContent) {
                sq.fillContent = undefined;
                sq.chosenFillContent = undefined;
            }
        });
    });
}