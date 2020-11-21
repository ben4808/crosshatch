import React, { useEffect, useState } from 'react';
import { SquareType } from '../../models/SquareType';
import { SquareProps } from '../Square/SquareProps';
import "./Grid.scss";
import Square from '../Square/Square';
import { GridState } from '../../models/GridState';
import { WordDirection } from '../../models/WordDirection';
import Globals from '../../lib/windowService';
import { compareTuples, doesWordContainSquare, getGrid, getWordAtSquare, newWord, otherDir } from '../../lib/util';
import { clearFill, getUncheckedSquareDir, populateWords, updateGridConstraintInfo } from '../../lib/grid';
import { GridWord } from '../../models/GridWord';

function Grid(props: any) {
    const [selectedSquare, setSelectedSquare] = useState([-1, -1] as [number, number]);
    const [selectedWord, setSelectedWord] = useState(newWord());
    const [updateSemaphore, setUpdateSemaphore] = useState(0);

    useEffect(() => {
        forceUpdate();
    }, [props.updateSemaphore]);

    function handleClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || !["grid-square", "grid-square-black"].includes(target.classList[0])) {
            target = target.parentElement;
            if (!target) return;
        }

        let row = +target.attributes["data-row"].value;
        let col = +target.attributes["data-col"].value;
        let grid = getGrid();
        
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
        if (Globals.isVisualFillRunning) return;
        if (!isSquareSelected()) return;

        let grid = getGrid();
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
            clearFill(grid);
            populateWords(grid);
            //updateGridConstraintInfo(grid);
        }
        else if (letterChanged)  {
            clearFill(grid);
            //updateGridConstraintInfo(grid);
        }

        forceUpdate();
    }

    function advanceCursor() {
        if (!isSquareSelected()) return;
    
        let selSq = selectedSquare;
        let grid = getGrid();
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

    function forceUpdate() {
        setUpdateSemaphore(updateSemaphore + 1);
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
            isCircled: square.isCircled,
        };
    }

    function getSquareElement(props: SquareProps) {
        return <Square {...props}></Square>
    }

    let grid: GridState = Globals.puzzle!.grid!;

    let squareElements = [];
    for (let row = 0; row < grid.height; row++) {
        for (let col = 0; col < grid.width; col++) {
            let sqProps = getSquareProps(grid, row, col, selectedSquare, selectedWord);
            squareElements.push(getSquareElement(sqProps));
        }
    }

    let columnTemplateStyle = {
        gridTemplateColumns: `repeat(${grid.width}, 1fr)`
    } as React.CSSProperties;

    return (
        <div id="Grid" className="grid-container" style={columnTemplateStyle}
            onClick={handleClick} onKeyDown={handleKeyDown} tabIndex={0}>
            {squareElements}
        </div>
    );
}

export default Grid;
