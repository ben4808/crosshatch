import { CluesViewProp, CluesViewProps } from "./CluesViewProps";
import React from 'react';

function CluesView(props: CluesViewProps) {
    return (
        <>
            {renderCluesContainer(true, props.acrossClues!)}
            {renderCluesContainer(false, props.downClues!)}
        </>
    )
}

function renderCluesContainer(isAcross: boolean, clueList: CluesViewProp[]) {
    return (
        <div className="clues-container">
            <div className="clues-header">{isAcross ? "ACROSS" : "DOWN"}</div>
            {clueList.map(clue => {
                <div className="clue">
                    <div className="clue-number">{clue.number}</div>
                    <div className="clue-clue" contentEditable="true">
                        <div className="clue-entry">{clue.entry}</div>
                        {clue.clue}
                    </div>
                </div>
            })}
        </div>
    );
}

export default CluesView;