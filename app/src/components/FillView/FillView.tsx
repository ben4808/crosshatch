import React, { useContext, useEffect, useState } from 'react';
import { SymmetryType } from '../../models/SymmetryType';
import "./FillView.scss";
import Globals from '../../lib/windowService';
import { FillStatus } from '../../models/FillStatus';
import { getEntryAtWordKey, getGrid, getSection, getSquaresForWord, mapKeys, mapValues } from '../../lib/util';
import { calculateSectionOrder, getLongestStackWord, getPhoneticName, insertSectionCandidateIntoGrid, 
    makeNewSection, sectionCandidateKey, updateSectionFilters } from '../../lib/section';
import { clearFill, getLettersFromSquares, insertEntryIntoGrid, updateGridConstraintInfo, updateManualEntryCandidates } from '../../lib/grid';
import { fillSectionWord, makeNewNode } from '../../lib/fill';
import { FillNode } from '../../models/FillNode';
import { AppContext } from '../../AppContext';
import { ContentType } from '../../models/ContentType';
import { Section } from '../../models/Section';
import { processWordListData } from '../../lib/wordList';
import { useInterval } from '../../lib/useInterval';

function FillView() {
    const appContext = useContext(AppContext);
    const [showSectionCandidates, setShowSectionCandidates] = useState(true);
    const [isWordListLoading, setIsWordListLoading] = useState(false);
    const [fillStatus, setFillStatus] = useState(FillStatus.NoWordList);
    const [isFillRunning, setIsFillRunning] = useState(false);

    useEffect(() => {
        if (Globals.wordList) setFillStatus(FillStatus.Ready);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function triggerUpdate() {
        appContext.triggerUpdate();
    }

    function handleToggleFill() {
        if (fillStatus === FillStatus.Complete) return;

        if (isFillRunning) {
            clearFill(getGrid());
            setFillStatus(FillStatus.Ready);
            setIsFillRunning(false);
            triggerUpdate();
        }
        else {
            setFillStatus(FillStatus.Running);
            setIsFillRunning(true);
        }
    }
    
    function doFillWord() {
        if (!fillSectionWord()) {
            clearFill(getGrid());
            setFillStatus(FillStatus.Complete);
            setIsFillRunning(false);
        }
        triggerUpdate();
    }

    function handleFillWordClick(event: any) {
        if (!Globals.wordList) return;

        fillSectionWord();
        triggerUpdate();
    }

    function handleSymmetryChange(event: any) {
        Globals.gridSymmetry = +SymmetryType[event.target[event.target.selectedIndex].value] as SymmetryType;
    }

    function handleIffyLengthChange(event: any) {
        Globals.maxIffyLength = +event.target[event.target.selectedIndex].value;
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
            case FillStatus.NoWordList: return "No Word List Loaded";
            case FillStatus.Ready: return "Ready to Fill";
            case FillStatus.Running: return "Fill Running...";
            case FillStatus.Complete: return "Fill Complete";
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
        if (Globals.selectedSectionIds!.get(sectionId)) {
            Globals.selectedSectionIds!.delete(sectionId);
            Globals.activeSectionId = 0;
        }
        else {
            Globals.selectedSectionIds!.set(sectionId, true);
            Globals.activeSectionId = sectionId;
        }

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

    function handleShowSectionCandidatesToggle() {
        setShowSectionCandidates(!showSectionCandidates);
    }

    function handleUseHeuristicsToggle() {
        let newValue = Globals.useManualHeuristics !== undefined ? !Globals.useManualHeuristics! : false;
        Globals.useManualHeuristics = newValue;

        triggerUpdate();
        let node = Globals.selectedWordNode;
        if (!node) return;

        updateManualEntryCandidates(grid);
    }

    function handleSectionCandidateBlur() {
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function loadWordList() {
        document.getElementById("open-wordlist-input")!.click();
    }

    function clearWordLists() {
        if (!window.confirm("Are you sure you want to clear the word lists?")) return;

        Globals.wordList = undefined;
        Globals.wordLists = [];
        setFillStatus(FillStatus.NoWordList);
        Globals.selectedWordNode = undefined;
    }

    function onWordListUpload(event: any) {
        let file = event.target.files[0];
        event.target.value = null;
        setIsWordListLoading(true);

        setTimeout(() => {
            processWordListData(file.name, file).then(wordList => {
                if (wordList) {
                    Globals.wordLists!.push(wordList);
                    setFillStatus(FillStatus.Ready);
                    let grid = getGrid();
                    updateGridConstraintInfo(grid);
                    updateManualEntryCandidates(grid);
                    setIsWordListLoading(false);
                    triggerUpdate();
                }
            });
        }, 5);
    }

    useInterval(() => {
        doFillWord();
    }, isFillRunning ? 5 : null);

    let grid = getGrid();
    let selectedSymmetry = SymmetryType[Globals.gridSymmetry!];
    let symmetryOptions = (!grid || grid.width === grid.height) ?
        Object.values(SymmetryType).filter(t => isNaN(Number(t))) :
        getSymmetryTypesForRectGrids();

    let fillStatusStr = getFillStatusString(fillStatus);
    
    let wordLists = Globals.wordLists || [];

    let entryCandidates = Globals.selectedWordNode ? Globals.selectedWordNode.entryCandidates : [];
    let isNoEntryCandidates = Globals.selectedWordNode && entryCandidates.length === 0;

    let sections = [] as Section[];
    if (Globals.sections!) {
        let sectionsOrder = calculateSectionOrder(mapValues(Globals.sections!));
        sections = sectionsOrder.map(id => Globals.sections!.get(id)!);
    }
    let activeSection = Globals.sections ? Globals.sections!.get(Globals.activeSectionId!)! : makeNewSection(-1);
    let selectedSectionIds = mapKeys(Globals.selectedSectionIds!) || [0];
    let sectionCandidates = mapValues(activeSection.candidates).sort((a, b) => b.score - a.score);
    let selectedEntry = Globals.selectedWordKey ? getEntryAtWordKey(grid, Globals.selectedWordKey!) : "";
    let selectedMaxIffyLength = Globals.maxIffyLength || 0;
    let useManualHeuristics = Globals.useManualHeuristics !== undefined ? Globals.useManualHeuristics : true;

    let wordListsStyle = {
        gridTemplateColumns: `4fr 1fr`
    } as React.CSSProperties;

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
            <input id="open-wordlist-input" hidden type="file" accept=".dict,.txt" onChange={onWordListUpload} />
            <div id="loader" style={{display: isWordListLoading ? "block" : "none"}}></div>

            <div className={"fill-status" +
                (fillStatus === FillStatus.NoWordList ? " fill-status-red" :
                fillStatus === FillStatus.Running ? " fill-status-green" : "")}>{fillStatusStr}</div>
            {wordLists.length > 0 &&
            <>
                <div className="custom-control custom-switch fill-switch">
                    <input type="checkbox" className="custom-control-input" id="fillSwitch" 
                        checked={isFillRunning} onChange={handleToggleFill} />
                    <label className="custom-control-label" htmlFor="fillSwitch">Fill</label>
                </div>
                <br />
                Max Iffy Length: <br />
                <select className="custom-select iffy-select" defaultValue={selectedMaxIffyLength} onChange={handleIffyLengthChange}>
                    <option value={0} key={0}>Off</option>
                    {[2, 3, 4, 5, 6, 7].map(length => (
                        <option value={length} key={length}>{length}</option>
                    ))}
                </select>
            </>
            }
            
            <br /><br />
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
                    <div className="fill-list-title">Word Lists</div>
                    <div className="fill-list-button" onClick={clearWordLists}>Clear</div>
                    <div className="fill-list-button" onClick={loadWordList}>Load</div>
                    <div className="fill-list" style={wordListsStyle}>
                        <div className="fill-list-header">Filename</div>
                        <div className="fill-list-header">Count</div>
                        { wordLists.length === 0 && (
                            <div className="fill-list-row-wrapper" style={{cursor: "auto"}}>
                                <div><i>No word lists loaded</i></div><div></div>
                            </div>
                        )}
                        { wordLists.map(wl => (
                            <div className="fill-list-row-wrapper" style={{cursor: "auto"}} key={wl.filename}>
                                <div>{wl.filename}</div>
                                <div>{wl.wordCount}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="fill-list-box" onMouseOut={handleEntryCandidateBlur}>
                    <div className="fill-list-title entry-color">Entry Candidates</div>
                    <div className="fill-sec-checkbox">
                        <input type="checkbox" className="section-checkbox" id="use-heuristics-box"
                                    checked={useManualHeuristics} onChange={handleUseHeuristicsToggle} />
                        <label htmlFor="use-heuristics-box">Use heuristics</label>
                    </div>
                    <div className="fill-list" style={entryCandidatesStyle}>
                        <div className="fill-list-header">Entry</div>
                        <div className="fill-list-header">Score</div>
                        <div className="fill-list-header">Iffy</div>
                        { isNoEntryCandidates && useManualHeuristics && (
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
                        <div className="fill-list-header">Fills</div>
                        { sections.map(sec => (
                            <div className={"fill-list-row-wrapper" + (sec.id === activeSection.id ? " fill-list-row-selected" : "")} 
                                key={sec.id} data-id={sec.id} onClick={handleSectionClick} onMouseOver={handleSectionHover}>
                                <div><input type="checkbox" className="section-checkbox"
                                    checked={selectedSectionIds.includes(sec.id)} onChange={handleSectionClick} /></div>
                                <div>{getPhoneticName(sec.id)}</div>
                                <div>{sec.squares.size}</div>
                                <div>{sec.connections.size}</div>
                                <div>{sec.candidates.size}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="fill-list-box" onMouseOut={handleSectionCandidateBlur}>
                    <div className="fill-list-title">Fills {sectionCandidates.length > 0 ? `(${sectionCandidates.length})` : ""}</div>
                    <div className="fill-sec-checkbox">
                        <input type="checkbox" className="section-checkbox" id="show-fills-box"
                                    checked={showSectionCandidates} onChange={handleShowSectionCandidatesToggle} />
                        <label htmlFor="show-fills-box">Show</label>
                    </div>
                    <div className="fill-list" style={fillsStyle}>
                        <div className="fill-list-header">Longest</div>
                        <div className="fill-list-header">Score</div>
                        <div className="fill-list-header">Iffy</div>
                        {!showSectionCandidates && (
                            <div className="fill-list-row-wrapper">
                                <div><i>Hidden</i></div><div></div><div></div>
                            </div>
                        )}
                        {showSectionCandidates && sectionCandidates.map(sc => {
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
