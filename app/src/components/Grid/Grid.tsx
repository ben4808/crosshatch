import React, { useEffect, useState } from 'react';
import { SquareType } from '../../models/SquareType';
import { SquareProps } from '../Square/SquareProps';
import { GridProps } from './GridProps';
import "./Grid.scss";
import Square from '../Square/Square';
import { GridState } from '../../models/GridState';
import { WordDirection } from '../../models/WordDirection';
import { GridWord } from '../../models/GridWord';
import { GridSquareState } from '../../models/GridSquareState';
import { fill } from '../../lib/fill';
import Globals from '../../lib/windowService';

function Grid(props: GridProps) {
    const [gridState, setGridState] = useState(createNewGrid(props.height, props.width));

    useEffect(() => {
        Globals.fillHandler = handleFill;
        Globals.updateGrid = updateGrid;
    });

    function handleClick(event: any) {
        var target = event.target;
        while (target.classList.length < 1 || !["grid-square", "grid-square-black"].includes(target.classList[0])) {
            target = target.parentElement;
            if (!target) return;
        }

        var row = +target.attributes["data-row"].value;
        var col = +target.attributes["data-col"].value;
        var newGridState = {...gridState};

        var uncheckedSquareDir = getUncheckedSquareDir(newGridState, row, col);
        if (uncheckedSquareDir && newGridState.selectedWord) {
            newGridState.selectedSquare = [row, col];
            newGridState.selectedWord.direction = uncheckedSquareDir;
        }
        else if (newGridState.selectedSquare && newGridState.selectedWord && 
            compareTuples([row, col], newGridState.selectedSquare)) {
            let dir = newGridState.selectedWord.direction;
            newGridState.selectedWord.direction = dir === WordDirection.Across ? WordDirection.Down : WordDirection.Across;
        }
        else {
            newGridState.selectedSquare = [row, col];
        }

        newGridState = generateWords(newGridState);
        setGridState(newGridState);
    }
    
    function handleKeyDown(event: any) {
        var newGridState = {...gridState};
        if (!newGridState.selectedSquare) return;
        var row = newGridState.selectedSquare[0];
        var col = newGridState.selectedSquare[1];

        let key: string = event.key.toUpperCase();
        if (key.match(/^[A-Z]$/)) {
            newGridState.squares[row][col].correctContent = key;
            newGridState.squares[row][col].solverContent = key;
            newGridState = advanceCursor(newGridState);
        }
        if (key === "BACKSPACE") {
            newGridState.squares[row][col].correctContent = undefined;
            newGridState.squares[row][col].solverContent = undefined;
            newGridState = backupCursor(newGridState);
        }
        // toggle black square
        if (key === ".") {
            let type = newGridState.squares[row][col].type;
            newGridState.squares[row][col].type = type === SquareType.White ? SquareType.Black : SquareType.White;
        }

        newGridState = generateWords(newGridState);
        setGridState(newGridState);
    }

    function handleFill() {
        var newGridState = {...gridState};
        fill(newGridState);
        newGridState = generateWords(newGridState);
        setGridState(newGridState);
    }

    function updateGrid(newGridState: GridState) {
        setGridState(newGridState);
    }

    var squareElements = [];
    for (var row = 0; row < props.height; row++) {
        for (var col = 0; col < props.width; col++) {
            var sqProps = getSquareProps(gridState, row, col);
            squareElements.push(getSquareElement(sqProps));
        }
    }

    var columnTemplateStyle = {
        gridTemplateColumns: `repeat(${props.width}, 1fr)`
    } as React.CSSProperties;

    return (
        <div id="Grid" className="grid-container" style={columnTemplateStyle} 
            onClick={handleClick} onKeyDown={handleKeyDown} tabIndex={0}>
            {squareElements}
        </div>
    );
}

export default Grid;

function getSquareElement(props: SquareProps) {
    return <Square {...props}></Square>
}

