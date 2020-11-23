import { CluesViewProp } from "./CluesViewProp";
import React, { createRef, useEffect, useRef, useState } from 'react';
import "./CluesView.scss";
import { clueKey, deepClone, getSquaresForWord } from "../../lib/util";
import Globals from '../../lib/windowService';
import { getLettersFromSquares } from "../../lib/grid";
import { WordDirection } from "../../models/WordDirection";

function CluesView(props: any) {
    const [clueProps, setClueProps] = useState(initClueProps());
    const [selectedKey, setSelectedKey] = useState("");
    const textareasRef = useRef([] as any[]);

    useEffect(() => {
        setClueProps(initClueProps());
        setSelectedKey(Globals.selectedWordKey!);
    }, [props.updateSemaphore])

    function initClueProps(): CluesViewProp[] {
        let props = [] as CluesViewProp[];
        if (!Globals.puzzle) return props;

        let grid = Globals.puzzle.grid;
        let words = Globals.puzzle.grid.words;
        let clues = Globals.puzzle.clues;
        words.forEach(word => {
            let key = clueKey(word);
            let squares = getSquaresForWord(grid, word);
            let prop = {
                number: word.number!,
                key: key,
                direction: word.direction,
                clue: clues.get(key)! || "",
                entry: getLettersFromSquares(squares, false),
                isOpenForEditing: false,
            } as CluesViewProp;
            props.push(prop);
        });
        return props;
    }

    function handleClueClick(event: any) {
        let target = event.target;
        while (!["clue"].includes(target.classList[0])) {
            target = target.parentElement;
            if (!target) return;
        }
        let targetKey = target.attributes["data-key"].value;
        let refIndex = +target.attributes["data-ref-index"].value;
        let textareaEl = textareasRef.current[refIndex].current;
        
        let newClueProps = deepClone(clueProps) as CluesViewProp[];
        let propToToggle = newClueProps.find(p => p.key === targetKey)!;
        propToToggle.isOpenForEditing = !propToToggle.isOpenForEditing;
        setClueProps(newClueProps);

        if (propToToggle.isOpenForEditing) {
            textareaEl.value = propToToggle.clue;
            textareaEl.style.display = "inherit"; // have to do this before we can autofocus
            textareaEl.focus();
        }
    }

    function handleKeyDown(event: any) {
        let target = event.target;
        let targetKey: string = target.attributes["data-key"].value;
        let keyPressed: string = event.key.toUpperCase();

        if (keyPressed === "ENTER") {
            applyClueChange(targetKey, target.value);
        }
    }

    function handleFocus(event: any) {
        event.target.select();
    }

    function applyClueChange(targetKey: string, newValue: string) {
        let newClueProps = deepClone(clueProps) as CluesViewProp[];
        let targetProp = newClueProps.find(p => p.key === targetKey)!;
        targetProp.clue = newValue === "(blank clue)" ? "" : newValue;
        targetProp.isOpenForEditing = false;
        Globals.puzzle!.clues.set(targetKey, newValue);
        setClueProps(newClueProps);
    }

    function renderCluesContainer(isAcross: boolean, clueList: CluesViewProp[], refIndex: number) {
        return (
            <div className="clues-container">
                <div className="clues-header">{isAcross ? "ACROSS" : "DOWN"}</div>
                <div className="clues-clues">
                    {clueList.map(clue => {
                        textareasRef.current.push(createRef());
                        let ret = (
                            <div key={clue.key}>
                                <div className={"clue" + (clue.key === selectedKey ? " clue-selected" : "")}
                                    data-key={clue.key} onClick={handleClueClick} data-ref-index={refIndex}>
                                    <div className="clue-number">{clue.number}</div>
                                    <div className="clue-entry">{clue.entry}</div>
                                    {clue.entry.length > 15 && <br />}
                                    {clue.clue.length > 0 ? clue.clue : "(blank clue)"}
                                </div>
                                <textarea className="clue-editor" defaultValue={clue.clue} data-key={clue.key} 
                                    style={{display: clue.isOpenForEditing ? "inherit" : "none"}}
                                    onKeyDown={handleKeyDown} onFocus={handleFocus}
                                    ref={textareasRef.current[refIndex]}>
                                </textarea>
                            </div>
                        );
                        refIndex++;
                        return ret;
                    })}
                </div>
            </div>
        );
    }

    textareasRef.current = [] as any[];
    let acrossClues = clueProps.filter(p => p.direction === WordDirection.Across);
    let downClues = clueProps.filter(p => p.direction === WordDirection.Down);

    return (
        <div className="clues-view">
            {renderCluesContainer(true, acrossClues, 0)}
            {renderCluesContainer(false, downClues, acrossClues.length)}
        </div>
    )
}

export default CluesView;
