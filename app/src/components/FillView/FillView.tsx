import React, { useContext, useState } from 'react';
import { SymmetryType } from '../../models/SymmetryType';
import "./FillView.scss";
import Globals from '../../lib/windowService';
import { FillStatus } from '../../models/FillStatus';
import { getEntryAtWordKey, getGrid, getSection, getSquaresForWord, mapValues } from '../../lib/util';
import { calculateSectionOrder, getLongestStackWord, getPhoneticName, insertSectionCandidateIntoGrid, 
    makeNewSection, sectionCandidateKey, updateSectionFilters } from '../../lib/section';
import { getLettersFromSquares, insertEntryIntoGrid, updateManualEntryCandidates } from '../../lib/grid';
import { fillSectionWord, makeNewNode } from '../../lib/fill';
import { FillNode } from '../../models/FillNode';
import { AppContext } from '../../AppContext';
import { ContentType } from '../../models/ContentType';
import { Section } from '../../models/Section';

function FillView(props: any) {
    const appContext = useContext(AppContext);
    const [showZeroEntries, setShowZeroEntries] = useState(false);

    function triggerUpdate() {
        appContext.triggerUpdate();
    }

    function handleToggleFill() {
        Globals.isFillEnabled = !Globals.isFillEnabled;
        appContext.toggleFill();
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

    function getManualEntryNode(entry: string, isHover: boolean): FillNode {
        let node = Globals.selectedWordNode!;
        let wordKey = Globals.selectedWordKey!;
        insertEntryIntoGrid(node, wordKey, entry, isHover ? ContentType.HoverChosenWord : ContentType.ChosenWord);
        return node;
    }

    function getManualSectionNode(sectionCandidateKey: string, isHover: boolean): FillNode {
        let grid = getGrid();

        let node = makeNewNode(grid, 0, false, undefined);
        let section = getSection();
        let candidate = section.candidates.get(sectionCandidateKey)!;
        insertSectionCandidateIntoGrid(node.endGrid, candidate, section, 
            isHover ? ContentType.HoverChosenSection : ContentType.ChosenSection);
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
        let node = getManualEntryNode(entry, false);

        updateManualEntryCandidates(node.endGrid);

        Globals.activeGrid = node.endGrid;
        updateSectionFilters();
        Globals.hoverGrid = undefined;
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
        let node = getManualEntryNode(entry, true);

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
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function handleSectionHover(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        let sectionId = +target.attributes["data-id"].value;
        Globals.hoverSectionId = sectionId;
        triggerUpdate();
    }

    function handleSectionBlur() {
        Globals.hoverSectionId = undefined;
        triggerUpdate();
    }

    function handleSectionChecked(event: any) {
        alert("checked");
    }

    function handleSectionCandidateClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        let section = getSection();
        let candidateKey = target.attributes["data-candidate-key"].value as string;
        let node = getManualSectionNode(candidateKey, false);
        Globals.selectedSectionCandidateKeys!.set(section.id, candidateKey);

        updateManualEntryCandidates(node.endGrid);

        Globals.activeGrid = node.endGrid;
        updateSectionFilters();
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function handleSectionCandidateHover(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        let candidateKey = target.attributes["data-candidate-key"].value as string;
        let node = getManualSectionNode(candidateKey, true);

        Globals.hoverGrid = node.endGrid;
        triggerUpdate();
    }

    function handleZerosBoxToggle() {
        setShowZeroEntries(!showZeroEntries);
    }

    function handleSectionCandidateBlur() {
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function handleFillWordClick(event: any) {
        fillSectionWord();
        triggerUpdate();
    }

    let grid = getGrid();
    let selectedSymmetry = SymmetryType[Globals.gridSymmetry!];
    let symmetryOptions = (!grid || grid.width === grid.height) ?
        Object.values(SymmetryType).filter(t => isNaN(Number(t))) :
        getSymmetryTypesForRectGrids();

    let fillStatus = getFillStatusString(Globals.fillStatus!);

    let entryCandidates = Globals.selectedWordNode ? Globals.selectedWordNode.entryCandidates : [];
    if (!showZeroEntries)
        entryCandidates = entryCandidates.filter(ec => ec.score > 0);
    let isNoEntryCandidates = Globals.selectedWordNode && entryCandidates.length === 0;
    let sections = [] as Section[];
    if (Globals.sections!) {
        let sectionsOrder = calculateSectionOrder(mapValues(Globals.sections!));
        sections = sectionsOrder.map(id => Globals.sections!.get(id)!);
    }
    let activeSection = Globals.sections ? Globals.sections!.get(Globals.activeSectionId!)! : makeNewSection(-1);
    let sectionCandidates = mapValues(activeSection.candidates).sort((a, b) => b.score - a.score);
    let selectedEntry = Globals.selectedWordKey ? getEntryAtWordKey(grid, Globals.selectedWordKey!) : "";
    let isFillEnabled = Globals.isFillEnabled;

    let entryCandidatesStyle = {
        gridTemplateColumns: `4fr 1fr 2fr`
    } as React.CSSProperties;

    let sectionsStyle = {
        gridTemplateColumns: `1fr 2fr 1fr 1fr 1fr`
    } as React.CSSProperties;

    let fillsStyle = {
        gridTemplateColumns: `4fr 1fr 2fr`
    } as React.CSSProperties;

    return (
        <div id="FillView" className="fill-container">
            <div style={{display: "none"}}>{props.updateSemaphoreProp}</div>
            <div className="custom-control custom-switch fill-switch">
                <input type="checkbox" className="custom-control-input" id="fillSwitch" 
                    checked={isFillEnabled} onChange={handleToggleFill} />
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
            <br /><br />
            <button className="btn btn-primary" onClick={handleFillWordClick}>Fill Word</button>

            <div className="fill-lists">
                <div className="fill-list-box">
                    <div className="fill-list-title">Word List Updates</div>
                    <div className="fill-list-button">Export</div>
                    <input type="text" className="fill-add-word-box" placeholder="Add word..."></input>
                    <div className="fill-list" style={{marginTop: "5px", height: "300px"}}>

                    </div>
                </div>
                <div className="fill-list-box" onMouseOut={handleEntryCandidateBlur}>
                    <div className="fill-list-title entry-color">Entry Candidates</div>
                    <div className="show-zeros-box">
                        <input type="checkbox" className="section-checkbox" id="zeros-box"
                                    checked={showZeroEntries} onChange={handleZerosBoxToggle} />
                        <label htmlFor="zeros-box">Show 0-score entries</label>
                    </div>
                    <div className="fill-list" style={entryCandidatesStyle}>
                        <div className="fill-list-header">Entry</div>
                        <div className="fill-list-header">Score</div>
                        <div className="fill-list-header">Iffy</div>
                        { isNoEntryCandidates && (
                            <div className="fill-list-row-wrapper">
                                <div><i>No viable entries</i></div><div></div><div></div>
                            </div>
                        )}
                        { entryCandidates.map(ec => (
                            <div className={"fill-list-row-wrapper" + (selectedEntry === ec.word ? " fill-list-row-selected" : "")} 
                                key={ec.word} data-word={ec.word}
                                onClick={handleEntryCandidateClick} onMouseOver={handleEntryCandidateHover}>
                                <div>{ec.word}</div>
                                <div>{ec.score.toFixed(0)}</div>
                                <div>{ec.iffyEntry || ""}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="fill-list-box" onMouseOut={handleSectionBlur}>
                    <div className="fill-list-title section-color">Sections</div>
                    <div className="fill-list" style={sectionsStyle}>
                        <div className="fill-list-header">Active</div>
                        <div className="fill-list-header">ID</div>
                        <div className="fill-list-header">Size</div>
                        <div className="fill-list-header">Conn</div>
                        <div className="fill-list-header">Can</div>
                        { sections.map(sec => (
                            <div className="fill-list-row-wrapper" key={sec.id} data-id={sec.id} 
                                onClick={handleSectionClick} onMouseOver={handleSectionHover}>
                                <div><input type="checkbox" className="section-checkbox"
                                    checked={Globals.selectedSectionIds!.has(sec.id)} onChange={handleSectionChecked} /></div>
                                <div>{getPhoneticName(sec.id)}</div>
                                <div>{sec.squares.size}</div>
                                <div>{sec.connections.size}</div>
                                <div>{sec.candidates.size}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="fill-list-box" onMouseOut={handleSectionCandidateBlur}>
                    <div className="fill-list-title">Fills</div>
                    <div className="fill-list" style={fillsStyle}>
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
                                <div>{sc.score.toFixed(2)}</div>
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
