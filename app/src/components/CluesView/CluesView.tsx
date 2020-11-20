import { CluesViewProp } from "./CluesViewProp";
import React, { useEffect, useState } from 'react';
import "./CluesView.scss";
import { clueKey, deepClone, getSquaresForWord } from "../../lib/util";
import Globals from '../../lib/windowService';
import { getLettersFromSquares } from "../../lib/grid";
import { WordDirection } from "../../models/WordDirection";

function CluesView(props: any) {
    const [clueProps, setClueProps] = useState(initClueProps());

    useEffect(() => {
        setClueProps(initClueProps());
    }, [props.updateSemaphore]);

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
                entry: getLettersFromSquares(squares),
                isOpenForEditing: false,
            } as CluesViewProp;
            props.push(prop);
        });
        return props;
    }

    function toggleEditor(event: any) {
        let target = event.target;
        while (!["clue"].includes(target.classList[0])) {
            target = target.parentElement;
            if (!target) return;
        }
        let targetKey = target.attributes["data-key"].value;
        
        let newClueProps = deepClone(clueProps) as CluesViewProp[];
        newClueProps.find(p => p.key === targetKey)!.isOpenForEditing = true;
        setClueProps(newClueProps);
    }

    function handleKeyDown(event: any) {
        let target = event.target;
        let targetKey: string = target.attributes["data-key"].value;
        let keyPressed: string = event.key.toUpperCase();

        if (keyPressed === "ENTER") {
            let newClueProps = deepClone(clueProps) as CluesViewProp[];
            let targetProp = newClueProps.find(p => p.key === targetKey)!;
            targetProp.clue = target.value;
            targetProp.isOpenForEditing = false;
            Globals.puzzle!.clues.set(targetKey, target.value);
            setClueProps(newClueProps);
        }
    }

    function handleFocus(event: any) {
        event.target.select();
    }

    function renderCluesContainer(isAcross: boolean, clueList: CluesViewProp[]) {
        return (
            <div className="clues-container">
                <div className="clues-header">{isAcross ? "ACROSS" : "DOWN"}</div>
                <div className="clues-clues">
                    {clueList.map(clue => (
                        <div key={clue.key}>
                            <div className="clue" data-key={clue.key} onClick={toggleEditor}>
                                <div className="clue-number">{clue.number}</div>
                                <div className="clue-entry" style={{display:"none"}}>{clue.entry}</div>
                                {clue.clue.length > 0 ? clue.clue : "(blank clue)"}
                            </div>
                            {clue.isOpenForEditing &&
                                <textarea className="clue-editor" defaultValue={clue.clue} data-key={clue.key}
                                    onKeyDown={handleKeyDown} onFocus={handleFocus}>
                                </textarea>
                            }
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="clues-view">
            {renderCluesContainer(true, clueProps.filter(p => p.direction === WordDirection.Across))}
            {renderCluesContainer(false, clueProps.filter(p => p.direction === WordDirection.Down))}
        </div>
    )
}

export default CluesView;
