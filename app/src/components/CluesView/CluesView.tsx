import { CluesViewProp, CluesViewProps } from "./CluesViewProps";
import React, { useState } from 'react';
import "./CluesView.scss";
import { deepClone } from "../../lib/util";

function CluesView(props: CluesViewProps) {
    const [toggleStates, setToggleStates] = useState(initToggleStates());

    function initToggleStates(): Map<string, boolean> {
        let map = new Map<string, boolean>();
        props.acrossClues?.forEach(clue => {
            map.set(getClueKey(clue, true), false);
        });
        props.downClues?.forEach(clue => {
            map.set(getClueKey(clue, false), false);
        });
        return map;
    }

    function toggleEditor(event: any) {
        let target = event.target;
        let targetKey = target.attributes["data-key"].value;
        
        var newToggleStates = deepClone(toggleStates);
        newToggleStates.set(targetKey, !newToggleStates.get(targetKey));
        setToggleStates(newToggleStates);
    }

    function handleKeyDown(event: any) {
        let target = event.target;
        let targetKey: string = target.attributes["data-key"].value;
        let keyPressed: string = event.key.toUpperCase();

        if (keyPressed === "ENTER") {
            let number = +targetKey.slice(0, targetKey.length-1);
            let dir = targetKey[targetKey.length-1];
            let clue = dir === "A" ? 
                props.acrossClues!.find(c => c.number === number) : 
                props.downClues!.find(c => c.number === number);

            clue!.clue = target.value;
            var newToggleStates = deepClone(toggleStates);
            newToggleStates.set(targetKey, false);
            setToggleStates(newToggleStates);
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
                        <div key={getClueKey(clue, isAcross)}>
                            <div className="clue" data-key={getClueKey(clue, isAcross)} onClick={toggleEditor}>
                                <div className="clue-number">{clue.number}</div>
                                <div className="clue-entry">{clue.entry}</div>
                                {clue.clue.length > 0 ? clue.clue : "(blank clue)"}
                            </div>
                            {toggleStates.get(getClueKey(clue, isAcross)) &&
                                <textarea className="clue-editor" defaultValue={clue.clue} data-key={getClueKey(clue, isAcross)}
                                    onKeyDown={handleKeyDown} onFocus={handleFocus}>
                                </textarea>
                            }
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    function getClueKey(clue: CluesViewProp, isAcross: boolean): string {
        return clue.number.toString() + (isAcross ? "A" : "D");
    }

    return (
        <div className="clues-view">
            {renderCluesContainer(true, props.acrossClues!)}
            {renderCluesContainer(false, props.downClues!)}
        </div>
    )
}

export default CluesView;