function getSquareProps(grid: GridState, row: number, col: number): SquareProps {
    var square = grid.squares![row][col];

    return {
        key: `${row},${col}`,
        row: row,
        col: col,
        number: square.number,
        type: square.type,
        content: square.solverContent,
        isSelected: !!grid.selectedSquare && compareTuples(grid.selectedSquare, [row, col]),
        isInSelectedWord: !!grid.selectedWord && doesWordContainSquare(grid.selectedWord, row, col),
    }
}

function createNewGrid(height: number, width: number): GridState {
    var squares: GridSquareState[][] = [];

    for (var row = 0; row < height; row++) {
        squares.push([]);
        for (var col = 0; col < width; col++) {
            squares[row][col] = {
                row: row,
                col: col,
                type: SquareType.White,
            };
        }
    }

    var grid: GridState = {
        height: height,
        width: width,
        squares: squares,
        words: [],
    };

    grid = generateWords(grid);

    return grid;
}

function generateWords(grid: GridState): GridState {
    grid = numberizeGrid(grid);

    var newWords = [];
    var selectedWordDirection = grid.selectedWord?.direction || WordDirection.Across;
    grid.selectedWord = undefined;

    for (var row = 0; row < grid.height; row++) {
        for (var col = 0; col < grid.width; col++) {
            let square = grid.squares[row][col];
            if (!square.number) continue;

            //across
            if (col < grid.width-1 && grid.squares[row][col+1].type === SquareType.White
                && (col === 0 || grid.squares[row][col-1].type === SquareType.Black)) {
                let newWord = buildGridWord(grid, row, col, WordDirection.Across);
                newWords.push(newWord);
                if (grid.selectedSquare && selectedWordDirection === WordDirection.Across &&
                    doesWordContainSquare(newWord, grid.selectedSquare![0], grid.selectedSquare![1])) {
                    grid.selectedWord = newWord;
                }
            }

            //down
            if (row < grid.height-1 && grid.squares[row+1][col].type === SquareType.White
                && (row === 0 || grid.squares[row-1][col].type === SquareType.Black)) {
                let newWord = buildGridWord(grid, row, col, WordDirection.Down);
                newWords.push(newWord);
                if (grid.selectedSquare && selectedWordDirection === WordDirection.Down &&
                    doesWordContainSquare(newWord, grid.selectedSquare![0], grid.selectedSquare![1])) {
                    grid.selectedWord = newWord;
                }
            }
        }
    }

    grid.words = newWords;
    return grid;
}

function numberizeGrid(grid: GridState): GridState {
    var currentNumber = 1;

    for(var row = 0; row < grid.height; row++) {
        for (var col = 0; col < grid.width; col++) {
            var sq = grid.squares![row][col];  
            sq.number = undefined;

            if (sq.type === SquareType.White) {
                let isAboveBlocked = (row === 0 || grid.squares![row-1][col].type === SquareType.Black);
                let isBelowBlocked = (row === grid.height-1 || grid.squares![row+1][col].type === SquareType.Black);
                let isLeftBlocked = (col === 0 || grid.squares![row][col-1].type === SquareType.Black);
                let isRightBlocked = (col === grid.width-1 || grid.squares![row][col+1].type === SquareType.Black);

                let isUnchecked = (isAboveBlocked && isBelowBlocked) || (isLeftBlocked && isRightBlocked);
                let isUncheckedStart = (isAboveBlocked && isBelowBlocked && isLeftBlocked) || 
                                       (isLeftBlocked && isRightBlocked && isAboveBlocked);
                let isCheckedStart = isAboveBlocked || isLeftBlocked;

                if ((isUnchecked && isUncheckedStart) || (!isUnchecked && isCheckedStart)) {
                    sq.number = currentNumber++;
                }
            } 
        }
    }

    return grid;
}

