import React, { useContext, useRef, useState } from 'react';
import { SymmetryType } from '../../models/SymmetryType';
import "./FillView.scss";
import Globals from '../../lib/windowService';
import { FillStatus } from '../../models/FillStatus';
import { adoptGridKeepingFills, getEntryAtWordKey, getGrid, getSection, mapKeys, mapValues } from '../../lib/util';
import { calculateSectionOrder, entriesFromSectionString, entryFromSectionString, getLongestStackWord, getPhoneticName, insertSectionCandidateIntoGrid, 
    makeNewSection, updateSectionFilters } from '../../lib/section';
import { clearFill, eraseSectionCandidateFromGrid, entriesFromGridString, gridFromString, insertEntryIntoGrid, longestEntryFromGridString, updateGridConstraintInfo, updateManualEntryCandidates } from '../../lib/grid';
import { fillSectionWord, makeNewNode } from '../../lib/fill';
import { ensureWordList, startFill, terminateFillWorkers } from '../../lib/fillWorkerPool';
import { cancelMake5x5, startMake5x5 } from '../../lib/make5x5';
import { FillNode } from '../../models/FillNode';
import { AppContext } from '../../AppContext';
import { ContentType } from '../../models/ContentType';
import { Section } from '../../models/Section';
import { processWordListData } from '../../lib/wordList';
import { SectionCandidate } from '../../models/SectionCandidate';
import ClassifyModal from './ClassifyModal';

/** Refresh fills list promptly while searching; throttle only to avoid per-fill thrash. */
const FILL_COUNT_UI_INTERVAL_MS = 100;

