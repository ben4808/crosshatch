import React, { useContext, useEffect, useState } from 'react';
import { SquareType } from '../../models/SquareType';
import { SquareProps } from '../Square/SquareProps';
import "./Grid.scss";
import Square from '../Square/Square';
import { GridState } from '../../models/GridState';
import { WordDirection } from '../../models/WordDirection';
import Globals from '../../lib/windowService';
import { clueKey, compareTuples, doesWordContainSquare, getGrid, getWordAtSquare, newWord, otherDir } from '../../lib/util';
import { clearFill, getUncheckedSquareDir, populateWords, updateGridConstraintInfo } from '../../lib/grid';
import { GridWord } from '../../models/GridWord';
import { AppContext } from '../../AppContext';
import { SymmetryType } from '../../models/SymmetryType';

function Grid(props: any) {
    const [selectedSquare, setSelectedSquare] = useState([-1, -1] as [number, number]);
    const [selectedWord, setSelectedWord] = useState(newWord());
    const appContext = useContext(AppContext);

    useEffect(() => {
        if (selectedWord.start[0] > -1 && clueKey(selectedWord) !== Globals.selectedWordKey)
            clearSelection();
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        
        let newDirection = Globals.selectedWordDir!;

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

        let newSelectedWord = getWordAtSquare(grid, row, col, newDirection) || newWord();
        setSelectedWord(newSelectedWord);
        Globals.selectedWordKey = clueKey(newSelectedWord);
        Globals.selectedWordDir = newSelectedWord.direction;
        appContext.triggerUpdate();
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
                getSymmetrySquares([row, col]).forEach(res => {
                    let resSq = grid.squares[res[0]][res[1]];
                    resSq.type = SquareType.White;
                });

                blackSquareChanged = true;
            }

            sq.userContent = undefined;
            sq.chosenFillContent = undefined;
            sq.fillContent = undefined;
            backupCursor();
        }
        // toggle black square
        if (key === ".") {
            let newSquareType = sq.type === SquareType.White ? SquareType.Black : SquareType.White;
            getSymmetrySquares([row, col]).forEach(res => {
                let resSq = grid.squares[res[0]][res[1]];
                resSq.type = newSquareType;
            });

            blackSquareChanged = true;
            letterChanged = false;
            advanceCursor();
        }

        if (blackSquareChanged) {
            setSelectedWord(newWord());
            clearFill(grid);
            populateWords(grid);
            //updateGridConstraintInfo(grid);
        }
        else if (letterChanged)  {
            clearFill(grid);
            //updateGridConstraintInfo(grid);
        }

        appContext.triggerUpdate();
    }

    function getSymmetrySquares(initSquare: [number, number]): [number, number][] {
        let grid = getGrid();
        let w = grid.width - 1;
        let h = grid.height - 1;
        let r = initSquare[0];
        let c = initSquare[1];
        let symmetryType = SymmetryType[Globals.gridSymmetry!];
        let ret = [initSquare];

        switch (symmetryType) {
            case "Rotate180":
                ret.push([h - r, w - c]);
                break;
            case "Rotate90":
                ret.push([c, h - r]);
                ret.push([h - r, w - c]);
                ret.push([w - c, r]);
                break;
            case "MirrorHorizontal":
                ret.push([r, w - c]);
                break;
            case "MirrorVertical":
                ret.push([h - r, c]);
                break;
            case "MirrorNWSE":
                ret.push([w - c, h - r]);
                break;
            case "MirrorNESW":
                ret.push([c, r]);
                break;
        }

        return ret;
    }

    function advanceCursor() {
        if (!isSquareSelected()) return;
    
        let selSq = selectedSquare;
        let grid = getGrid();
        let dir = Globals.selectedWordDir!;
        if ((dir === WordDirection.Across && selSq[1] === grid.width-1) || (dir === WordDirection.Down && selSq[0] === grid.height-1))
            return;
        setSelectedSquare(dir === WordDirection.Across ? [selSq[0], selSq[1] + 1] : [selSq[0] + 1, selSq[1]]);
    }
    
    function backupCursor() {
        if (!isSquareSelected()) return;
    
        let selSq = selectedSquare;
        let dir = Globals.selectedWordDir!;
        if ((dir === WordDirection.Across && selSq[1] === 0) || (dir === WordDirection.Down && selSq[0] === 0))
            return;
        setSelectedSquare(dir === WordDirection.Across ? [selSq[0], selSq[1] - 1] : [selSq[0] - 1, selSq[1]]);
    }

    function clearSelection() {
        setSelectedSquare([-1, -1]);
        setSelectedWord(newWord());
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

    function suppressEnterKey(event: any) {
        let keyPressed: string = event.key.toUpperCase();

        if (keyPressed === "ENTER") {
            event.preventDefault();
        }
    }

    function handleFocus(event: any) {
        selectElementContents(event.target);
    }

    // https://stackoverflow.com/questions/6139107/programmatically-select-text-in-a-contenteditable-html-element/6150060#6150060
    function selectElementContents(el: any) {
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel!.removeAllRanges();
        sel!.addRange(range);
    }

    function setTitle() {
        let newTitle = document.getElementById("puzzleTitle")!.innerText;
        Globals.puzzle!.title = newTitle === "(title)" ? "Untitled" : newTitle;
    }

    function setAuthor() {
        let newAuthor = document.getElementById("puzzleAuthor")!.innerText;
        Globals.puzzle!.author = newAuthor === "(author)" ? "" : newAuthor;
    }

    function setCopyright() {
        let newCopyright = document.getElementById("puzzleCopyright")!.innerText;
        Globals.puzzle!.copyright = newCopyright === "© copyright" ? "" : newCopyright;
    }

    function setNotes() {
        let newNotes = document.getElementById("puzzleNotes")!.innerText;
        Globals.puzzle!.notes = newNotes === "(notes)" ? "" : newNotes;
    }

    let puzzle = Globals.puzzle!;
    let grid = puzzle.grid!;

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
        <>
            <div className="puzzle-author-by">&nbsp;</div>
            <div id="puzzleTitle" className="puzzle-title editable" contentEditable={true} suppressContentEditableWarning={true}
                onKeyDown={suppressEnterKey} onBlur={setTitle} onFocusCapture={handleFocus}>{puzzle.title || "(title)"}</div>
            <div className="puzzle-author-by">by&nbsp;</div>
            <div id="puzzleAuthor" className="puzzle-author editable" contentEditable={true} suppressContentEditableWarning={true}
                onKeyDown={suppressEnterKey} onBlur={setAuthor} onFocusCapture={handleFocus}>{puzzle.author || "(author)"}</div>
            <div className="puzzle-author-by">&nbsp;</div>
            <div id="puzzleCopyright" className="puzzle-copyright editable" contentEditable={true} suppressContentEditableWarning={true}
                onKeyDown={suppressEnterKey} onBlur={setCopyright} onFocusCapture={handleFocus}>{puzzle.copyright || "© copyright"}</div>
            
            <div id="Grid" className="grid-container" style={columnTemplateStyle}
                onClick={handleClick} onKeyDown={handleKeyDown} tabIndex={0}>
                {squareElements}
            </div>

            <div className="puzzle-notes-label">Notes:</div>
            <div id="puzzleNotes" className="puzzle-notes editable" contentEditable={true} suppressContentEditableWarning={true}
                onKeyDown={suppressEnterKey} onBlur={setNotes} onFocusCapture={handleFocus}>{puzzle.notes || "(notes)"}</div>
        </>
    );
}

export default Grid;
