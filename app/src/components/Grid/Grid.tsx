import React, { useContext, useReducer, useState } from 'react';
import { SquareType } from '../../models/SquareType';
import { SquareProps } from '../Square/SquareProps';
import "./Grid.scss";
import Square from '../Square/Square';
import { GridState } from '../../models/GridState';
import { WordDirection } from '../../models/WordDirection';
import Globals from '../../lib/windowService';
import { compareTuples, doesWordContainSquare, getGrid, getSelectedWord, getWordAtSquare, mapKeys, otherDir, squareKey, wordKey } from '../../lib/util';
import { getSymmetrySquares, getUncheckedSquareDir, populateWords, setSquaresEmptyForManualFill, unsetSquaresEmptyForManualFill, updateGridConstraintInfo } from '../../lib/grid';
import { GridWord } from '../../models/GridWord';
import { AppContext } from '../../AppContext';
import { ContentType } from '../../models/ContentType';
import { generateGridSections, updateSectionFilters } from '../../lib/section';
import { QualityClass } from '../../models/QualityClass';
import { GridSquare } from '../../models/GridSquare';
import { makeNewNode, populateAndScoreEntryCandidates } from '../../lib/fill';

function Grid(props: any) {
    const [selectedSquare, setSelectedSquare] = useState([-1, -1] as [number, number]);
    // eslint-disable-next-line
    const [ignored, forceUpdate] = useReducer(x => x + 1, 0);
    const appContext = useContext(AppContext);

    // useEffect(() => {
    //     Globals.fillWord = handleFillWord;
    //     Globals.fillGrid = handleFillGrid;
    //     Globals.pauseFill = handlePauseFill;
    //     // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, []);

    // function handleFillWord() {
    //     fillWord();
    //     forceUpdate();
    // }

    // function handleFillGrid() {
    //     Globals.isFillRunning = true;
    //     doFillGrid();
    // }

    // function doFillGrid() {
    //     if (!Globals.isFillRunning) return;

    //     fillWord();
    //     forceUpdate();
    //     setTimeout(() => doFillGrid(), 5);
    // }

    // function handlePauseFill() {
    //     Globals.isFillRunning = false;
    //     forceUpdate();
    // }

    function handleClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || !["grid-square", "grid-square-black"].includes(target.classList[0])) {
            target = target.parentElement;
            if (!target) return;
        }

        let row = +target.attributes["data-row"].value;
        let col = +target.attributes["data-col"].value;
        let grid = getGrid();
        
        let newDirection = Globals.selectedWordDir || WordDirection.Across;

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

        Globals.selectedWordDir = newDirection;
        setSelWordAtSelSquare([row, col]);

        if (Globals.selectedWordKey) {
            let node = makeNewNode(grid, 0, false, undefined);
            node.fillWord = grid.words.get(Globals.selectedWordKey!);
            setSquaresEmptyForManualFill(node);
            populateAndScoreEntryCandidates(node, true);
            unsetSquaresEmptyForManualFill(node);
            Globals.selectedWordNode = node;
        }
        else 
            Globals.selectedWordNode = undefined;

        appContext.triggerUpdate();
    }
    
    function handleKeyDown(event: any) {
        if (!isSquareSelected()) return;

        let grid = getGrid();
        let row = selectedSquare[0];
        let col = selectedSquare[1];

        let key: string = event.key.toUpperCase();
        let letterChanged = false;
        let blackSquareChanged = false;
        let sq = grid.squares[row][col];

        if (key.match(/^[A-Z]$/)) {
            advanceCursor();

            if (sq.type === SquareType.Black) return;
            if (sq.content === key && sq.contentType !== ContentType.Autofill) return;

            sq.content = key;
            sq.contentType = ContentType.User;
            letterChanged = true;
        }
        if (key === "BACKSPACE") {
            backupCursor();

            if (sq.content !== undefined && sq.contentType !== ContentType.Autofill) letterChanged = true;
            if (sq.type === SquareType.Black) {
                getSymmetrySquares([row, col]).forEach(res => {
                    let resSq = grid.squares[res[0]][res[1]];
                    resSq.type = SquareType.White;
                });

                blackSquareChanged = true;
            }

            sq.content = undefined;
            sq.contentType = ContentType.User;
        }
        // toggle black square
        if (key === ".") {
            advanceCursor();

            let newSquareType = sq.type === SquareType.White ? SquareType.Black : SquareType.White;
            getSymmetrySquares([row, col]).forEach(res => {
                let resSq = grid.squares[res[0]][res[1]];
                resSq.type = newSquareType;
            });

            blackSquareChanged = true;
        }
        // toggle cirlced square
        if (key === ",") {
            if (sq.type === SquareType.Black) return;
            sq.isCircled = !sq.isCircled;
        }

        if (blackSquareChanged) {
            populateWords(grid);
            Globals.sections = generateGridSections(grid);
            Globals.selectedWordNode = undefined;
            updateGridConstraintInfo(grid);
        }
        else if (letterChanged)  {
            updateSectionFilters();
            updateGridConstraintInfo(grid);
        }

        appContext.triggerUpdate();
    }

    function advanceCursor() {
        if (!isSquareSelected()) return;
    
        let selSq = selectedSquare;
        let grid = getGrid();
        let dir = Globals.selectedWordDir!;
        if ((dir === WordDirection.Across && selSq[1] === grid.width-1) || (dir === WordDirection.Down && selSq[0] === grid.height-1))
            return;

        let newSelSq = (dir === WordDirection.Across ? [selSq[0], selSq[1] + 1] : [selSq[0] + 1, selSq[1]]) as [number, number];
        setSelectedSquare(newSelSq);
        setSelWordAtSelSquare(newSelSq);
    }
    
    function backupCursor() {
        if (!isSquareSelected()) return;
    
        let selSq = selectedSquare;
        let dir = Globals.selectedWordDir!;
        if ((dir === WordDirection.Across && selSq[1] === 0) || (dir === WordDirection.Down && selSq[0] === 0))
            return;

        let newSelSq = (dir === WordDirection.Across ? [selSq[0], selSq[1] - 1] : [selSq[0] - 1, selSq[1]]) as [number, number];
        setSelectedSquare(newSelSq);
        setSelWordAtSelSquare(newSelSq);
    }

    function isSquareSelected(): boolean {
        return selectedSquare[0] > -1;
    }
    
    function isWordSelected(): boolean {
        return !!getSelectedWord();
    }

    function isSquareInSelectedSection(sq: GridSquare): boolean {
        return !!sections.find(s => s.squares.has(squareKey(sq)))
    }

    function setSelWordAtSelSquare(newSelSquare: [number, number]) {
        let grid = getGrid();
        let word = getWordAtSquare(grid, newSelSquare[0], newSelSquare[1], Globals.selectedWordDir!);
        Globals.selectedWordKey = word ? wordKey(word) : undefined;
    }

    function getSquareProps(grid: GridState, row: number, col: number, 
        selectedSquare: [number, number], selectedWord: GridWord | undefined): SquareProps {
        let square = grid.squares[row][col];
    
        return {
            key: `${row},${col}`,
            row: row,
            col: col,
            number: square.number,
            type: square.type,
            content: square.content,
            contentType: square.contentType,
            qualityClass: QualityClass.Normal,
            isSelected: isSquareSelected() && compareTuples(selectedSquare, [row, col]),
            isInSelectedWord: isWordSelected() && doesWordContainSquare(selectedWord!, row, col),
            isInSelectedSection: isSquareInSelectedSection(square),
            constraintSum: (square.constraintInfo && square.constraintInfo!.isCalculated) ? square.constraintInfo.sumTotal : 1000,
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
    let grid = Globals.hoverGrid ? Globals.hoverGrid! : getGrid();
    let sections = Globals.hoverSectionId !== undefined ? [Globals.sections!.get(Globals.hoverSectionId!)!] 
        : mapKeys(Globals.selectedSectionIds!).map(k => Globals.sections!.get(k)!);

    let squareElements = [];
    for (let row = 0; row < grid.height; row++) {
        for (let col = 0; col < grid.width; col++) {
            let sqProps = getSquareProps(grid, row, col, selectedSquare, getSelectedWord());
            squareElements.push(getSquareElement(sqProps));
        }
    }

    let columnTemplateStyle = {
        gridTemplateColumns: `repeat(${grid.width}, 1fr)`
    } as React.CSSProperties;

    return (
        <>
            <div style={{display: "none"}}>{props.updateSemaphoreProp}</div>
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