function FillView() {
    const appContext = useContext(AppContext);
    const [showSectionCandidates, setShowSectionCandidates] = useState(true);
    const [isWordListLoading, setIsWordListLoading] = useState(false);
    const [isFillRunning, setIsFillRunning] = useState(false);
    const [make5x5, setMake5x5] = useState(false);
    const [classifyFillWords, setClassifyFillWords] = useState<string[] | undefined>(undefined);
    const fillUiLastUpdateRef = useRef(0);

    function triggerUpdate() {
        appContext.triggerUpdate();
    }

    function setFillStatus(newStatus: FillStatus) {
        Globals.fillStatus = newStatus;
        triggerUpdate();
    }

    function handleToggleFill() {
        if (isFillRunning) {
            cancelMake5x5();
            setMake5x5(false);
            clearFill(getGrid());
            setFillStatus(FillStatus.Ready);
            setIsFillRunning(false);
            triggerUpdate();
        }
        else {
            // Fresh search each run; leave previously found fills unless user clears them.
            let section = getSection();
            section.fillState = undefined;
            fillUiLastUpdateRef.current = 0;
            setFillStatus(FillStatus.Running);
            setIsFillRunning(true);

            startFill({
                grid: getGrid(),
                section,
                onProgress: () => {
                    const now = performance.now();
                    if (now - fillUiLastUpdateRef.current >= FILL_COUNT_UI_INTERVAL_MS) {
                        fillUiLastUpdateRef.current = now;
                        // Use context method directly — stable functional setState in App.
                        appContext.triggerUpdate();
                    }
                },
                onComplete: () => {
                    clearFill(getGrid());
                    Globals.fillStatus = FillStatus.Complete;
                    setIsFillRunning(false);
                    appContext.triggerUpdate();
                },
            });
        }
    }

    function handleMake5x5Toggle() {
        if (make5x5) {
            cancelMake5x5();
            setMake5x5(false);
            setIsFillRunning(false);
            setFillStatus(Globals.wordList ? FillStatus.Ready : FillStatus.NoWordList);
            triggerUpdate();
            return;
        }

        setMake5x5(true);
        fillUiLastUpdateRef.current = 0;
        setFillStatus(FillStatus.Running);
        setIsFillRunning(true);

        const started = startMake5x5({
            onProgress: () => {
                const now = performance.now();
                if (now - fillUiLastUpdateRef.current >= FILL_COUNT_UI_INTERVAL_MS) {
                    fillUiLastUpdateRef.current = now;
                    appContext.triggerUpdate();
                }
            },
            onComplete: () => {
                setIsFillRunning(false);
                appContext.triggerUpdate();
            },
            onNoSeed: () => {
                setMake5x5(false);
                setIsFillRunning(false);
                setFillStatus(FillStatus.Ready);
                window.alert("No 5-letter Maybe Gettable / Prefer entries found in the word list.");
                appContext.triggerUpdate();
            },
        });

        if (!started) {
            setIsFillRunning(false);
        }
        triggerUpdate();
    }

    function handleFillWordClick(event: any) {
        if (!Globals.wordList) return;

        if (!fillSectionWord()) {
            clearFill(getGrid());
            setFillStatus(FillStatus.Complete);
        }
        triggerUpdate();
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
            case FillStatus.NoWordList: return "No Word List Loaded";
            case FillStatus.Ready: return "Ready to Fill";
            case FillStatus.Running: return "Fill Running...";
            case FillStatus.Complete: return "Fill Complete";
            default: return "";
        }
    }

    function getManualEntryNode(entry: string, isHover?: boolean): FillNode {
        let node = Globals.selectedWordNode!;
        let wordKey = Globals.selectedWordKey!;
        insertEntryIntoGrid(node, wordKey, entry, isHover ? ContentType.HoverChosenWord : ContentType.ChosenWord);
        return node;
    }

    function getManualSectionNode(sectionCandidateKey: string, isHover: boolean): FillNode {
        let grid = getGrid();

        let section = getSection();
        let candidate = section.candidates.get(sectionCandidateKey)!;
        if (!candidate) {
            let node = makeNewNode(grid, 0);
            return node;
        }
        if (candidate.gridString) {
            let filled = gridFromString(candidate.gridString);
            return {
                startGrid: filled,
                endGrid: filled,
                entryCandidates: [],
                candidateIndex: 0,
                depth: 0,
            } as FillNode;
        }

        let node = makeNewNode(grid, 0);
        insertSectionCandidateIntoGrid(node.endGrid, candidate, 
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
            if (target.classList[0] === "section-checkbox") return;
            target = target.parentElement;
            if (!target) return;
        }

        let sectionId = +target.attributes["data-id"].value;
        clearFill(getGrid());

        if (sectionId === Globals.activeSectionId!) {
            Globals.activeSectionId = 0;
            Globals.selectedSectionIds = new Map<number, boolean>();
            Globals.selectedSectionIds!.set(sectionId, true);
        }
        else {
            Globals.activeSectionId = sectionId;
            Globals.selectedSectionIds = new Map<number, boolean>();
            Globals.selectedSectionIds!.set(sectionId, true);
        }

        Globals.hoverGrid = undefined;
        Globals.hoverSectionId = undefined;
        triggerUpdate();
    }

    function handleSectionCheckClick(event: any) {
        return;
        // let target = event.target;
        // while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
        //     target = target.parentElement;
        //     if (!target) return;
        // }

        // let sectionId = +target.attributes["data-id"].value;
        // if (Globals.selectedSectionIds!.get(sectionId))
        //     Globals.selectedSectionIds!.delete(sectionId);
        // else
        //     Globals.selectedSectionIds!.set(sectionId, true);
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
        function eraseSc() {
            section.selectedCandidate = undefined;
            let sc = section.candidates.get(candidateKey)!;
            eraseSectionCandidateFromGrid(grid, sc);
            clearFill(grid);
        }

        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        let section = getSection();
        let grid = getGrid();
        let candidateKey = target.attributes["data-candidate-key"].value as string;

        if (section.selectedCandidate === candidateKey) {
            eraseSc();
        }
        else {
            if (section.selectedCandidate) eraseSc();

            let node = getManualSectionNode(candidateKey, false);
            Globals.selectedSectionCandidateKeys!.set(section.id, candidateKey);
            section.selectedCandidate = candidateKey;

            updateManualEntryCandidates(node.endGrid);

            if (section.candidates.get(candidateKey)?.gridString) {
                adoptGridKeepingFills(node.endGrid);
                let adopted = getSection();
                adopted.selectedCandidate = candidateKey;
                Globals.selectedSectionCandidateKeys!.set(adopted.id, candidateKey);
            } else {
                Globals.activeGrid = node.endGrid;
            }
        }
        
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

    function handleClassifyClick(event: any) {
        event.preventDefault();
        event.stopPropagation();
        let section = getSection();
        if (!section.selectedCandidate) return;
        let sc = section.candidates.get(section.selectedCandidate);
        if (sc?.gridString) {
            setClassifyFillWords(entriesFromGridString(sc.gridString));
        } else {
            setClassifyFillWords(entriesFromSectionString(section, section.selectedCandidate));
        }
    }

    function clearSectionCandidates() {
        if (!window.confirm("Are you sure you want to clear the fills?")) return;

        let section = getSection();
        section.candidates = new Map<string, SectionCandidate>();
        section.selectedCandidate = undefined;
        triggerUpdate();
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

        terminateFillWorkers();
        cancelMake5x5();
        setMake5x5(false);
        setIsFillRunning(false);
        Globals.wordList = undefined;
        Globals.wordLists = [];
        Globals.knownWords = new Set<string>();
        Globals.wordGettable = undefined;
        Globals.wordDesirability = undefined;
        Globals.likelyGettableSet = undefined;
        ensureWordList(undefined, undefined);
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
                    ensureWordList(Globals.wordList, Globals.knownWords);
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

    let grid = getGrid();
    let selectedSymmetry = SymmetryType[Globals.gridSymmetry!];
    let symmetryOptions = (!grid || grid.width === grid.height) ?
        Object.values(SymmetryType).filter(t => isNaN(Number(t))) :
        getSymmetryTypesForRectGrids();

    let fillStatusStr = getFillStatusString(Globals.fillStatus!);
    
    let wordLists = Globals.wordLists || [];

    let entryCandidates = Globals.selectedWordNode ? Globals.selectedWordNode.entryCandidates : [];
    let isNoEntryCandidates = Globals.selectedWordNode && entryCandidates.length === 0;

    let sections = [] as Section[];
    if (Globals.sections!) {
        let sectionsOrder = calculateSectionOrder(mapValues(Globals.sections!));
        sections = sectionsOrder.map(id => Globals.sections!.get(id)!);
    }
    let activeSection = Globals.sections ? Globals.sections!.get(Globals.activeSectionId!)! : makeNewSection(-1);
    let selectedScKey = activeSection.selectedCandidate;
    let selectedSectionIds = mapKeys(Globals.selectedSectionIds!) || [0];
    let sectionCandidates = mapValues(activeSection.candidates)
        .filter(sc => !sc.isFilteredOut).sort((a, b) => b.score - a.score);
    let selectedEntry = Globals.selectedWordKey ? getEntryAtWordKey(grid, Globals.selectedWordKey!) : "";
    let useManualHeuristics = Globals.useManualHeuristics !== undefined ? Globals.useManualHeuristics : true;

    let wordListsStyle = {
        gridTemplateColumns: `4fr 1fr`
    } as React.CSSProperties;

    let entryCandidatesStyle = {
        gridTemplateColumns: `4fr 1fr`
    } as React.CSSProperties;

    let sectionsStyle = {
        gridTemplateColumns: `1fr 2fr 1fr 1fr 1fr`
    } as React.CSSProperties;

    let fillsStyle = {
        gridTemplateColumns: `4fr 1fr`
    } as React.CSSProperties;

    return (
        <div id="FillView" className="fill-container">
            <input id="open-wordlist-input" className="d-none" type="file" accept=".csv" onChange={onWordListUpload} />
            <div id="loader" style={{display: isWordListLoading ? "block" : "none"}}></div>

            <div className={"fill-status" +
                (Globals.fillStatus! === FillStatus.NoWordList ? " fill-status-red" :
                Globals.fillStatus! === FillStatus.Running ? " fill-status-green" : "")}>{fillStatusStr}</div>
            {wordLists.length > 0 &&
            <>
                <div className="form-check form-switch fill-switch">
                    <input type="checkbox" className="form-check-input" id="fillSwitch" 
                        checked={isFillRunning} onChange={handleToggleFill} />
                    <label className="form-check-label" htmlFor="fillSwitch">Fill</label>
                </div>
                {grid.width === 5 && grid.height === 5 &&
                <div className="form-check form-switch fill-switch">
                    <input type="checkbox" className="form-check-input" id="make5x5Switch"
                        checked={make5x5} onChange={handleMake5x5Toggle} />
                    <label className="form-check-label" htmlFor="make5x5Switch">Make 5x5</label>
                </div>
                }
                <br />
            </>
            }
            
            <br /><br />
            Grid Symmetry: <br />
            <select className="form-select symmetry-select" defaultValue={selectedSymmetry} onChange={handleSymmetryChange}>
                {symmetryOptions.map(type => (
                    <option value={type} key={type}>{getSymmetryTypeString(type.toString())}</option>
                ))}
            </select>
            <br /><br />
            <button className="btn btn-primary" onClick={handleFillWordClick} style={{display: "none"}}>Fill Word</button>

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
                        { isNoEntryCandidates && useManualHeuristics && (
                            <div className="fill-list-row-wrapper">
                                <div><i>No viable entries</i></div><div></div>
                            </div>
                        )}
                        { entryCandidates.map(ec => (
                            <div className={"fill-list-row-wrapper" + (selectedEntry === ec.word ? " fill-list-row-selected" : "")} 
                                key={ec.word} data-word={ec.word}
                                onClick={handleEntryCandidateClick} onMouseOver={handleEntryCandidateHover}>
                                <div>{ec.word}</div>
                                <div>{ec.score.toFixed(0)}</div>
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
                                    checked={selectedSectionIds.includes(sec.id)} onChange={handleSectionCheckClick} /></div>
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
                    <div className="fill-list-button" onClick={clearSectionCandidates}>Clear</div>
                    <div className="fill-sec-checkbox">
                        {selectedScKey && (
                            <button type="button" className="fill-classify-button" onClick={handleClassifyClick}>Classify</button>
                        )}
                        <input type="checkbox" className="section-checkbox" id="show-fills-box"
                                    checked={showSectionCandidates} onChange={handleShowSectionCandidatesToggle} />
                        <label htmlFor="show-fills-box">Show</label>
                    </div>
                    <div className="fill-list" style={fillsStyle}>
                        <div className="fill-list-header">Longest</div>
                        <div className="fill-list-header">Score</div>
                        {!showSectionCandidates && (
                            <div className="fill-list-row-wrapper">
                                <div><i>Hidden</i></div><div></div>
                            </div>
                        )}
                        {showSectionCandidates && Globals.fillStatus === FillStatus.Complete && sectionCandidates.length === 0 && (
                            <div className="fill-list-row-wrapper">
                                <div><i>No fills found</i></div><div></div>
                            </div>
                        )}
                        {showSectionCandidates && sectionCandidates.map(sc => {
                            let entry = sc.gridString
                                ? longestEntryFromGridString(sc.gridString)
                                : entryFromSectionString(activeSection, sc.sectionString, getLongestStackWord(activeSection));
                            let candidateKey = sc.gridString || sc.sectionString;

                            return (
                            <div className={"fill-list-row-wrapper" + (selectedScKey === candidateKey ? " fill-list-row-selected" : "")}
                                key={candidateKey} data-candidate-key={candidateKey}
                                onClick={handleSectionCandidateClick} onMouseOver={handleSectionCandidateHover}>
                                <div>{entry}</div>
                                <div>{sc.score.toFixed(2)}</div>
                            </div>
                        )})}
                    </div>
                </div>
            </div>
            {classifyFillWords && (
                <ClassifyModal
                    fillWords={classifyFillWords}
                    onClose={() => setClassifyFillWords(undefined)}
                    onSaved={triggerUpdate}
                />
            )}
        </div>
    );
}

export default FillView;
