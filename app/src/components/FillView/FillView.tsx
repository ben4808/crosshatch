import React, { useContext } from 'react';
import { SymmetryType } from '../../models/SymmetryType';
import "./FillView.scss";
import Globals from '../../lib/windowService';
import { FillStatus } from '../../models/FillStatus';
import { getGrid, getSection, getSquaresForWord, mapValues } from '../../lib/util';
import { getLongestStackWord, getPhoneticName, insertSectionCandidateIntoGrid, makeNewSection, sectionCandidateKey, updateSectionFilters } from '../../lib/section';
import { getLettersFromSquares, insertEntryIntoGrid } from '../../lib/grid';
import { makeNewNode } from '../../lib/fill';
import { FillNode } from '../../models/FillNode';
import { AppContext } from '../../AppContext';

function FillView(props: any) {
    const appContext = useContext(AppContext);

    function triggerUpdate() {
        appContext.triggerUpdate();
    }

    function handleToggleFill() {
        Globals.handleToggleFill!();
    }

    function handleSymmetryChange(event: any) {
        Globals.gridSymmetry = +SymmetryType[event.target[event.target.selectedIndex].value] as SymmetryType;
    }

    function getSymmetryTypeString(type: string): string {
        switch(type) {
            case "None": return "None";
            case "Rotate180": return "180° Rotational";
            case "Rotate90": return "90° Rotational";
            case "MirrorHorizontal": return "Mirror Horizontally";
            case "MirrorVertical": return "Mirror Vertically";
            case "MirrorNWSE": return "Mirror NW to SE";
            case "MirrorNESW": return "Mirror NE to SW";
        }
        return "";
    }

    function getSymmetryTypesForRectGrids(): string[] {
        return ["None", "Rotate180", "MirrorHorizontal", "MirrorVertical"];
    }

    function getFillStatusString(status: FillStatus): string {
        switch(status) {
            case FillStatus.Ready: return "Ready to Fill";
            case FillStatus.Running: return "Fill Running...";
            case FillStatus.Complete: return "Fill Complete";
            case FillStatus.Failed: return "Fill Failed";
            default: return "";
        }
    }

    function getManualEntryNode(entry: string): FillNode {
        let node = Globals.selectedWordNode!;
        let wordKey = Globals.selectedWordKey!;
        insertEntryIntoGrid(node, wordKey, entry);
        return node;
    }

    function getManualSectionNode(sectionCandidateKey: string): FillNode {
        let grid = getGrid();

        let node = makeNewNode(grid, 0, false, undefined);
        let section = getSection();
        let candidate = section.candidates.get(sectionCandidateKey)!;
        insertSectionCandidateIntoGrid(node.startGrid, candidate, section);
        return node;
    }

    function handleEntryCandidateClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        if (!Globals.selectedWordKey) return;

        let entry = target.attributes["data-word"].value as string;
        let node = getManualEntryNode(entry);

        Globals.activeGrid = node.endGrid;
        updateSectionFilters();
        triggerUpdate();
    }

    function handleEntryCandidateHover(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        if (!Globals.selectedWordKey) return;

        let entry = target.attributes["data-word"].value as string;
        let node = getManualEntryNode(entry);

        Globals.hoverGrid = node.endGrid;
        triggerUpdate();
    }

    function handleEntryCandidateBlur() {
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function handleSectionClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        let sectionId = +target.attributes["data-id"].value;
        if (Globals.selectedSectionIds!.get(sectionId))
            Globals.selectedSectionIds!.delete(sectionId);
        else
            Globals.selectedSectionIds!.set(sectionId, true);

        updateSectionFilters();
        triggerUpdate();
    }

    function handleSectionCandidateClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        let candidateKey = target.attributes["data-candidate-key"].value as string;
        let node = getManualSectionNode(candidateKey);

        Globals.hoverGrid = node.endGrid;
        updateSectionFilters();
        triggerUpdate();
    }

    function handleSectionCandidateHover(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        let candidateKey = target.attributes["data-candidate-key"].value as string;
        let node = getManualSectionNode(candidateKey);

        Globals.hoverGrid = node.endGrid;
        triggerUpdate();
    }

    function handleSectionCandidateBlur() {
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function doNothing(event: any) {

    }

    let grid = getGrid();
    let selectedSymmetry = SymmetryType[Globals.gridSymmetry!];
    let symmetryOptions = (!grid || grid.width === grid.height) ?
        Object.values(SymmetryType).filter(t => isNaN(Number(t))) :
        getSymmetryTypesForRectGrids();

    let fillStatus = getFillStatusString(Globals.fillStatus!);

    let entryCandidates = Globals.selectedWordNode ? Globals.selectedWordNode.entryCandidates : [];
    let sections = Globals.sections ? mapValues(Globals.sections!).sort((a, b) => b.squares.size - a.squares.size) : [];
    let activeSection = Globals.sections ? Globals.sections!.get(Globals.activeSectionId!)! : makeNewSection(-1);
    let sectionCandidates = mapValues(activeSection.candidates).sort((a, b) => b.score - a.score);

    let entryCandidatesStyle = {
        gridTemplateColumns: `4fr 1fr 2fr`
    } as React.CSSProperties;

    let sectionsStyle = {
        gridTemplateColumns: `1fr 2fr 1fr`
    } as React.CSSProperties;

    let completedOptionsStyle = {
        gridTemplateColumns: `4fr 1fr 2fr`
    } as React.CSSProperties;

    return (
        <div id="FillView" className="fill-container">
            <div style={{display: "none"}}>{props.updateSemaphoreProp}</div>
            <div className="custom-control custom-switch fill-switch">
                <input type="checkbox" className="custom-control-input" id="fillSwitch" onClick={handleToggleFill} />
                <label className="custom-control-label" htmlFor="fillSwitch">Fill</label>
            </div>
            <div className="fill-status">{fillStatus}</div>
            <br />
            Grid Symmetry: <br />
            <select className="custom-select symmetry-select" defaultValue={selectedSymmetry} onChange={handleSymmetryChange}>
                {symmetryOptions.map(type => (
                    <option value={type} key={type}>{getSymmetryTypeString(type.toString())}</option>
                ))}
            </select>

            <div className="fill-lists">
                <div className="fill-list-box">
                    <div className="fill-list-title">Word List Updates</div>
                    <div className="fill-list-button">Export</div>
                    <input type="text" className="fill-add-word-box" placeholder="Add word..."></input>
                    <div className="fill-list" style={{marginTop: "5px", height: "300px"}}>

                    </div>
                </div>
                <div className="fill-list-box" onMouseOut={handleEntryCandidateBlur}>
                    <div className="fill-list-title">Entry Candidates</div>
                    <div className="fill-list" style={entryCandidatesStyle}>
                        <div className="fill-list-header">Entry</div>
                        <div className="fill-list-header">Score</div>
                        <div className="fill-list-header">Iffy</div>
                        { entryCandidates.map(ec => (
                            <div className="fill-list-row-wrapper" key={ec.word} data-word={ec.word}
                                onClick={handleEntryCandidateClick} onMouseOver={handleEntryCandidateHover}>
                                <div>{ec.word}</div>
                                <div>{ec.score.toFixed(0)}</div>
                                <div>{ec.madeUpWord || ""}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="fill-list-box">
                    <div className="fill-list-title">Sections</div>
                    <div className="fill-list" style={sectionsStyle}>
                        <div className="fill-list-header">Active</div>
                        <div className="fill-list-header">ID</div>
                        <div className="fill-list-header">Size</div>
                        { sections.map(sec => (
                            <div className="fill-list-row-wrapper" key={sec.id} data-id={sec.id} onClick={handleSectionClick}>
                                <div><input type="checkbox" className="section-checkbox"
                                    checked={Globals.selectedSectionIds!.has(sec.id)} onChange={doNothing} /></div>
                                <div>{getPhoneticName(sec.id)}</div>
                                <div>{sec.squares.size}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="fill-list-box" onMouseOut={handleSectionCandidateBlur}>
                    <div className="fill-list-title">Completed Options</div>
                    <div className="fill-list" style={completedOptionsStyle}>
                        <div className="fill-list-header">Longest</div>
                        <div className="fill-list-header">Score</div>
                        <div className="fill-list-header">Iffy</div>
                        { sectionCandidates.map(sc => {
                            let entry = getLettersFromSquares(getSquaresForWord(sc.grid, getLongestStackWord(activeSection)));
                            let candidateKey = sectionCandidateKey(activeSection, sc.grid);

                            return (
                            <div className="fill-list-row-wrapper" key={candidateKey} data-candidate-key={candidateKey}
                                onClick={handleSectionCandidateClick} onMouseOver={handleSectionCandidateHover}>
                                <div>{entry}</div>
                                <div>{sc.score}</div>
                                <div>{sc.iffyEntry || ""}</div>
                            </div>
                            )})}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default FillView;