function buildGridWord(grid: GridState, row: number, col: number, dir: WordDirection): GridWord {
    var startSquare;
    var endSquare;
    var curRow = row;
    var curCol = col;
    var curSq = grid.squares[curRow][curCol];
    var correctValue = "";
    var solverValue = "";
    var fillValue = "";

    if (dir === WordDirection.Across) {
        while (curCol > 0 && grid.squares[curRow][curCol-1].type !== SquareType.Black) {
            curSq = grid.squares[curRow][--curCol];
        }
        startSquare = curSq;
        while (curCol < grid.width-1 && grid.squares[curRow][curCol+1].type !== SquareType.Black) {
            correctValue += curSq.correctContent || "?";
            solverValue += curSq.solverContent || "?";
            fillValue += curSq.solverContent || "?";
            curSq = grid.squares![curRow][++curCol];
        }
        correctValue += curSq.correctContent || "?";
        solverValue += curSq.solverContent || "?";
        fillValue += curSq.solverContent || "?";
        endSquare = curSq;
    }
    else {
        while (curRow > 0 && grid.squares[curRow-1][curCol].type !== SquareType.Black) {
            curSq = grid.squares[--curRow][curCol];
        }
        startSquare = curSq;
        while (curRow < grid.height-1 && grid.squares[curRow+1][curCol].type !== SquareType.Black) {
            correctValue += curSq.correctContent || "?";
            solverValue += curSq.solverContent || "?";
            fillValue += curSq.solverContent || "?";
            curSq = grid.squares![++curRow][curCol];
        }
        correctValue += curSq.correctContent || "?";
        solverValue += curSq.solverContent || "?";
        fillValue += curSq.solverContent || "?";
        endSquare = curSq;
    }

    return {
        number: startSquare.number || 0,
        direction: dir,
        start: [startSquare.row, startSquare.col],
        end: [endSquare.row, endSquare.col],
        correctValue: correctValue,
        solverValue: solverValue,
        fillValue: fillValue,
    };
}

function advanceCursor(grid: GridState): GridState {
    if (!grid.selectedSquare || !grid.selectedWord) return grid;
    if (compareTuples(grid.selectedSquare, grid.selectedWord!.end)) return grid;

    if (grid.selectedWord.direction === WordDirection.Across) {
        let selSq = grid.selectedSquare;
        grid.selectedSquare = [selSq[0], selSq[1] + 1];
    }
    else {
        let selSq = grid.selectedSquare;
        grid.selectedSquare = [selSq[0] + 1, selSq[1]];
    }

    let selSq = grid.selectedSquare;
    grid.selectedWord = buildGridWord(grid, selSq[0], selSq[1], grid.selectedWord.direction);
    return grid;
}

function backupCursor(grid: GridState): GridState {
    if (!grid.selectedSquare || !grid.selectedWord) return grid;
    if (compareTuples(grid.selectedSquare, grid.selectedWord.start)) return grid;

    if (grid.selectedWord.direction === WordDirection.Across) {
        let selSq = grid.selectedSquare;
        grid.selectedSquare = [selSq[0], selSq[1] - 1];
    }
    else {
        let selSq = grid.selectedSquare;
        grid.selectedSquare = [selSq[0] - 1, selSq[1]];
    }

    let selSq = grid.selectedSquare;
    grid.selectedWord = buildGridWord(grid, selSq[0], selSq[1], grid.selectedWord.direction);
    return grid;
}

function doesWordContainSquare(word: GridWord, row: number, col: number): boolean {
    var cur = word.start;
    while (!compareTuples(cur, word.end)) {
        if (compareTuples(cur, [row, col])) return true;

        if (word.direction === WordDirection.Across)
            cur = [cur[0], cur[1] + 1];
        else
            cur = [cur[0] + 1, cur[1]];
    }

    return compareTuples(cur, [row, col]);
}

function compareTuples(first: [number, number], second: [number, number]): boolean {
    return first[0] === second[0] && first[1] === second[1];
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